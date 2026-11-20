-- Universal card (spec 2026-11-19): members that aren't Beer Trail stops may
-- reward visit 1. The app still keeps trail stops at visit 2+ (visit 1 there
-- is the Beer Trail offer); the repeating reward stays every 2+ visits.
alter table public.tap_card_member_offers drop constraint if exists tap_card_member_offers_live_visit_number_check;
alter table public.tap_card_member_offers drop constraint if exists tap_card_member_offers_draft_visit_number_check;
alter table public.tap_card_member_offers add constraint tap_card_member_offers_live_visit_number_check check (live_visit_number >= 1);
alter table public.tap_card_member_offers add constraint tap_card_member_offers_draft_visit_number_check check (draft_visit_number >= 1);
