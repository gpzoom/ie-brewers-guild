-- Guild testing switch (owner, 2026-11-19): while on, a campaign year's passes
-- unlock the Beer Trail offer and Guild rewards now, not only in that year.
-- Off by default; turn it off before the program goes live.
alter table public.tap_card_trail_campaigns add column unlock_now boolean not null default false;
