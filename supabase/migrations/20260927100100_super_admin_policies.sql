-- Super admin only, in the database (docs/member-profiles.md, "Super admin"
-- > "Enforcement"). Hiding menu items is not the protection; these
-- policies are, alongside the server-side checks.

-- members: deleting a member is super admin only. Guild admins keep read,
-- insert and update (suspend is their reversible alternative).
drop policy "members: guild admins can delete" on public.members;
create policy "members: super admins can delete"
  on public.members for delete
  to authenticated
  using (public.is_super_admin());

-- brand_settings: Guild admins keep read; insert, update and delete are
-- super admin only (Brand & theme is a super admin screen).
drop policy "brand_settings: guild admins can manage" on public.brand_settings;
create policy "brand_settings: super admins can insert"
  on public.brand_settings for insert
  to authenticated
  with check (public.is_super_admin());
create policy "brand_settings: super admins can update"
  on public.brand_settings for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy "brand_settings: super admins can delete"
  on public.brand_settings for delete
  to authenticated
  using (public.is_super_admin());

-- categories: Guild admins keep add, rename and reorder; delete (which
-- removes the category from every member who picked it) is super admin only.
drop policy "categories: guild admins can manage" on public.categories;
create policy "categories: guild admins can insert"
  on public.categories for insert
  to authenticated
  with check (public.is_guild_admin());
create policy "categories: guild admins can update"
  on public.categories for update
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
create policy "categories: super admins can delete"
  on public.categories for delete
  to authenticated
  using (public.is_super_admin());

-- audit_log: only the super admin reads it (the /guild/audit screen).
-- Guild admins still insert rows attributed to themselves.
drop policy "audit_log: guild admins can read every row" on public.audit_log;
create policy "audit_log: super admins can read every row"
  on public.audit_log for select
  to authenticated
  using (public.is_super_admin());

-- audit_log.details: names that would otherwise be lost -- a deleted
-- member's business name, the address granted or removed on the Guild
-- admins screen. Never anything a member typed into their profile.
alter table public.audit_log add column details jsonb;

-- members.trail_eligible: the Trail switch is super admin only. The
-- members update policy lets any Guild admin update a row, so the column is
-- locked in the existing write-limits trigger, ahead of its Guild admin
-- early return. Only client sessions are checked here; the service role
-- and migrations are handled exactly as before.
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
  if new.trail_eligible is distinct from old.trail_eligible then
    raise exception 'trail_eligible can only be set by a Guild admin';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'published') and new.status in ('draft', 'published')) then
    raise exception 'status can only be moved between draft and published by the member; other transitions need a Guild admin';
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
