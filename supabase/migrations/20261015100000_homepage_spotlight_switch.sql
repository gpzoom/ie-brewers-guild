-- Homepage spotlight switch (docs/member-profiles.md, "Homepage" >
-- "Spotlight"; owner, 2026-10-14): the super admin shows or hides the
-- temporary section under the homepage hero on Settings. The slides
-- themselves live in code (src/lib/home/spotlight.ts), so this is only the
-- on/off. Off by default; the public homepage reads it through the server
-- (service role), like the carousel dwell time -- site_settings stays
-- super-admin-only.
alter table public.site_settings
  add column spotlight_enabled boolean not null default false;
