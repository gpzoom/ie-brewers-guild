-- Inland Tap Card loyalty rewards: member offers, templates, the expiry
-- setting, counter plates and earned rewards -- the rules the database
-- enforces, and that no client session can touch any of it. Runs inside one
-- transaction that is rolled back at the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(16);

insert into _tap (line) select has_table('public', t, t || ' exists')
from unnest(array['tap_card_member_offers', 'tap_card_offer_templates', 'tap_card_member_settings',
  'tap_card_earned_rewards', 'tap_card_plates']) as t;
insert into _tap (line) select hasnt_table('public', 'tap_card_offers', 'the old per-brewery trail offer table is gone');

insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_member_offers (member_id, slot, live_visit_number, live_reward, live_terms)
      values ('f1000000-0000-4000-8000-000000000001', 'step4', 3, 'Free pretzel', '') $q$,
  '23514', null, 'a slot other than step1-3/repeat is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_member_offers (member_id, slot, live_visit_number, live_reward, live_terms)
      values ('f1000000-0000-4000-8000-000000000001', 'step1', 1, 'Free pretzel', '') $q$,
  '23514', null, 'visit 1 is the Beer Trail visit, so a step at visit 1 is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_member_offers (member_id, slot, live_visit_number, live_reward, live_terms)
      values ('f1000000-0000-4000-8000-000000000001', 'step1', 3, 'ab', '') $q$,
  '23514', null, 'a reward under 3 characters is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_member_settings (member_id, reward_expiry_days)
      values ('f1000000-0000-4000-8000-000000000001', 45) $q$,
  '23514', null, 'an expiry outside 30/60/90/365 days is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_plates (member_id, code, staff_code)
      values ('f1000000-0000-4000-8000-000000000001', 'ABCD2345', '12a4') $q$,
  '23514', null, 'a staff code that is not 4 digits is refused');

-- Earned rewards need a holder and visits (service-role setup).
insert into public.tap_card_batches (id, label, card_count, is_test) values
  ('f4000000-0000-4000-8000-000000000001', 'pgTAP batch', 1, true);
insert into public.tap_card_holders (id, name, email, age_confirmed_via) values
  ('f4100000-0000-4000-8000-000000000001', 'Pat Tester', 'pat@example.test', 'customer');
insert into public.tap_card_visits (id, holder_id, member_id, visit_day) values
  ('f4400000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2026-06-01'),
  ('f4400000-0000-4000-8000-000000000002', 'f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2026-06-02'),
  ('f4400000-0000-4000-8000-000000000003', 'f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2026-06-03');
insert into public.tap_card_earned_rewards (id, holder_id, member_id, slot, reward, earned_visit_id, expires_at) values
  ('f4500000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
   'step1', 'Free pretzel', 'f4400000-0000-4000-8000-000000000001', '2026-09-01');

insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_earned_rewards (holder_id, member_id, slot, reward, earned_visit_id, expires_at)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
              'step1', 'Free pretzel again', 'f4400000-0000-4000-8000-000000000002', '2026-09-02') $q$,
  '23505', null, 'a step is earned once per person per brewery');
insert into _tap (line) select lives_ok(
  $q$ insert into public.tap_card_earned_rewards (holder_id, member_id, slot, reward, earned_visit_id, expires_at)
      values ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
              'repeat', 'Two dollars off', 'f4400000-0000-4000-8000-000000000002', '2026-09-02'),
             ('f4100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
              'repeat', 'Two dollars off', 'f4400000-0000-4000-8000-000000000003', '2026-09-03') $q$,
  'the repeating reward can be earned on many visits');

update public.tap_card_earned_rewards
  set used_at = now(), used_visit_id = 'f4400000-0000-4000-8000-000000000003'
  where id = 'f4500000-0000-4000-8000-000000000001';
insert into _tap (line) select throws_ok(
  $q$ update public.tap_card_earned_rewards set used_at = now(), used_visit_id = 'f4400000-0000-4000-8000-000000000003'
      where slot = 'repeat' and earned_visit_id = 'f4400000-0000-4000-8000-000000000002' $q$,
  '23505', null, 'one member reward used per visit');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_earned_rewards $q$, '42501', null, 'owner session: cannot read earned rewards');
reset role;
set local role anon;
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_offer_templates $q$, '42501', null, 'anon: cannot read templates');
reset role;

select line from _tap order by n;
rollback;
