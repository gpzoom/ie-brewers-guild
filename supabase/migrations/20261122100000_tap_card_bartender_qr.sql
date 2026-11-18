-- Tap Card bartender QR (spec 2026-11-18-tap-card-bartender-qr-design.md).
-- A second, secret QR per brewery kept behind the counter (/s/<staff_qr>),
-- and the plate choice a customer's phone is waiting to confirm with it.
-- Both tables stay server-only (RLS on, no policies).

alter table public.tap_card_plates
  add column staff_qr text unique check (staff_qr ~ '^[A-Za-z0-9_-]{43}$');

alter table public.tap_card_sessions
  add column pending_member_id uuid references public.members (id) on delete set null,
  add column pending_plate_code text,
  add column pending_choice jsonb,
  add column pending_at timestamptz;
