-- Multi-location businesses, part 2 (spec 2026-10-15): the Guild's business
-- writes. Every one checks is_guild_admin() and is audit-logged against the
-- real actor. Part 2 limits mode switching and leaving a one-manager
-- business; part 5 (hand-off) widens both. Until the location switcher
-- (part 3) ships, switching to One manager and linking its manager are
-- super admin only.

create or replace function public._business_audit(p_member_id uuid, p_table text, p_row_id uuid, p_action text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
  values (auth.uid(), p_member_id, p_table, p_row_id, p_action);
$$;
revoke all on function public._business_audit(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public._require_guild_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_guild_admin() then
    raise exception 'Only a Guild admin can do this' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_guild_admin() from public, anon, authenticated;

-- The Guild's business writes go through these functions only (spec: no
-- direct client writes), so Part 1's write grants and policies go.
revoke insert, update, delete on public.businesses from authenticated;
drop policy if exists "businesses: guild admins can insert" on public.businesses;
drop policy if exists "businesses: guild admins can update" on public.businesses;
drop policy if exists "businesses: guild admins can delete" on public.businesses;

-- Link the business manager to one location: owner when it has none, else editor.
create or replace function public._link_manager_to_location(p_member_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.member_users where member_id = p_member_id and user_id = p_user_id) then
    return;
  end if;
  insert into public.member_users (member_id, user_id, role)
  values (
    p_member_id,
    p_user_id,
    case when exists (select 1 from public.member_users where member_id = p_member_id and role = 'owner')
         then 'editor' else 'owner' end
  );
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'insert');
end;
$$;
revoke all on function public._link_manager_to_location(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_business_mode(p_business_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
begin
  perform public._require_guild_admin();
  if p_mode not in ('separate', 'one_manager') then
    raise exception 'Unknown management mode: %', p_mode;
  end if;
  if p_mode = 'one_manager' and not public.is_super_admin() then
    raise exception 'Only the super admin can switch a business to one manager for now.' using errcode = '42501';
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode = p_mode then
    return;
  end if;

  if p_mode = 'one_manager' and exists (
    select 1 from public.member_users mu
    join public.members m on m.id = mu.member_id
    where m.business_id = p_business_id
  ) then
    raise exception 'Some of these locations already have people signed up. Switching them to one manager comes in a later update.';
  end if;
  if p_mode = 'separate' and v_business.manager_user_id is not null then
    raise exception 'This business already has a manager. Switching it back comes in a later update.';
  end if;

  update public.businesses set management_mode = p_mode where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');
end;
$$;

create or replace function public.link_business_manager(p_business_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_member_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can invite a business manager for now.' using errcode = '42501';
  end if;
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode <> 'one_manager' then
    raise exception 'Set this business to One manager first';
  end if;
  if v_business.manager_user_id is not null then
    raise exception 'This business already has a manager';
  end if;

  update public.businesses set manager_user_id = p_user_id where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');

  for v_member_id in select id from public.members where business_id = p_business_id loop
    perform public._link_manager_to_location(v_member_id, p_user_id);
  end loop;
end;
$$;

-- Part of. p_target: a business id, another member's id (join its business,
-- creating one named after it when it has none), or null (no business).
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

  -- Leaving the current business.
  if v_member.business_id is not null then
    select * into v_current from public.businesses where id = v_member.business_id for update;
    if v_current.management_mode = 'one_manager' then
      raise exception 'Switch the business to each location separately first';
    end if;
  end if;

  update public.members set business_id = v_target_business where id = p_member_id;
  perform public._business_audit(p_member_id, 'members', p_member_id, 'update');

  -- A business left with one location (or none) is dissolved.
  if v_member.business_id is not null then
    select count(*) into v_remaining from public.members where business_id = v_member.business_id;
    if v_remaining <= 1 then
      for v_left in select id from public.members where business_id = v_member.business_id loop
        update public.members set business_id = null where id = v_left;
        perform public._business_audit(v_left, 'members', v_left, 'update');
      end loop;
      delete from public.businesses where id = v_member.business_id;
      perform public._business_audit(null, 'businesses', v_member.business_id, 'delete');
    end if;
  end if;

  -- Joining a one-manager business that has a manager: link them.
  if v_target_business is not null then
    select * into v_target from public.businesses where id = v_target_business for update;
    if v_target.management_mode = 'one_manager' and v_target.manager_user_id is not null then
      perform public._link_manager_to_location(p_member_id, v_target.manager_user_id);
      return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', v_target.manager_user_id);
    end if;
  end if;

  return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
end;
$$;

-- Part 1's name rule (20261015200000) joins only a separately managed
-- business: a one-manager business needs its manager linked, which Part of
-- (set_member_business) does.
create or replace function public.members_join_business_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sibling record;
  v_business uuid;
begin
  if new.business_id is not null then
    return new;
  end if;
  -- A publish re-saves the same name; that must not undo a Part of choice.
  if tg_op = 'UPDATE' and new.business_name is not distinct from old.business_name then
    return new;
  end if;

  select m.id, m.business_id into v_sibling
  from public.members m
  left join public.businesses b on b.id = m.business_id
  where btrim(m.business_name) = btrim(new.business_name)
    and m.id <> new.id
    and (m.business_id is null or b.management_mode = 'separate')
  -- An existing business wins over a member the Guild took out of one.
  order by (m.business_id is null), m.created_at
  limit 1;

  if not found then
    return new;
  end if;

  v_business := v_sibling.business_id;
  if v_business is null then
    insert into public.businesses (name) values (btrim(new.business_name))
    returning id into v_business;
    update public.members set business_id = v_business where id = v_sibling.id;
  end if;

  new.business_id := v_business;
  return new;
end;
$$;

-- Deleting a location can leave its business with one location (or none):
-- dissolve it, as Part of does. The roster's delete runs on the service
-- role, where auth.uid() is null, so the audit rows (which need an actor)
-- are written only when there is one.
create or replace function public.members_dissolve_business_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left uuid;
  v_actor uuid := auth.uid();
begin
  if old.business_id is null then
    return null;
  end if;
  if (select count(*) from public.members where business_id = old.business_id) > 1 then
    return null;
  end if;
  for v_left in select id from public.members where business_id = old.business_id loop
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

create trigger members_dissolve_business_after_delete
  after delete on public.members
  for each row execute function public.members_dissolve_business_after_delete();

revoke all on function public.set_business_mode(uuid, text) from public, anon;
revoke all on function public.link_business_manager(uuid, uuid) from public, anon;
revoke all on function public.set_member_business(uuid, uuid) from public, anon;
grant execute on function public.set_business_mode(uuid, text) to authenticated;
grant execute on function public.link_business_manager(uuid, uuid) to authenticated;
grant execute on function public.set_member_business(uuid, uuid) to authenticated;
