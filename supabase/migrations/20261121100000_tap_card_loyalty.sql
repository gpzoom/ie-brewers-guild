-- Inland Tap Card: offers and loyalty rewards
-- (spec docs/superpowers/specs/2026-11-17-tap-card-offers-loyalty-design.md).
--
-- After the once-a-year Beer Trail offer, the card becomes a loyalty card at
-- each brewery: up to 3 visit-number steps plus one repeating reward, written
-- by the brewery (often from a Guild template) and approved by the Guild.
-- Earned rewards wait on the customer until used, and expire. A brewery can
-- also take check-ins at a counter plate: the customer taps their own phone
-- and the bartender enters a 4-digit staff code.
--
-- Every table here is server-only, like phase 1: RLS on, no policies, and
-- client roles hold no grants.
--
-- The rules the database enforces on its own:
--   * a ladder step (step1-3) is earned once per person per brewery, ever --
--     even if the brewery edits or re-adds it;
--   * a reward slot is earned at most once per visit;
--   * at most one member reward is used per visit.

-- The Beer Trail offer is the Guild's now; breweries no longer replace it.
drop table public.tap_card_offers;

create table public.tap_card_member_offers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  slot text not null check (slot in ('step1', 'step2', 'step3', 'repeat')),
  -- The approved version customers see (a step's visit number, or the
  -- repeating reward's "every N visits").
  live_visit_number int check (live_visit_number >= 2),
  live_reward text check (char_length(live_reward) between 3 and 140),
  live_terms text check (char_length(live_terms) <= 300),
  live_approved_at timestamptz,
  live_approved_by uuid references auth.users (id) on delete set null,
  -- A submitted change waiting for (or turned down by) the Guild. The live
  -- version stays live meanwhile.
  draft_visit_number int check (draft_visit_number >= 2),
  draft_reward text check (char_length(draft_reward) between 3 and 140),
  draft_terms text check (char_length(draft_terms) <= 300),
  draft_status text check (draft_status in ('pending', 'declined')),
  draft_submitted_at timestamptz,
  draft_submitted_by uuid references auth.users (id) on delete set null,
  decline_note text check (char_length(decline_note) <= 300),
  created_at timestamptz not null default now(),
  unique (member_id, slot),
  check ((live_reward is null) = (live_visit_number is null)),
  check ((live_reward is null) = (live_terms is null)),
  check ((draft_status is null) = (draft_reward is null)),
  check ((draft_reward is null) = (draft_visit_number is null)),
  check ((draft_reward is null) = (draft_terms is null)),
  check (live_reward is not null or draft_reward is not null)
);

create table public.tap_card_offer_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  reward text not null check (char_length(reward) between 3 and 140),
  terms text not null default '' check (char_length(terms) <= 300),
  sort_order int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tap_card_member_settings (
  member_id uuid primary key references public.members (id) on delete cascade,
  reward_expiry_days int not null default 90 check (reward_expiry_days in (30, 60, 90, 365))
);

create table public.tap_card_plates (
  member_id uuid primary key references public.members (id) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  staff_code text check (staff_code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tap_card_earned_rewards (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.tap_card_holders (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  slot text not null check (slot in ('step1', 'step2', 'step3', 'repeat')),
  -- A snapshot: later edits to the offer never change a reward already earned.
  reward text not null,
  terms text not null default '',
  earned_visit_id uuid not null references public.tap_card_visits (id) on delete cascade,
  earned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_visit_id uuid references public.tap_card_visits (id) on delete set null,
  used_device_id uuid references public.scanner_devices (id) on delete set null,
  check ((used_at is null) = (used_visit_id is null))
);
create unique index tap_card_earned_rewards_one_slot_a_visit
  on public.tap_card_earned_rewards (earned_visit_id, slot);
create unique index tap_card_earned_rewards_step_once
  on public.tap_card_earned_rewards (holder_id, member_id, slot)
  where slot <> 'repeat';
create unique index tap_card_earned_rewards_one_used_a_visit
  on public.tap_card_earned_rewards (used_visit_id)
  where used_visit_id is not null;
create index tap_card_earned_rewards_waiting
  on public.tap_card_earned_rewards (holder_id, member_id)
  where used_at is null;

do $$
declare t text;
begin
  foreach t in array array['tap_card_member_offers', 'tap_card_offer_templates', 'tap_card_member_settings',
    'tap_card_plates', 'tap_card_earned_rewards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
