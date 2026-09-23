-- Lets a member choose an explicit image for how their profile link looks
-- when shared (Slack, Facebook, iMessage link previews, etc.) instead of
-- always falling back to their cover/logo or the site's generic image. No
-- crop column, unlike cover_asset_id -- social platforms fetch the raw
-- file directly and never apply a stored crop rectangle to it.
alter table public.members
  add column og_image_asset_id uuid references public.media_assets (id) on delete set null;

-- Same anon column-allowlist member-profile.server.ts's loader depends on
-- (20260922153458_final_review_fixes.sql, section 4) -- a table-level grant
-- would make every members column readable by anon regardless of this
-- list, so the new column needs its own explicit grant.
grant select (og_image_asset_id) on public.members to anon;

-- Same "approved and referenced by a published member" rule the
-- logo/cover/carousel-slide branches already enforce -- see
-- 20260922035745_carousel_slides_table.sql's policy of the same name.
drop policy "media_assets: public can read approved assets referenced by a published slide/logo/cover"
  on public.media_assets;

create policy "media_assets: public can read approved assets referenced by a published slide/logo/cover/social image"
  on public.media_assets for select
  to anon, authenticated
  using (
    review_status = 'approved'
    and (
      exists (
        select 1 from public.carousel_slides cs
        join public.members m on m.id = cs.member_id
        where cs.asset_id = media_assets.id and m.status = 'published'
      )
      or exists (
        select 1 from public.members m
        where (
          m.logo_asset_id = media_assets.id
          or m.cover_asset_id = media_assets.id
          or m.og_image_asset_id = media_assets.id
        )
        and m.status = 'published'
      )
    )
  );
