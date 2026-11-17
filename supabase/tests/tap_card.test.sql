-- Inland Tap Card: tables, the one-visit-a-day and one-offer-a-year rules,
-- and that no client session can read or write any of it. Runs inside one
-- transaction that is rolled back at the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(26);

insert into _tap (line) select has_table('public', t, t || ' exists')
from unnest(array['tap_card_batches', 'tap_cards', 'tap_card_holders', 'tap_card_visits', 'scanner_devices',
  'tap_card_offers', 'tap_card_milestones', 'tap_card_rewards', 'tap_card_login_tokens', 'tap_card_sessions']) as t;

insert into _tap (line) select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'site_settings' and column_name = 'tap_card_price_cents'),
  '500', 'site_settings.tap_card_price_cents defaults to 500');
insert into _tap (line) select has_column('public', 'site_settings', 'tap_card_period', 'site_settings.tap_card_period exists');

-- Service-role setup (the test runs as the owner of the tables).
insert into public.tap_card_batches (id, label, member_id, card_count, is_test) values
  ('f4000000-0000-4000-8000-000000000001', 'pgTAP batch', 'f1000000-0000-4000-8000-000000000001', 2, true);
insert into public.tap_card_holders (id, name, email, age_confirmed_via) values
  ('f4100000-0000-4000-8000-000000000001', 'Pat Tester', 'Pat@example.test', 'customer');
insert into public.tap_cards (id, code, batch_id, holder_id, activated_at) values
  ('f4200000-0000-4000-8000-000000000001', 'ABCD2345', 'f4000000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', now());
insert into public.scanner_devices (id, member_id, label, token_hash) values
  ('f4300000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Bar iPad', 'pgtap-hash-1');
insert into public.tap_card_visits (holder_id, member_id, card_id, device_id, visit_day, redeemed_year) values
  ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
   'f4200000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', '2026-06-01', 2026);

insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_visits (holder_id, member_id, visit_day)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2026-06-01') $q$,
  '23505', null, 'second visit the same day at the same brewery is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_visits (holder_id, member_id, visit_day, redeemed_year)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2026-07-01', 2026) $q$,
  '23505', null, 'second redemption in the same year at the same brewery is refused');
insert into _tap (line) select lives_ok(
  $q$ insert into public.tap_card_visits (holder_id, member_id, visit_day)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2026-07-01') $q$,
  'a visit on another day without redeeming is fine');
insert into _tap (line) select lives_ok(
  $q$ insert into public.tap_card_visits (holder_id, member_id, visit_day, redeemed_year)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2027-01-01', 2027) $q$,
  'a redemption in the next year is fine');
insert into _tap (line) select lives_ok(
  $q$ insert into public.tap_card_visits (holder_id, member_id, visit_day, redeemed_year)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', '2026-06-01', 2026) $q$,
  'the same day at another brewery is fine');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_cards (code, batch_id) values ('ABCI1234', 'f4000000-0000-4000-8000-000000000001') $q$,
  '23514', null, 'a code with a letter outside the card alphabet is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_cards (code, batch_id) values ('ABCD2345', 'f4000000-0000-4000-8000-000000000001') $q$,
  '23505', null, 'a duplicate card code is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_holders (name, email, age_confirmed_via) values ('Pat Again', 'pat@EXAMPLE.test', 'staff') $q$,
  '23505', null, 'the same email in a different case is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_offers (member_id, offer_text, status)
      values ('f1000000-0000-4000-8000-000000000001', 'Free flight', 'maybe') $q$,
  '23514', null, 'an offer status outside pending/approved/declined is refused');

-- No client session can read or write any of it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_holders $q$, '42501', null, 'owner session: cannot read holders');
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_visits $q$, '42501', null, 'owner session: cannot read visits');
insert into _tap (line) select throws_ok(
  $q$ insert into public.scanner_devices (member_id, label, token_hash)
      values ('f1000000-0000-4000-8000-000000000001', 'Sneaky', 'x') $q$,
  '42501', null, 'owner session: cannot add a scanner device directly');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_cards $q$, '42501', null, 'guild admin session: reads go through the server, not the client');
reset role;
set local role anon;
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_offers $q$, '42501', null, 'anon: cannot read offers');
reset role;

select line from _tap order by n;
rollback;
