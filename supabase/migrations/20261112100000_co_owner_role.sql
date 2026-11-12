-- Co-owner (spec 2026-11-12-co-owner-design): a member may have co-owners
-- besides its one owner. A co-owner edits everything a full editor does and
-- has the owner's calendar, kitchen and support-request rights; only the
-- owner (or the Guild) manages co-owners, and nobody but the Guild changes
-- the owner. Additive only: the live code never writes 'co_owner', so it
-- keeps working unchanged.
--
-- * member_users.role and member_invites.role may be 'co_owner'. The
--   one-owner index (member_users_one_owner_per_member) is untouched.
-- * is_member_owner_level(): owner, co-owner or Guild admin. Used where
--   "owner only" was checked before (calendar connections, kitchen switch).
-- * Hand-off and take-back turn the location's co-owners into full editors
--   and cancel its pending co-owner invites (_demote_co_owners): a new
--   location owner picks their own co-owners.

alter table public.member_users
  drop constraint member_users_role_check,
  add constraint member_users_role_check check (role in ('owner', 'co_owner', 'editor', 'media_events'));

alter table public.member_invites drop constraint member_invites_role_check;
alter table public.member_invites add constraint member_invites_role_check
  check (role in ('owner', 'co_owner', 'editor', 'media_events'));

