-- Multi-location businesses, part 5 (spec 2026-10-15): hand-off and take-back.
--
-- * member_invites.role may be 'owner' -- only for a hand-off, written by
--   hand_off_location (the Worker's People store still writes editor and
--   media_events invites only).
-- * hand_off_location: the business manager (or a Guild admin) invites
--   someone to manage one location. One open hand-off per location; the
--   same address is refreshed (no sooner than 5 minutes after the last
--   send); an open editor invite to that address becomes the hand-off.
-- * accept_location_handoff: run by the Worker (service role) when the
--   invitee signs in. In one transaction the business manager's link
--   becomes editor and the invitee becomes owner. A hand-off that no
--   longer fits (business switched, location taken back or owned by
--   someone else) is canceled instead.
-- * take_back_location: the business manager (or a Guild admin) removes
--   the location manager and owns the location again.

alter table public.member_invites drop constraint member_invites_role_check;
alter table public.member_invites add constraint member_invites_role_check
  check (role in ('owner', 'editor', 'media_events'));

-- Audit with an explicit actor: accept runs on the service role, where
-- auth.uid() is null. Nothing is written without an actor (audit_log
-- requires one).
create or replace function public._business_audit_as(p_actor uuid, p_member_id uuid, p_table text, p_row_id uuid, p_action text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
  select p_actor, p_member_id, p_table, p_row_id, p_action
  where p_actor is not null;
$$;
revoke all on function public._business_audit_as(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- A location leaving its manager (the business switched to separate, or
-- the location left the business): where it was handed off, the business
-- manager's link goes; a pending hand-off is canceled. A location the
-- manager owns stays theirs.
create or replace function public._release_location_from_manager(p_member_id uuid, p_manager uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.member_users
    where member_id = p_member_id and role = 'owner' and user_id <> p_manager
  ) then
    delete from public.member_users where member_id = p_member_id and user_id = p_manager;
    if found then
      perform public._business_audit_as(auth.uid(), p_member_id, 'member_users', p_member_id, 'delete');
    end if;
  end if;
  update public.member_invites set cancelled_at = now()
  where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null;
  if found then
    perform public._business_audit_as(auth.uid(), p_member_id, 'member_invites', p_member_id, 'update');
  end if;
end;
$$;
revoke all on function public._release_location_from_manager(uuid, uuid) from public, anon, authenticated;

create or replace function public.hand_off_location(p_member_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_member public.members;
  v_business public.businesses;
  v_owner uuid;
  v_manager_email text;
  v_open public.member_invites;
  v_invite_id uuid;
  v_refreshed boolean := false;
begin
  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'That location no longer exists';
  end if;
  select * into v_business from public.businesses where id = v_member.business_id for update;
  if not found or v_business.management_mode <> 'one_manager' or v_business.manager_user_id is null then
    raise exception 'Only a location of a business with one manager can be handed off.';
  end if;
  if auth.uid() is distinct from v_business.manager_user_id and not public.is_guild_admin() then
    raise exception 'Only the business manager can hand off a location.' using errcode = '42501';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  select user_id into v_owner from public.member_users where member_id = p_member_id and role = 'owner';
  if v_owner is not null and v_owner <> v_business.manager_user_id then
    raise exception '% · % is already handed off. Take it back first.', v_business.name, v_member.city;
  end if;
  select lower(btrim(email)) into v_manager_email from auth.users where id = v_business.manager_user_id;
  if v_email = v_manager_email then
    raise exception 'You already manage this location.';
  end if;

  select * into v_open from public.member_invites
  where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null
  for update;
  if found and lower(v_open.email) <> v_email then
    raise exception 'A hand-off to % is already waiting. Cancel it first.', v_open.email;
  end if;
  if not found then
    -- One open invite per address per location: an editor invite to this
    -- address becomes the hand-off.
    select * into v_open from public.member_invites
    where member_id = p_member_id and lower(email) = v_email and accepted_at is null and cancelled_at is null
    for update;
  end if;

  if v_open.id is not null then
    if v_open.role = 'owner' and v_open.updated_at > now() - interval '5 minutes' then
      raise exception 'An invite just went to %. You can send it again in a few minutes.', v_open.email;
    end if;
    update public.member_invites
    set role = 'owner', expires_at = now() + interval '14 days', invited_by_user_id = auth.uid()
    where id = v_open.id;
    v_invite_id := v_open.id;
    v_refreshed := true;
  else
    insert into public.member_invites (member_id, email, role, invited_by_user_id)
    values (p_member_id, v_email, 'owner', auth.uid())
    returning id into v_invite_id;
  end if;

  perform public._business_audit(p_member_id, 'member_invites', v_invite_id,
    case when v_refreshed then 'update' else 'insert' end);
  return jsonb_build_object('invite_id', v_invite_id, 'email', v_email, 'refreshed', v_refreshed);
end;
$$;

create or replace function public.accept_location_handoff(p_invite_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.member_invites;
  v_member public.members;
  v_business public.businesses;
  v_user_email text;
begin
  select * into v_invite from public.member_invites where id = p_invite_id for update;
  if not found or v_invite.role <> 'owner' or v_invite.accepted_at is not null
     or v_invite.cancelled_at is not null or v_invite.expires_at <= now() then
    return false;
  end if;
  select lower(btrim(email)) into v_user_email from auth.users where id = p_user_id;
  if v_user_email is distinct from lower(btrim(v_invite.email)) then
    return false;
  end if;

  select * into v_member from public.members where id = v_invite.member_id;
  select * into v_business from public.businesses where id = v_member.business_id for update;
  if not found
     or v_business.management_mode <> 'one_manager'
     or v_business.manager_user_id is null
     or v_business.manager_user_id = p_user_id
     or exists (
       select 1 from public.member_users
       where member_id = v_member.id and role = 'owner' and user_id <> v_business.manager_user_id
     ) then
    update public.member_invites set cancelled_at = now() where id = p_invite_id;
    return false;
  end if;

  -- Demote before promoting: one owner per location.
  update public.member_users set role = 'editor'
  where member_id = v_member.id and user_id = v_business.manager_user_id;
  if not found then
    insert into public.member_users (member_id, user_id, role)
    values (v_member.id, v_business.manager_user_id, 'editor');
  end if;
  insert into public.member_users (member_id, user_id, role)
  values (v_member.id, p_user_id, 'owner')
  on conflict (member_id, user_id) do update set role = 'owner';

  update public.member_invites set accepted_at = now(), accepted_user_id = p_user_id where id = p_invite_id;
  perform public._business_audit_as(p_user_id, v_member.id, 'member_users', v_member.id, 'update');
  return true;
end;
$$;

create or replace function public.take_back_location(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_business public.businesses;
  v_owner uuid;
begin
  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'That location no longer exists';
  end if;
  select * into v_business from public.businesses where id = v_member.business_id for update;
  if not found or v_business.management_mode <> 'one_manager' or v_business.manager_user_id is null then
    raise exception 'Only a location of a business with one manager can be taken back.';
  end if;
  if auth.uid() is distinct from v_business.manager_user_id and not public.is_guild_admin() then
    raise exception 'Only the business manager can take back a location.' using errcode = '42501';
  end if;

  select user_id into v_owner from public.member_users where member_id = p_member_id and role = 'owner';
  if v_owner is null or v_owner = v_business.manager_user_id then
    raise exception '% · % isn''t handed off.', v_business.name, v_member.city;
  end if;

  delete from public.member_users where member_id = p_member_id and user_id = v_owner;
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'delete');
  update public.member_users set role = 'owner'
  where member_id = p_member_id and user_id = v_business.manager_user_id;
  if not found then
    insert into public.member_users (member_id, user_id, role)
    values (p_member_id, v_business.manager_user_id, 'owner');
  end if;
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');

  update public.member_invites set cancelled_at = now()
  where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null;
end;
$$;

revoke all on function public.hand_off_location(uuid, text) from public, anon;
revoke all on function public.take_back_location(uuid) from public, anon;
revoke all on function public.accept_location_handoff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hand_off_location(uuid, text) to authenticated;
grant execute on function public.take_back_location(uuid) to authenticated;
grant execute on function public.accept_location_handoff(uuid, uuid) to service_role;
