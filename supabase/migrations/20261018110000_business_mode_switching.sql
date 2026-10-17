-- Multi-location businesses, part 5 (spec 2026-10-15): full mode switching.
--
-- * _link_manager_to_location: an existing link is raised (to owner where
--   the location has no other owner, else media_events -> editor).
-- * set_business_mode gains p_manager_user_id: to one manager it now also
--   works when locations already have owners (they keep them; those
--   locations become handed off), sets the manager and links them in the
--   same transaction. To separate it clears the manager and releases each
--   location (_release_location_from_manager). Both refuse while a
--   hand-off is pending.
-- * set_member_business: a location may leave a one-manager business; it
--   is released from the manager first (and so is the last location of a
--   business that dissolves).
-- * The delete trigger releases a dissolving business's last location too.

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
  elsif v_role = 'media_events' then
    update public.member_users set role = 'editor' where member_id = p_member_id and user_id = p_user_id;
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');
  end if;
end;
$$;
revoke all on function public._link_manager_to_location(uuid, uuid) from public, anon, authenticated;

drop function public.set_business_mode(uuid, text, uuid);

create or replace function public.set_business_mode(
  p_business_id uuid,
  p_mode text,
  p_look_source uuid default null,
  p_manager_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_source uuid;
  v_member uuid;
  v_pending_city text;
begin
  perform public._require_guild_admin();
  if p_mode not in ('separate', 'one_manager') then
    raise exception 'Unknown management mode: %', p_mode;
  end if;
  if p_mode = 'separate' and p_manager_user_id is not null then
    raise exception 'A manager is chosen only when switching to one manager.';
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode = p_mode then
    return;
  end if;
  select m.city into v_pending_city
  from public.member_invites i
  join public.members m on m.id = i.member_id
  where m.business_id = p_business_id and i.role = 'owner'
    and i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()
  order by m.city
  limit 1;
  if found then
    raise exception 'Cancel the pending hand-off for % · % first.', v_business.name, v_pending_city;
  end if;

  if p_mode = 'separate' then
    update public.businesses set management_mode = 'separate', manager_user_id = null where id = p_business_id;
    perform public._business_audit(null, 'businesses', p_business_id, 'update');
    if v_business.manager_user_id is not null then
      for v_member in select id from public.members where business_id = p_business_id loop
        perform public._release_location_from_manager(v_member, v_business.manager_user_id);
      end loop;
    end if;
    return;
  end if;

  -- One manager: every location takes one location's look -- the one the
  -- Guild chose, else the first set up, else the oldest (part 4).
  if p_look_source is not null
     and not exists (select 1 from public.members where id = p_look_source and business_id = p_business_id) then
    raise exception 'Choose a location of this business for the logo, cover and theme.';
  end if;
  update public.businesses set management_mode = 'one_manager', manager_user_id = p_manager_user_id
  where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');

  v_source := coalesce(
    (select id from public.members where id = p_look_source and business_id = p_business_id),
    (select id from public.members where business_id = p_business_id and setup_completed_at is not null order by setup_completed_at limit 1),
    (select id from public.members where business_id = p_business_id order by created_at limit 1)
  );
  if v_source is not null then
    for v_member in select id from public.members where business_id = p_business_id and id <> v_source loop
      perform public._copy_shared_look(v_source, v_member);
      perform public._business_audit(v_member, 'members', v_member, 'update');
    end loop;
  end if;

  if p_manager_user_id is not null then
    for v_member in select id from public.members where business_id = p_business_id loop
      perform public._link_manager_to_location(v_member, p_manager_user_id);
    end loop;
  end if;
end;
$$;

revoke all on function public.set_business_mode(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.set_business_mode(uuid, text, uuid, uuid) to authenticated;

create or replace function public.set_member_business(p_member_id uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_current public.businesses;
  v_target_business uuid;
  v_target_member public.members;
  v_target public.businesses;
  v_remaining int;
  v_left uuid;
  v_source uuid;
begin
  perform public._require_guild_admin();
  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    raise exception 'That member no longer exists';
  end if;

  -- Resolve the target to a business id (or null).
  if p_target is null then
    v_target_business := null;
  elsif exists (select 1 from public.businesses where id = p_target) then
    -- Lock it so a concurrent link_business_manager can't miss this location.
    select * into v_target from public.businesses where id = p_target for update;
    v_target_business := p_target;
  else
    select * into v_target_member from public.members where id = p_target for update;
    if not found then
      raise exception 'Choose a business or a member';
    end if;
    if v_target_member.id = p_member_id then
      raise exception 'A location can''t be grouped with itself';
    end if;
    v_target_business := v_target_member.business_id;
    if v_target_business is null then
      insert into public.businesses (name) values (btrim(v_target_member.business_name))
      returning id into v_target_business;
      update public.members set business_id = v_target_business where id = v_target_member.id;
      perform public._business_audit(v_target_member.id, 'members', v_target_member.id, 'update');
    end if;
  end if;

  if v_target_business is not distinct from v_member.business_id then
    return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
  end if;

  -- Leaving the current business: a one-manager business lets the
  -- location go the way switching to separate would (part 5).
  if v_member.business_id is not null then
    select * into v_current from public.businesses where id = v_member.business_id for update;
    if v_current.management_mode = 'one_manager' and v_current.manager_user_id is not null then
      perform public._release_location_from_manager(p_member_id, v_current.manager_user_id);
    end if;
  end if;

  update public.members set business_id = v_target_business where id = p_member_id;
  perform public._business_audit(p_member_id, 'members', p_member_id, 'update');

  -- A business left with one location (or none) is dissolved.
  if v_member.business_id is not null then
    select count(*) into v_remaining from public.members where business_id = v_member.business_id;
    if v_remaining <= 1 then
      for v_left in select id from public.members where business_id = v_member.business_id loop
        if v_current.management_mode = 'one_manager' and v_current.manager_user_id is not null then
          perform public._release_location_from_manager(v_left, v_current.manager_user_id);
        end if;
        update public.members set business_id = null where id = v_left;
        perform public._business_audit(v_left, 'members', v_left, 'update');
      end loop;
      delete from public.businesses where id = v_member.business_id;
      perform public._business_audit(null, 'businesses', v_member.business_id, 'delete');
    end if;
  end if;

  -- Joining a one-manager business: take its look and its confirmed type,
  -- then, when it has a manager, link them.
  if v_target_business is not null then
    select * into v_target from public.businesses where id = v_target_business for update;
    if v_target.management_mode = 'one_manager' then
      v_source := public._shared_look_source(v_target_business, p_member_id);
      if v_source is not null then
        perform public._copy_shared_look(v_source, p_member_id);
        perform set_config('app.member_fn', 'on', true);
        update public.members m
        set member_type = s.member_type, type_confirmed_at = now(), type_confirmed_by_user_id = auth.uid()
        from public.members s
        where m.id = p_member_id and s.id = v_source
          and s.type_confirmed_at is not null and m.type_confirmed_at is null;
        perform set_config('app.member_fn', '', true);
      end if;
    end if;
    if v_target.management_mode = 'one_manager' and v_target.manager_user_id is not null then
      perform public._link_manager_to_location(p_member_id, v_target.manager_user_id);
      return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', v_target.manager_user_id);
    end if;
  end if;

  return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
end;
$$;

revoke all on function public.set_member_business(uuid, uuid) from public, anon;
grant execute on function public.set_member_business(uuid, uuid) to authenticated;


create or replace function public.members_dissolve_business_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left uuid;
  v_actor uuid := auth.uid();
  v_business public.businesses;
begin
  if old.business_id is null then
    return null;
  end if;
  if (select count(*) from public.members where business_id = old.business_id) > 1 then
    return null;
  end if;
  select * into v_business from public.businesses where id = old.business_id;
  for v_left in select id from public.members where business_id = old.business_id loop
    if v_business.management_mode = 'one_manager' and v_business.manager_user_id is not null then
      perform public._release_location_from_manager(v_left, v_business.manager_user_id);
    end if;
    update public.members set business_id = null where id = v_left;
    if v_actor is not null then
      perform public._business_audit(v_left, 'members', v_left, 'update');
    end if;
  end loop;
  delete from public.businesses where id = old.business_id;
  if v_actor is not null and found then
    perform public._business_audit(null, 'businesses', old.business_id, 'delete');
  end if;
  return null;
end;
$$;
revoke all on function public.members_dissolve_business_after_delete() from public, anon, authenticated;
