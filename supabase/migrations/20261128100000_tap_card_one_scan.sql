-- Scan Pass one-scan check-in and location flags (spec 2026-11-24). Adds only.
alter table public.tap_card_sessions
  add column pending_staff_code text;
alter table public.tap_card_staff_activity
  add column location text check (location in ('near', 'far', 'none'));
