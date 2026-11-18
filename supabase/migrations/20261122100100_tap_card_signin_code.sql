-- Tap Card sign-in code: the sign-in email also carries a 6-digit code
-- (hashed with its row id), for places the emailed link can't reach, such as
-- a card saved to an iPhone's Home Screen. 5 wrong tries end it.
alter table public.tap_card_login_tokens
  add column code_hash text,
  add column code_tries int not null default 0;
