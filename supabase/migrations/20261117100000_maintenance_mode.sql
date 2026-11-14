-- Maintenance mode (owner, 2026-11-14): while testing needs the Sample
-- members published, the public sees the maintenance page instead of the
-- site (src/lib/site/maintenance.ts). Staging and live share this database,
-- so one switch covers both. The super admin flips it on Settings; the
-- public pages read it through the server (service role), like the
-- spotlight switch -- site_settings stays super-admin-only. Off by default.
alter table public.site_settings
  add column maintenance_mode boolean not null default false;
