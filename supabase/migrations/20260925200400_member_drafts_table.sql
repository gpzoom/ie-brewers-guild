-- One draft per member (spec, "Drafts: nothing goes live until Publish" and
-- "Publishing by section"). Every wizard/portal edit lands here; the live
-- tables change only when publish_member_draft() copies sections across.
--
-- data is keyed by section, in the shape the profile template takes:
--   basics   -- members fields (business_name, tagline, city, state,
--               street_address, service_area, lead_time, member_since_year,
--               timezone, phone, contact_email, logo_asset_id,
--               logo_background, cover_asset_id, cover_crop,
--               og_image_asset_id), plus hours[] and special_hours[]
--   media    -- slides[] of {asset_id, crop, outbound_url, sort_order}
--   links    -- links[] of {kind, label, url, sort_order}
--   discount -- discount_percent, discount_no_fixed_percent,
--               discount_redeem_text, category_ids[]
--   theme    -- theme
-- The exact keys and their validation live in _validate_draft_section()
-- (20260925200700_member_draft_internals.sql).
--
-- dirty_sections replaces a single is_dirty flag so a Photos & events
-- editor can publish 'media' without pushing anyone else's unfinished work.
create table public.member_drafts (
  member_id uuid primary key references public.members (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  dirty_sections text[] not null default '{}'
    check (dirty_sections <@ array['basics', 'media', 'links', 'discount', 'theme']),
  -- Who last saved the media section, for the owner's "Photo changes from
  -- [person] waiting to publish" notice.
  media_updated_by_user_id uuid references auth.users (id) on delete set null,
  -- The real signed-in account, which is the Guild admin while impersonating.
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_drafts_media_updated_by_user_id_idx on public.member_drafts (media_updated_by_user_id);
create index member_drafts_updated_by_user_id_idx on public.member_drafts (updated_by_user_id);

create trigger set_updated_at before update on public.member_drafts
  for each row execute function public.set_updated_at();

alter table public.member_drafts enable row level security;

-- Anyone linked to the member (any role -- a Photos & events editor's
-- preview is live plus the media draft) and Guild admins can read. There
-- are deliberately no insert/update/delete policies: every write goes
-- through the SECURITY DEFINER draft functions, which check the caller's
-- role per section. Never public.
create policy "member_drafts: linked users can read their own"
  on public.member_drafts for select to authenticated
  using (public.is_member_editor(member_id));
create policy "member_drafts: guild admins can read every row"
  on public.member_drafts for select to authenticated
  using (public.is_guild_admin());

-- Belt and braces on top of "no write policies": without table privileges a
-- direct REST write fails loudly with "permission denied" instead of
-- quietly matching zero rows.
revoke all on public.member_drafts from anon;
revoke insert, update, delete, truncate, references, trigger on public.member_drafts from authenticated;
