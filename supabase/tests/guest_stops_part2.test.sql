-- Guild Mobile members at taprooms, Part 2 (20261008100000_guest_stops_part2.sql):
-- Ask me first, the pending/declined statuses, the notes queue, its delete
-- trigger and the claim. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(26);

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
-- (This database is shared: every count below is limited to the test's own taprooms.)
delete from public.events where id in (
  'f3000000-0000-4000-8000-000000000021', 'f3000000-0000-4000-8000-000000000022', 'f3000000-0000-4000-8000-000000000023');
insert into _tap (line) select is(
  (select count(*)::int from public.guest_stop_notices
    where kind = 'canceled' and host_member_id = 'f1000000-0000-4000-8000-000000000001'),
  1, 'one canceled note: the upcoming shown visit');
insert into _tap (line) select is(
  (select guest_name || ' / ' || title from public.guest_stop_notices
    where kind = 'canceled' and host_member_id = 'f1000000-0000-4000-8000-000000000001'),
  'Rolling Taps / Tacos', 'the note carries the snapshot');

-- The claim: a second claim never gets the same note; each claim counts an attempt; the Sample filter splits the queue.
insert into public.guest_stop_notices (host_member_id, kind, guest_name, starts_at) values
  ('f1000000-0000-4000-8000-000000000001', 'new', 'Rolling Taps', now() + interval '1 day');
create temp table _claim1 on commit drop as select * from public.claim_guest_stop_notices(100000, false);
insert into _tap (line) select is(
  (select count(*)::int from _claim1 where host_member_id = 'f1000000-0000-4000-8000-000000000001'),
  2, 'the first claim takes both unsent notes');
insert into _tap (line) select is(
  (select max(attempts) from public.guest_stop_notices where host_member_id = 'f1000000-0000-4000-8000-000000000001'),
  1, 'a claim counts as an attempt');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(100000, false) c
    where c.host_member_id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'a second claim gets nothing');
update public.guest_stop_notices set claimed_at = null, attempts = 5
 where host_member_id = 'f1000000-0000-4000-8000-000000000001';
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(100000, false) c
    where c.host_member_id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'after 5 attempts a note is left alone');
update public.members set business_name = 'Sample PgTap' where id = 'f1000000-0000-4000-8000-000000000002';
insert into public.guest_stop_notices (host_member_id, kind, guest_name, starts_at) values
  ('f1000000-0000-4000-8000-000000000002', 'new', 'Rolling Taps', now() + interval '1 day');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(100000, false) c
    where c.host_member_id = 'f1000000-0000-4000-8000-000000000002'),
  0, 'the live site leaves Sample taprooms to staging');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(100000, true) c
    where c.host_member_id = 'f1000000-0000-4000-8000-000000000002'),
  1, 'staging takes the Sample taproom''s note');

