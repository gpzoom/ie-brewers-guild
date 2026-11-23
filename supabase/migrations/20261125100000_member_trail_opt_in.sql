-- A member can put itself on the Beer Trail (Scan Pass page checkbox, owner
-- 2026-11-23). The site's server does it with the service role after checking
-- the caller, so the second trail_eligible check now applies to client
-- sessions only. The first check is unchanged: from a client session, still
-- only the super admin can change trail_eligible. Everything else is the
-- latest definition (20261119100000_join_applications.sql).
create or replace function public.members_enforce_owner_write_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client_role boolean := current_user in ('authenticated', 'anon');
begin
  if v_client_role
     and new.trail_eligible is distinct from old.trail_eligible
     and not public.is_super_admin() then
    raise exception 'trail_eligible can only be set by the super admin' using errcode = '42501';
  end if;

  if public.is_guild_admin() then
    return new;
  end if;

  if new.slug is distinct from old.slug then
    raise exception 'slug cannot be changed';
  end if;
  if new.dues_received_at is distinct from old.dues_received_at then
    raise exception 'dues_received_at can only be set by a Guild admin';
  end if;
  if new.approved_at is distinct from old.approved_at then
    raise exception 'approved_at can only be set by a Guild admin';
  end if;
  if new.approved_by_user_id is distinct from old.approved_by_user_id then
    raise exception 'approved_by_user_id can only be set by a Guild admin';
  end if;
  if v_client_role and new.trail_eligible is distinct from old.trail_eligible then
    raise exception 'trail_eligible can only be set by a Guild admin';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'published') and new.status in ('draft', 'published')) then
    raise exception 'status can only be moved between draft and published by the member; other transitions need a Guild admin';
  end if;

  if v_client_role
     and (new.google_place_id is distinct from old.google_place_id
          or new.applied_via_join_at is distinct from old.applied_via_join_at
          or new.join_welcomed_at is distinct from old.join_welcomed_at
          or new.join_details_notified_at is distinct from old.join_details_notified_at) then
    raise exception 'google_place_id and the Join timestamps can only be set by the Guild or the server'
      using errcode = '42501';
  end if;

  if new.member_type is distinct from old.member_type and old.type_confirmed_at is not null then
    raise exception 'member_type is locked once confirmed; ask the Guild to change it';
  end if;

  if v_client_role or coalesce(current_setting('app.member_fn', true), '') <> 'on' then
    if new.type_confirmed_at is distinct from old.type_confirmed_at
       or new.type_confirmed_by_user_id is distinct from old.type_confirmed_by_user_id then
      raise exception 'type confirmation can only be set through confirm_member_type()';
    end if;
    if new.setup_completed_at is distinct from old.setup_completed_at then
      raise exception 'setup_completed_at can only be set through complete_member_setup()';
    end if;
  end if;

  if v_client_role and not public.is_member_full_editor(new.id) then
    if new.status is distinct from old.status
       or new.member_type is distinct from old.member_type
       or new.hours_confirmed_at is distinct from old.hours_confirmed_at
       or new.published_at is distinct from old.published_at then
      raise exception 'Only the owner or a full editor can change status, member type, hours confirmation or publish time';
    end if;
  end if;

  -- Phase 2: a member's own client session may change member_type and
  -- nothing else on the live row.
  if v_client_role
     and (to_jsonb(new) - array['member_type', 'updated_at']) is distinct from (to_jsonb(old) - array['member_type', 'updated_at']) then
    raise exception 'Profile changes save to your draft and go live when you publish; the live profile can''t be edited directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
