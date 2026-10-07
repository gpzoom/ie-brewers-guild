-- Guild Mobile members at taprooms (20261007100000_event_hosts.sql): a stop
-- linked to the taproom it's at. Only the service role writes rows; the
-- host's people and Guild admins flip shown/hidden through
-- set_event_host_status. Visitors read shown rows only.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(11);

insert into _tap (line) select has_table('public', 'event_hosts', 'event_hosts exists');

insert into public.events (id, member_id, source, kind, title, starts_at, venue_name)
values
  ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Tacos', now() + interval '1 day', 'PgTap Brewing'),
  ('f3000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'More tacos', now() + interval '2 days', 'PgTap Brewing');
insert into public.event_hosts (event_id, host_member_id, status) values
  ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'shown'),
  ('f3000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000001', 'hidden');

set local role anon;
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts), 1, 'a visitor reads only the shown link');
reset role;

-- The guest's event must be publicly readable too: an unpublished guest's link stays out of sight.
update public.members set status = 'draft' where id = 'f1000000-0000-4000-8000-000000000004';
set local role anon;
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts), 0, 'a visitor reads no link to an unpublished guest''s stop');
reset role;
update public.members set status = 'published' where id = 'f1000000-0000-4000-8000-000000000004';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts), 2, 'the host''s Photos & events editor reads both');
insert into _tap (line) select lives_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'hidden') $q$,
  'the host''s editor can hide a stop');
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000011'), 'hidden',
  'it is hidden');
insert into _tap (line) select throws_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'pending') $q$,
  '22023', null, 'an unknown status is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.event_hosts (event_id, host_member_id) values ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000002') $q$,
  '42501', null, 'a member can''t write link rows');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts where status = 'hidden'), 0, 'a stranger reads no hidden link');
insert into _tap (line) select throws_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'shown') $q$,
  '42501', null, 'a stranger can''t show or hide');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'shown') $q$,
  'a Guild admin can show it again');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