-- apply_guest_links: a write applies only if the row is as the linker read it, and its notes go with it.
insert into public.events (id, member_id, source, kind, title, starts_at, ends_at, venue_name) values
  ('f3000000-0000-4000-8000-000000000024', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Tacos', now() + interval '3 days', now() + interval '3 days 3 hours', 'PgTap Brewing');
create temp table _ops on commit drop as select jsonb_build_array(jsonb_build_object(
  'link', jsonb_build_object('event_id', 'f3000000-0000-4000-8000-000000000024', 'host_member_id', 'f1000000-0000-4000-8000-000000000001',
    'status', 'pending', 'guest_name', 'Rolling Taps', 'title', 'Tacos', 'notified_starts_at', now() + interval '3 days',
    'notified_ends_at', now() + interval '3 days 3 hours', 'notified_all_day', false, 'cancel_notified', false),
  'expect', null,
  'notices', jsonb_build_array(jsonb_build_object('host_member_id', 'f1000000-0000-4000-8000-000000000001',
    'event_id', 'f3000000-0000-4000-8000-000000000024', 'kind', 'request', 'guest_name', 'Rolling Taps', 'title', 'Tacos',
    'starts_at', now() + interval '3 days', 'ends_at', now() + interval '3 days 3 hours', 'all_day', false,
    'old_starts_at', null, 'old_ends_at', null)))) as ops;
do $do$ begin perform public.apply_guest_links((select ops from _ops), '[]'::jsonb); end $do$;
do $do$ begin perform public.apply_guest_links((select ops from _ops), '[]'::jsonb); end $do$;
insert into _tap (line) select is(
  (select count(*)::int from public.guest_stop_notices where event_id = 'f3000000-0000-4000-8000-000000000024'),
  1, 'two runs writing the same new link queue one email');

-- The taproom approves between the linker's read and its write: the stale write (and its email) is dropped.
update public.event_hosts set status = 'shown' where event_id = 'f3000000-0000-4000-8000-000000000024';
do $do$ begin perform public.apply_guest_links(jsonb_build_array(jsonb_build_object(
  'link', jsonb_build_object('event_id', 'f3000000-0000-4000-8000-000000000024', 'host_member_id', 'f1000000-0000-4000-8000-000000000001',
    'status', 'pending', 'guest_name', 'Rolling Taps', 'title', 'Tacos', 'notified_starts_at', now() + interval '4 days',
    'notified_ends_at', null, 'notified_all_day', false, 'cancel_notified', false),
  'expect', jsonb_build_object('host_member_id', 'f1000000-0000-4000-8000-000000000001', 'status', 'pending',
    'notified_starts_at', now() + interval '3 days', 'notified_ends_at', now() + interval '3 days 3 hours', 'cancel_notified', false),
  'notices', jsonb_build_array(jsonb_build_object('host_member_id', 'f1000000-0000-4000-8000-000000000001',
    'event_id', 'f3000000-0000-4000-8000-000000000024', 'kind', 'changed', 'guest_name', 'Rolling Taps', 'title', 'Tacos',
    'starts_at', now() + interval '4 days', 'ends_at', null, 'all_day', false,
    'old_starts_at', now() + interval '3 days', 'old_ends_at', now() + interval '3 days 3 hours')))), '[]'::jsonb); end $do$;
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000024'),
  'shown', 'an Approve that lands mid-run is never undone');
insert into _tap (line) select is(
  (select count(*)::int from public.guest_stop_notices where event_id = 'f3000000-0000-4000-8000-000000000024'),
  1, 'and the stale write''s email isn''t queued');

-- A move to another taproom starts fresh: who last set the status is cleared.
update public.event_hosts set status_set_by_user_id = 'f0000000-0000-4000-8000-000000000001'
 where event_id = 'f3000000-0000-4000-8000-000000000024';
do $do$ begin perform public.apply_guest_links(jsonb_build_array(jsonb_build_object(
  'link', jsonb_build_object('event_id', 'f3000000-0000-4000-8000-000000000024', 'host_member_id', 'f1000000-0000-4000-8000-000000000002',
    'status', 'shown', 'guest_name', 'Rolling Taps', 'title', 'Tacos', 'notified_starts_at', now() + interval '3 days',
    'notified_ends_at', now() + interval '3 days 3 hours', 'notified_all_day', false, 'cancel_notified', false),
  'expect', jsonb_build_object('host_member_id', 'f1000000-0000-4000-8000-000000000001', 'status', 'shown',
    'notified_starts_at', now() + interval '3 days', 'notified_ends_at', now() + interval '3 days 3 hours', 'cancel_notified', false),
  'notices', '[]'::jsonb)), '[]'::jsonb); end $do$;
insert into _tap (line) select is(
  (select host_member_id::text || ' / ' || coalesce(status_set_by_user_id::text, 'none') from public.event_hosts
    where event_id = 'f3000000-0000-4000-8000-000000000024'),
  'f1000000-0000-4000-8000-000000000002 / none', 'a move relinks and clears who set the status');

-- Deleting a taproom (member) with an upcoming shown link works; no note is left pointing at it.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-000000000006', 'pgtap-m6', 'producer', 'Gone Brewing', 'Riverside', 'published');
insert into public.events (id, member_id, source, kind, title, starts_at, venue_name) values
  ('f3000000-0000-4000-8000-000000000025', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Tacos', now() + interval '2 days', 'Gone Brewing');
insert into public.event_hosts (event_id, host_member_id, status, guest_name, title, notified_starts_at) values
  ('f3000000-0000-4000-8000-000000000025', 'f1000000-0000-4000-8000-000000000006', 'shown', 'Rolling Taps', 'Tacos', now() + interval '2 days');
insert into _tap (line) select lives_ok(
  $q$ delete from public.members where id = 'f1000000-0000-4000-8000-000000000006' $q$,
  'a taproom with Guild member visits can be deleted');

set local role anon;
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.guest_stop_notices $q$,
  '42501', null, 'visitors can''t read the notes queue');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
