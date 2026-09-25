-- Only the owner connects or disconnects the member's calendar (spec,
-- "People and permissions"): sync shouldn't break when an editor leaves or
-- used their own Google account. Everyone linked keeps read access through
-- "calendar_connections: owners and editors can read their own"
-- (20260922040751_calendar_events_tables.sql), and Guild admins keep their
-- manage-everything policy.
--
-- events, media_assets and upload_tokens deliberately stay writable by all
-- three roles (spec, "Enforcement").
--
-- Known gap for later phases: "Refresh now" (refreshIcsConnectionNow in
-- src/lib/events/calendar-connection.server.ts) writes last_synced_at /
-- sync_status with the signed-in session, so for a non-owner that status
-- update now silently matches zero rows (the events themselves still
-- sync). The spec moves Refresh now to a Worker that allows all three
-- roles; every member_users row today is an owner, so nothing changes yet.
drop policy "calendar_connections: owners and editors can manage their own" on public.calendar_connections;

create policy "calendar_connections: owners can manage their own"
  on public.calendar_connections for all to authenticated
  using (coalesce(public.member_role(member_id) = 'owner', false))
  with check (coalesce(public.member_role(member_id) = 'owner', false));
