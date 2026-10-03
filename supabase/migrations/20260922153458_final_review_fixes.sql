-- Final whole-branch review fixes for the 12-task schema/RLS/storage plan.
-- Each numbered section below corresponds to a finding from that review.

-- ---------------------------------------------------------------------
-- 1. events has no title column. The spec's tag-based sync matches
-- "title or category," and the downstream Member Admin plan parses a
-- title from ICS feeds with nowhere to store it.
-- ---------------------------------------------------------------------
alter table public.events
  add column title text,
  add column description text;

-- ---------------------------------------------------------------------
-- 2. events.is_hidden isn't enforced by the public RLS policy -- a
-- hidden event should be genuinely inaccessible via anon/public API,
-- not just filtered client-side.
-- ---------------------------------------------------------------------
alter policy "events: public can read events of published members"
  on public.events
  using (
    exists (select 1 from public.members m where m.id = events.member_id and m.status = 'published')
    and not events.is_hidden
  );

-- ---------------------------------------------------------------------
-- 3. updated_at columns are dead on every table -- nothing ever writes
-- them. One reusable trigger function, applied as a second
-- before-update trigger on all 12 tables (members already has
-- members_enforce_owner_write_limits; Postgres runs multiple
-- before-update triggers in alphabetical order by trigger name, so this
-- is additive, not a merge).
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.member_users
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.media_assets
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.carousel_slides
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.member_links
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.hours
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.special_hours
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.calendar_connections
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.upload_tokens
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.member_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Anonymous visitors can read sensitive members columns via the
-- REST API's default select=*. Row-level RLS doesn't stop this --
-- column-level privileges do. (Coordinating plan-doc edit made
-- separately in docs/superpowers/plans/2026-09-21-public-member-profile.md.)
--
-- Note: anon already holds a table-level SELECT grant on public.members
-- (from the default Supabase project ACL), and a table-level grant
-- covers every column regardless of any column-level REVOKE layered on
-- top of it -- confirmed live: after a bare
-- `revoke select (application_note, ...) on public.members from anon`,
-- anon could still `select application_note from members` without
-- error. The only way to actually restrict columns is to revoke the
-- table-level SELECT and re-grant SELECT on an explicit column list.
-- ---------------------------------------------------------------------
revoke select on public.members from anon;

grant select (
  id, slug, member_type, business_name, tagline, city, state, street_address,
  postal_code, latitude, longitude, service_area, lead_time, phone, contact_email,
  timezone, theme, logo_asset_id, cover_asset_id, cover_crop, member_since_year,
  discount_percent, discount_no_fixed_percent, discount_redeem_text, status,
  hours_confirmed_at, published_at, trail_eligible, created_at, updated_at
) on public.members to anon;

-- ---------------------------------------------------------------------
-- 5. Inconsistent/undocumented on-delete behavior on FKs to
-- auth.users. Both members.approved_by_user_id and
-- media_assets.uploaded_by_user_id are nullable already, so set null is
-- safe. upload_tokens.created_by_user_id is not null today -- drop that
-- constraint first, then apply the same fix.
-- ---------------------------------------------------------------------
alter table public.members
  drop constraint members_approved_by_user_id_fkey,
  add constraint members_approved_by_user_id_fkey
    foreign key (approved_by_user_id) references auth.users (id) on delete set null;

alter table public.media_assets
  drop constraint media_assets_uploaded_by_user_id_fkey,
  add constraint media_assets_uploaded_by_user_id_fkey
    foreign key (uploaded_by_user_id) references auth.users (id) on delete set null;

alter table public.upload_tokens
  alter column created_by_user_id drop not null;

alter table public.upload_tokens
  drop constraint upload_tokens_created_by_user_id_fkey,
  add constraint upload_tokens_created_by_user_id_fkey
    foreign key (created_by_user_id) references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------
-- 6. Storage buckets have no size/type limits.
-- ---------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/svg+xml']
where id = 'member-logos';

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/webm'
    ]
where id = 'member-media';

-- ---------------------------------------------------------------------
-- 7. members_enforce_owner_write_limits() has no set search_path,
-- unlike the plan's other two functions.
-- ---------------------------------------------------------------------
create or replace function public.members_enforce_owner_write_limits()
returns trigger
language plpgsql
set search_path = public
as $$
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

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Six FK columns with no index, several read on every request via
-- RLS policy subqueries.
-- ---------------------------------------------------------------------
create index carousel_slides_asset_id_idx on public.carousel_slides (asset_id);
create index media_assets_upload_token_id_idx on public.media_assets (upload_token_id);
create index member_categories_category_id_idx on public.member_categories (category_id);
create index members_approved_by_user_id_idx on public.members (approved_by_user_id);
create index media_assets_uploaded_by_user_id_idx on public.media_assets (uploaded_by_user_id);
create index upload_tokens_created_by_user_id_idx on public.upload_tokens (created_by_user_id);

-- ---------------------------------------------------------------------
-- 9. special_hours allows more than one row per (member_id, date), but
-- the spec says a row here wins over the weekly row for that date
-- (singular).
-- ---------------------------------------------------------------------
alter table public.special_hours
  add constraint special_hours_member_id_date_key unique (member_id, date);

-- ---------------------------------------------------------------------
-- 10. events.calendar_connection_id is on delete cascade, which would
-- silently destroy member-authored overlay values if a calendar
-- connection is ever disconnected/deleted -- overlays must survive
-- calendar re-sync.
-- ---------------------------------------------------------------------
alter table public.events
  drop constraint events_calendar_connection_id_fkey,
  add constraint events_calendar_connection_id_fkey
    foreign key (calendar_connection_id) references public.calendar_connections (id) on delete set null;

-- ---------------------------------------------------------------------
-- 11. No check constraints on a few numeric columns with obvious
-- bounds.
-- ---------------------------------------------------------------------
alter table public.members
  add constraint members_discount_percent_check
    check (discount_percent is null or discount_percent between 0 and 100);

alter table public.upload_tokens
  add constraint upload_tokens_max_files_check check (max_files >= 0),
  add constraint upload_tokens_used_count_check check (used_count >= 0);
