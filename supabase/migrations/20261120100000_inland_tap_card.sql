-- Inland Tap Card, phase 1 (spec docs/superpowers/specs/2026-11-17-inland-tap-card-design.md).
--
-- Plastic NFC/QR cards that brewery staff tap to record taproom visits and
-- the once-a-year "first beer for a nickel" redemption. Every table here is
-- server-only: RLS is on with no policies and client roles hold no grants,
-- so only the Worker's service-role client reads or writes them. Each
-- server function checks the scanner-device cookie, the holder session
-- cookie, or the Guild/member session itself.
--
-- The rules the database enforces on its own (so a double tap or two bar
-- devices at once can't break them):
--   * one visit per holder per brewery per Pacific day
--     (tap_card_visits unique (holder_id, member_id, visit_day));
--   * one redemption per holder per brewery per calendar year
--     (partial unique on redeemed_year);
--   * one holder per email, ignoring case (email_lower unique).

create table public.tap_card_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  member_id uuid references public.members (id) on delete set null,
  card_count int not null check (card_count > 0),
  is_test boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tap_card_holders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  email text not null,
  email_lower text generated always as (lower(email)) stored unique,
  age_confirmed_via text not null check (age_confirmed_via in ('customer', 'staff')),
  activated_by_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tap_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  batch_id uuid not null references public.tap_card_batches (id) on delete cascade,
  holder_id uuid references public.tap_card_holders (id) on delete set null,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);
create index tap_cards_batch_id_idx on public.tap_cards (batch_id);
create index tap_cards_holder_id_idx on public.tap_cards (holder_id) where holder_id is not null;

create table public.scanner_devices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index scanner_devices_member_id_idx on public.scanner_devices (member_id);

create table public.tap_card_visits (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  card_id uuid references public.tap_cards (id) on delete set null,
  device_id uuid references public.scanner_devices (id) on delete set null,
  visited_at timestamptz not null default now(),
  visit_day date not null,
  redeemed_year smallint,
  created_at timestamptz not null default now(),
  unique (holder_id, member_id, visit_day)
);
create unique index tap_card_visits_one_redemption_a_year
  on public.tap_card_visits (holder_id, member_id, redeemed_year)
  where redeemed_year is not null;
create index tap_card_visits_member_idx on public.tap_card_visits (member_id, visit_day);

create table public.tap_card_offers (
  member_id uuid primary key references public.members (id) on delete cascade,
  offer_text text not null check (char_length(offer_text) between 3 and 140),
  status text not null check (status in ('pending', 'approved', 'declined')),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);

create table public.tap_card_milestones (
  id uuid primary key default gen_random_uuid(),
  stops_required int not null check (stops_required > 0),
  reward_text text not null check (char_length(reward_text) between 1 and 140),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tap_card_rewards (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  milestone_id uuid not null references public.tap_card_milestones (id) on delete cascade,
  year smallint not null,
  earned_at timestamptz not null default now(),
  handed_out_at timestamptz,
  handed_out_by uuid references auth.users (id) on delete set null,
  unique (holder_id, milestone_id, year)
);

create table public.tap_card_login_tokens (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tap_card_sessions (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['tap_card_batches', 'tap_card_holders', 'tap_cards', 'scanner_devices',
    'tap_card_visits', 'tap_card_offers', 'tap_card_milestones', 'tap_card_rewards',
    'tap_card_login_tokens', 'tap_card_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Guild Settings. The period is a setting so it can change later; calendar
-- year (Pacific) is the only value for now (owner, 2026-11-17).
alter table public.site_settings
  add column tap_card_period text not null default 'calendar_year'
    check (tap_card_period in ('calendar_year')),
  add column tap_card_price_cents int not null default 500
    check (tap_card_price_cents between 0 and 10000);
