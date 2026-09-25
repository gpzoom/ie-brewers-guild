-- Phase 2 (plan, "Live tables"): every member edit now saves to the draft
-- (save_member_draft_section), and the live profile changes only through
-- publish_member_draft / unpublish_member, the Guild admin's own paths, and
-- the service-role paths (the one-click stale-hours link, creator upload).
-- 20260925201100_member_role_write_limits.sql closed the role gap; this
-- removes direct member writes to the drafted live data altogether, so a
-- signed-in member with the public anon key can't skip the draft over REST.
--
-- Unchanged on purpose:
-- * Select policies (members still read their own live rows).
-- * The Guild admin "manage every row" policies -- roster actions and
--   anything a Guild admin does as themselves still write live.
-- * events, media_assets, upload_tokens: not drafted, writable by all three
--   roles (spec, "Enforcement"). calendar_connections: owner only.

-- 1. Drafted child tables: no member write policies at all. With RLS on and
--    no policy, a member's INSERT fails its check (42501) and an UPDATE or
--    DELETE matches zero rows. publish_member_draft is SECURITY DEFINER and
--    runs as the table owner, so it isn't affected.
drop policy "hours: owners and full editors can manage their own" on public.hours;
drop policy "special_hours: owners and full editors can manage their own" on public.special_hours;
drop policy "carousel_slides: owners and full editors can manage their own" on public.carousel_slides;
drop policy "member_links: owners and full editors can manage their own" on public.member_links;
drop policy "member_categories: owners and full editors can manage their own" on public.member_categories;

-- 2. members. The update policy "members: owners and full editors can update
--    their own row" stays, for exactly one column: member_type. The /admin
--    Basics editor still changes an UNCONFIRMED type live (member type
--    isn't drafted -- spec, "What is not drafted"), until the portal's
--    wizard/"Request a type change" replace it. Once type_confirmed_at is
--    set the existing lock below refuses even that.
--
--    Everything else on members is now off-limits to a client role that
--    isn't a Guild admin: the drafted columns (name, hours-related fields,
--    logo/cover/social image, discount, theme, ...) change only by
--    publishing, and status / hours_confirmed_at / published_at only
--    through publish_member_draft and unpublish_member (both run as the
--    function owner, so `v_client_role` is false inside them). Rather than
--    list the forbidden columns -- a list that would silently miss the next
--    column someone adds -- the rule compares the whole row minus the one
--    allowed column (and updated_at, which set_updated_at stamps after this
--    trigger runs).
--
--    The earlier rules keep their own messages and run first, so existing
--    callers and tests still see the same errors for slug, the type lock,
--    the setup columns, and so on.
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
