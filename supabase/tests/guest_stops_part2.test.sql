-- Guild Mobile members at taprooms, Part 2 (20261008100000_guest_stops_part2.sql):
-- Ask me first, the pending/declined statuses, the notes queue, its delete
-- trigger and the claim. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(17);

insert into _tap (line) select has_column('public', 'members', 'guest_stops_mode', 'members.guest_stops_mode exists');
insert into _tap (line) select is(
  (select guest_stops_mode from public.members where id = 'f1000000-0000-4000-8000-000000000001'), 'show', 'default is show');

insert into public.events (id, member_id, source, kind, title, starts_at, ends_at, venue_name) values
  ('f3000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Tacos', now() + interval '1 day', now() + interval '1 day 3 hours', 'PgTap Brewing'),
  ('f3000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'More tacos', now() + interval '2 days', null, 'PgTap Brewing'),
  ('f3000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Old tacos', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'PgTap Brewing');
insert into public.event_hosts (event_id, host_member_id, status, guest_name, title, notified_starts_at, notified_ends_at) values
  ('f3000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000001', 'pending', 'Rolling Taps', 'Tacos', now() + interval '1 day', now() + interval '1 day 3 hours'),
  ('f3000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000001', 'hidden', 'Rolling Taps', 'More tacos', now() + interval '2 days', null),
  ('f3000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000001', 'shown', 'Rolling Taps', 'Old tacos', now() - interval '3 days', now() - interval '3 days' + interval '2 hours');

-- The setting: owner and full editor yes; Photos & events editor and strangers no.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'ask') $q$,
  '42501', null, 'a Photos & events editor can''t change the setting');
insert into _tap (line) select lives_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000022', 'declined') $q$,
  'a Photos & events editor can decline a visit');
insert into _tap (line) select throws_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000022', 'pending') $q$,
  '22023', null, 'people can''t set pending');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'ask') $q$,
  '42501', null, 'a stranger can''t change the setting');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select is(
  public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'ask'), 'ask', 'a full editor turns on Ask me first');
insert into _tap (line) select throws_ok(
  $q$ select public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'maybe') $q$,
  '22023', null, 'an unknown mode is refused');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is(
  public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'show'), 'show', 'the owner switches back to Show right away');
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000021'), 'shown',
  'switching to show turns waiting visits into shown');
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000022'), 'declined',
  'a declined visit stays declined');
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.guest_stop_notices $q$,
  '42501', null, 'members can''t read the notes queue');
reset role;

-- The delete trigger: an upcoming shown link that disappears leaves a canceled note; a past or declined one doesn't.
delete from public.events where id in (
  'f3000000-0000-4000-8000-000000000021', 'f3000000-0000-4000-8000-000000000022', 'f3000000-0000-4000-8000-000000000023');
insert into _tap (line) select is(
  (select count(*)::int from public.guest_stop_notices where kind = 'canceled'), 1, 'one canceled note: the upcoming shown visit');
insert into _tap (line) select is(
  (select guest_name || ' / ' || title from public.guest_stop_notices where kind = 'canceled'), 'Rolling Taps / Tacos',
  'the note carries the snapshot');

-- The claim: a second claim never gets the same note; the Sample filter splits the queue.
insert into public.guest_stop_notices (host_member_id, kind, guest_name, starts_at) values
  ('f1000000-0000-4000-8000-000000000001', 'new', 'Rolling Taps', now() + interval '1 day');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(50, false)), 2, 'the first claim takes both unsent notes');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(50, false)), 0, 'a second claim gets nothing');
update public.members set business_name = 'Sample PgTap' where id = 'f1000000-0000-4000-8000-000000000002';
insert into public.guest_stop_notices (host_member_id, kind, guest_name, starts_at) values
  ('f1000000-0000-4000-8000-000000000002', 'new', 'Rolling Taps', now() + interval '1 day');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(50, false)), 0, 'the live site leaves Sample taprooms to staging');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
