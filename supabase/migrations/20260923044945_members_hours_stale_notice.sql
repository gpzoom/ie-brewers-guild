-- Tracks the last time the hours-stale-past-90-days email was sent for a
-- member, so the daily cron (hours-stale-cron.server.ts) sends exactly one
-- notice per staleness episode instead of one every day. Not in the
-- members_enforce_owner_write_limits trigger's blocklist -- this column is
-- only ever written by the service-role cron, and members never edit it
-- directly, so no trigger change is needed.
alter table public.members
  add column hours_stale_notice_sent_at timestamptz;
