-- Inland Tap Card: named staff QR and 4-digit codes, with activity tracking
-- (spec docs/superpowers/specs/2026-11-23-staff-qr-tracking-design.md).
--
-- Each staff member at a brewery gets their own QR code and personal 4-digit
-- code. Every check-in and reward use is logged with who did it. The shared
-- plate codes (tap_card_plates.staff_qr / staff_code) are left untouched: the
-- live site still runs the old code on this same database. The new column
-- below lets a brewery turn the shared 4-digit code off.
--
-- Every table here is server-only, like the loyalty tables: RLS on, no
-- policies, and client roles hold no grants.

alter table public.tap_card_plates
  add column staff_code_off boolean not null default false;

create table public.tap_card_staff (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  -- The name lowercased with extra spaces collapsed; unique per brewery.
  name_key text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (member_id, name_key),
  unique (id, member_id)
);

create table public.tap_card_staff_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  -- Null only for a turned-off brewery-wide QR code (see the check below).
  -- With a null staff_id the composite key is not enforced (MATCH SIMPLE).
  staff_id uuid,
  kind text not null check (kind in ('qr', 'pin')),
  code text not null,
  created_at timestamptz not null default now(),
  turned_off_at timestamptz,
  foreign key (staff_id, member_id)
    references public.tap_card_staff (id, member_id) on delete cascade,
  check (
    (kind = 'qr' and code ~ '^[0-9A-HJKMNP-TV-Z]{8}$')
    or (kind = 'pin' and code ~ '^[0-9]{4}$')
  ),
  check (staff_id is not null or (kind = 'qr' and turned_off_at is not null))
);
create unique index tap_card_staff_codes_qr_unique
  on public.tap_card_staff_codes (code) where kind = 'qr';
-- A 4-digit code is never reissued at a brewery, even after it is turned off.
create unique index tap_card_staff_codes_pin_unique
  on public.tap_card_staff_codes (member_id, code) where kind = 'pin';
create unique index tap_card_staff_codes_one_live
  on public.tap_card_staff_codes (staff_id, kind) where turned_off_at is null;

-- The activity log. staff_id and code_id are plain single-column keys that
-- null out when the staff row or code row is deleted, so the history stays.
create table public.tap_card_staff_activity (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  visit_id uuid references public.tap_card_visits (id) on delete set null,
  at timestamptz not null default now(),
  -- The calendar day in Pacific time, set by the server.
  day date not null,
  event text not null check (event in ('check-in', 'reward-used', 'reward-undone', 'turned-off-code')),
  source text not null check (source in ('staff', 'counter', 'staff-code')),
  staff_id uuid references public.tap_card_staff (id) on delete set null,
  code_id uuid references public.tap_card_staff_codes (id) on delete set null,
  method text check (method in ('qr', 'pin')),
  -- QR text only; a 4-digit code is never stored here.
  code_text text,
  reward text
);
create index tap_card_staff_activity_recent
  on public.tap_card_staff_activity (member_id, at desc);
create index tap_card_staff_activity_holder
  on public.tap_card_staff_activity (holder_id);
create index tap_card_staff_activity_visit
  on public.tap_card_staff_activity (visit_id);
-- One "turned off code" entry per customer, code and day.
create unique index tap_card_staff_activity_turned_off_once
  on public.tap_card_staff_activity (holder_id, code_text, day)
  where event = 'turned-off-code';

do $$
declare t text;
begin
  foreach t in array array['tap_card_staff', 'tap_card_staff_codes', 'tap_card_staff_activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
