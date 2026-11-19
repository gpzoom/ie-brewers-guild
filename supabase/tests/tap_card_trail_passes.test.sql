-- Beer Trail Pass tables: exist, one row per Zeffy ticket, commission bounds,
-- and no client session can read them. Rolled back at the end.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(9);

insert into _tap (line) select has_table('public', t, t || ' exists')
from unnest(array['tap_card_trail_campaigns', 'tap_card_trail_joins', 'tap_card_trail_passes', 'tap_card_member_subscribers']) as t;

insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_trail_campaigns (year, zeffy_campaign_id, form_url, commission_pct)
      values (2099, 'pgtap-camp', 'https://example.test/form', 101) $q$,
  '23514', null, 'commission over 100% is refused');

insert into public.tap_card_trail_passes (zeffy_payment_id, zeffy_item_id, member_id, year, amount_cents, paid_at)
values ('pgtap-pay', 'pgtap-item', 'f1000000-0000-4000-8000-000000000001', 2099, 2000, now());
insert into _tap (line) select throws_ok(
  $q$ insert into public.tap_card_trail_passes (zeffy_payment_id, zeffy_item_id, year, amount_cents, paid_at)
      values ('pgtap-pay', 'pgtap-item', 2099, 2000, now()) $q$,
  '23505', null, 'the same Zeffy ticket is recorded once');

insert into public.tap_card_trail_joins (email, opt_in) values ('Pat@Example.test', true);
insert into _tap (line) select is(
  (select email_lower from public.tap_card_trail_joins where email = 'Pat@Example.test'),
  'pat@example.test', 'join email is matched case-insensitively');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_trail_passes $q$, '42501', null, 'owner session: cannot read passes');
reset role;
set local role anon;
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.tap_card_member_subscribers $q$, '42501', null, 'anon: cannot read subscribers');
reset role;

select line from _tap order by n;
rollback;