-- Owner, co-owner or Guild admin (Edit as them acts with owner rights).
create or replace function public.is_member_owner_level(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_guild_admin()
    or coalesce(public.member_role(target_member_id) in ('owner', 'co_owner'), false);
$$;
revoke execute on function public.is_member_owner_level(uuid) from public, anon;
grant execute on function public.is_member_owner_level(uuid) to authenticated;

-- Owner, co-owner, full editor or Guild admin.
create or replace function public.is_member_full_editor(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_guild_admin()
    or coalesce(public.member_role(target_member_id) in ('owner', 'co_owner', 'editor'), false);
$$;
revoke execute on function public.is_member_full_editor(uuid) from public, anon;
grant execute on function public.is_member_full_editor(uuid) to authenticated;

-- The owner and co-owners connect or disconnect the member's calendars.
drop policy "calendar_connections: owners can manage their own" on public.calendar_connections;
create policy "calendar_connections: owners can manage their own"
  on public.calendar_connections for all to authenticated
  using (public.is_member_owner_level(member_id))
  with check (public.is_member_owner_level(member_id));

create or replace function public.set_member_has_kitchen(p_member_id uuid, p_has_kitchen boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if not public.is_member_owner_level(p_member_id) then
    raise exception 'Only the profile''s owner or a co-owner can change this.' using errcode = '42501';
  end if;
  select member_type into v_type from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_type <> 'producer' then
    raise exception 'Only producers have a kitchen switch.' using errcode = '22023';
  end if;
  update public.members set has_kitchen = coalesce(p_has_kitchen, false) where id = p_member_id;
  return coalesce(p_has_kitchen, false);
end;
$$;
revoke execute on function public.set_member_has_kitchen(uuid, boolean) from public, anon;
grant execute on function public.set_member_has_kitchen(uuid, boolean) to authenticated;

-- Owner, co-owner and full editor read and file support requests; the
-- Photos & events editor still doesn't.
drop policy "support_requests: owners and editors can read their own" on public.support_requests;
drop policy "support_requests: owners and editors can insert their own" on public.support_requests;
create policy "support_requests: owners and editors can read their own"
  on public.support_requests for select to authenticated
  using (coalesce(public.member_role(member_id) in ('owner', 'co_owner', 'editor'), false));
create policy "support_requests: owners and editors can insert their own"
  on public.support_requests for insert to authenticated
  with check (
    coalesce(public.member_role(member_id) in ('owner', 'co_owner', 'editor'), false)
    and requested_by_user_id = auth.uid()
    and status = 'open'
    and handled_by_user_id is null
    and handled_at is null
  );

-- A location changing owner (hand-off or take-back): its co-owners become
-- full editors and its pending co-owner invites are canceled. p_actor is
-- the user making the change (accept runs on the service role, where
-- auth.uid() is null).
create or replace function public._demote_co_owners(p_member_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
begin
  update public.member_users set role = 'editor'
  where member_id = p_member_id and role = 'co_owner';
  if found then
    perform public._business_audit_as(p_actor, p_member_id, 'member_users', p_member_id, 'update');
  end if;
  for v_invite_id in
    update public.member_invites set cancelled_at = now()
    where member_id = p_member_id and role = 'co_owner' and accepted_at is null and cancelled_at is null
    returning id
  loop
    perform public._business_audit_as(p_actor, p_member_id, 'member_invites', v_invite_id, 'update');
  end loop;
end;
$$;
revoke all on function public._demote_co_owners(uuid, uuid) from public, anon, authenticated, service_role;

-- From 20261018100000_location_handoff.sql, plus _demote_co_owners.
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
    perform public._business_audit_as(p_user_id, v_member.id, 'member_invites', p_invite_id, 'update');
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
  perform public._demote_co_owners(v_member.id, p_user_id);

  update public.member_invites set accepted_at = now(), accepted_user_id = p_user_id where id = p_invite_id;
  perform public._business_audit_as(p_user_id, v_member.id, 'member_users', v_member.id, 'update');
  return true;
end;
$$;

-- From 20261018100000_location_handoff.sql, plus _demote_co_owners.
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
  v_invite_id uuid;
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
  -- With no owner left (the location manager's account is gone), a business
  -- manager still linked as editor/media_events is raised to owner; anything
  -- else is not a hand-off.
  if v_owner = v_business.manager_user_id
     or (v_owner is null and not exists (
       select 1 from public.member_users
       where member_id = p_member_id and user_id = v_business.manager_user_id
     )) then
    raise exception '% · % isn''t handed off.', v_business.name, v_member.city;
  end if;

  if v_owner is not null then
    delete from public.member_users where member_id = p_member_id and user_id = v_owner;
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'delete');
  end if;
  update public.member_users set role = 'owner'
  where member_id = p_member_id and user_id = v_business.manager_user_id;
  if not found then
    insert into public.member_users (member_id, user_id, role)
    values (p_member_id, v_business.manager_user_id, 'owner');
  end if;
  perform public._demote_co_owners(p_member_id, auth.uid());
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');

  for v_invite_id in
    update public.member_invites set cancelled_at = now()
    where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null
    returning id
  loop
    perform public._business_audit(p_member_id, 'member_invites', v_invite_id, 'update');
  end loop;
end;
$$;

revoke all on function public.take_back_location(uuid) from public, anon;
revoke all on function public.accept_location_handoff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.take_back_location(uuid) to authenticated;
grant execute on function public.accept_location_handoff(uuid, uuid) to service_role;

-- From 20261018110000_business_mode_switching.sql. A business manager is
-- never a co-owner of a location: a co_owner link becomes owner where the
-- location has no other owner, else editor (like media_events).
create or replace function public._link_manager_to_location(p_member_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_other_owner boolean;
begin
  select role into v_role from public.member_users where member_id = p_member_id and user_id = p_user_id;
  v_other_owner := exists (
    select 1 from public.member_users
    where member_id = p_member_id and role = 'owner' and user_id <> p_user_id
  );
  if v_role is null then
    insert into public.member_users (member_id, user_id, role)
    values (p_member_id, p_user_id, case when v_other_owner then 'editor' else 'owner' end);
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'insert');
  elsif v_role <> 'owner' and not v_other_owner then
    update public.member_users set role = 'owner' where member_id = p_member_id and user_id = p_user_id;
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');
  elsif v_role in ('media_events', 'co_owner') then
    update public.member_users set role = 'editor' where member_id = p_member_id and user_id = p_user_id;
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');
  end if;
end;
$$;
revoke all on function public._link_manager_to_location(uuid, uuid) from public, anon, authenticated;
