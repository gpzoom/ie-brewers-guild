-- Beer Trail Pass sold through Zeffy (spec 2026-11-19). One Zeffy campaign per
-- trail year; a pass row per ticket in a Zeffy payment, credited to the
-- brewery whose counter plate started the sign-up (50% commission by
-- default). Breweries' email opt-ins. Server-only, like every Tap Card table.

create table public.tap_card_trail_campaigns (
  year int primary key check (year between 2020 and 2100),
  zeffy_campaign_id text not null unique,
  form_url text not null check (form_url ~ '^https://'),
  commission_pct int not null default 50 check (commission_pct between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.tap_card_trail_joins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id) on delete set null,
  email text not null check (char_length(email) between 3 and 254),
  email_lower text generated always as (lower(email)) stored,
  opt_in boolean not null default false,
  created_at timestamptz not null default now()
);
create index tap_card_trail_joins_email_idx on public.tap_card_trail_joins (email_lower, created_at desc);

create table public.tap_card_trail_passes (
  id uuid primary key default gen_random_uuid(),
  zeffy_payment_id text not null,
  zeffy_item_id text not null,
  holder_id uuid references public.tap_card_holders (id) on delete set null,
  member_id uuid references public.members (id) on delete set null,
  year int not null,
  amount_cents int not null check (amount_cents >= 0),
  paid_at timestamptz not null,
  refunded_at timestamptz,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (zeffy_payment_id, zeffy_item_id)
);
create index tap_card_trail_passes_holder_idx on public.tap_card_trail_passes (holder_id, year);
create index tap_card_trail_passes_member_idx on public.tap_card_trail_passes (member_id, paid_at);

create table public.tap_card_member_subscribers (
  member_id uuid not null references public.members (id) on delete cascade,
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  opted_in_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  primary key (member_id, holder_id)
);

do $$
declare t text;
begin
  foreach t in array array['tap_card_trail_campaigns', 'tap_card_trail_joins', 'tap_card_trail_passes',
    'tap_card_member_subscribers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
