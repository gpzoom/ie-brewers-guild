-- The tile behind a member's logo on their public profile. White suits most
-- logos, but a mostly-white logo vanishes on it -- so the member picks:
-- 'light' (white, the default and what every profile showed before),
-- 'dark' (the site's ink), or 'theme' (their own profile theme color).
alter table public.members
  add column logo_background text not null default 'light'
    check (logo_background in ('light', 'dark', 'theme'));

-- Same anon column-allowlist member-profile.server.ts's loader depends on
-- (20260922153458_final_review_fixes.sql, section 4) -- see
-- 20260923170000_members_og_image.sql for why each new column needs its own
-- explicit grant.
grant select (logo_background) on public.members to anon;
