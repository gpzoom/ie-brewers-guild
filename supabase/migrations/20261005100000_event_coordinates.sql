-- Members page v2 (docs/superpowers/specs/2026-10-05-members-page-v2-design.md):
-- a mobile member's stop gets map coordinates, looked up from its address by
-- the 15-minute cron (src/lib/events/stop-geocode-cron.server.ts).
-- geocoded_address is the address the coordinates belong to: when a member
-- edits the address, the page stops using the old coordinates (they no
-- longer match) until the cron looks the new one up.
alter table public.events
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add column geocoded_address text;

comment on column public.events.latitude is 'Map latitude of the stop, looked up from geocoded_address by the cron.';
comment on column public.events.longitude is 'Map longitude of the stop, looked up from geocoded_address by the cron.';
comment on column public.events.geocoded_address is 'The address latitude/longitude were looked up for; null = never looked up.';
