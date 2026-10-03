-- Makes live-table writes role-aware now, instead of waiting for phase 2.
--
-- The live write policies used is_member_editor(), which ignores
-- member_users.role. With the public anon key, a Photos & events editor
-- could therefore skip the draft functions and write the live profile
-- directly over REST: publish a never-published member, set
-- hours_confirmed_at, delete hours, replace the carousel. The draft
-- functions' per-section checks were only as strong as that back door.
--
-- Today's /admin editors write these tables through the signed-in session
-- as owners, so an owner/full-editor/Guild-admin rule keeps them working:
-- is_member_full_editor(). That includes publishMemberProfile /
-- unpublishMemberProfile (src/lib/hours/publish-gate.server.ts), which
-- write status and hours_confirmed_at. Select policies are unchanged.
-- media_assets, upload_tokens and events stay writable by all three roles
-- (spec, "Enforcement"). calendar_connections is owner-only
-- (20260925201000_calendar_connections_owner_writes.sql).
--
-- Phase 2 goes further and removes direct member writes to the drafted
-- columns and tables altogether; this migration only closes the role gap.

drop policy "members: owners and editors can update their own row" on public.members;
create policy "members: owners and full editors can update their own row"
  on public.members for update to authenticated
  using (public.is_member_full_editor(id))
  with check (public.is_member_full_editor(id));

drop policy "hours: owners and editors can manage their own" on public.hours;
create policy "hours: owners and full editors can manage their own"
  on public.hours for all to authenticated
  using (public.is_member_full_editor(member_id)) with check (public.is_member_full_editor(member_id));

drop policy "special_hours: owners and editors can manage their own" on public.special_hours;
create policy "special_hours: owners and full editors can manage their own"
  on public.special_hours for all to authenticated
  using (public.is_member_full_editor(member_id)) with check (public.is_member_full_editor(member_id));

drop policy "carousel_slides: owners and editors can manage their own" on public.carousel_slides;
create policy "carousel_slides: owners and full editors can manage their own"
  on public.carousel_slides for all to authenticated
  using (public.is_member_full_editor(member_id)) with check (public.is_member_full_editor(member_id));

drop policy "member_links: owners and editors can manage their own" on public.member_links;
create policy "member_links: owners and full editors can manage their own"
  on public.member_links for all to authenticated
  using (public.is_member_full_editor(member_id)) with check (public.is_member_full_editor(member_id));

drop policy "member_categories: owners and editors can manage their own" on public.member_categories;
create policy "member_categories: owners and full editors can manage their own"
  on public.member_categories for all to authenticated
  using (public.is_member_full_editor(member_id)) with check (public.is_member_full_editor(member_id));

-- The write-limits trigger (last defined in
-- 20260922153458_final_review_fixes.sql, section 7), extended with:
--
-- 1. The member_type lock: once type_confirmed_at is set, only a Guild
--    admin (signed in as themselves or impersonating -- is_guild_admin() is
--    about the real signed-in account) can change member_type. Before
--    confirmation the current /admin Basics editor can still change it.
--
-- 2. type_confirmed_at, type_confirmed_by_user_id and setup_completed_at
--    are written only by confirm_member_type() / complete_member_setup()
--    (20260925200900_member_setup_functions.sql). Those are SECURITY
--    DEFINER, but auth.uid() is still the calling member inside them, so
--    is_guild_admin() doesn't help. Instead they set a transaction-local
--    flag, `set_config('app.member_fn', 'on', true)`, around their own
--    update. The flag is honoured only when current_user isn't a client
--    role: inside a SECURITY DEFINER function current_user is the function
--    owner, while every client path (PostgREST, pg_graphql, anything a
--    client's JWT reaches) runs as anon or authenticated. So even if some
--    client path could set the flag, it would be ignored there.
--
-- 3. Belt and braces with the RLS change above: from a client role,
--    status, member_type, hours_confirmed_at and published_at change only
--    for an owner, full editor or Guild admin. The draft functions aren't
--    affected (they run as the owner); nor is the service role (the
--    one-click stale-hours confirmation sets hours_confirmed_at with it).
--    Phase 2 later makes these function-only for members.
create or replace function public.members_enforce_owner_write_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client_role boolean := current_user in ('authenticated', 'anon');
begin
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

  return new;
end;
$$;
