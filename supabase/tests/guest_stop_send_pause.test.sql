-- The visit-email pause switch (20261115100000_guest_stop_send_pause.sql).
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(4);

insert into _tap (line) select has_table('public', 'guest_stop_send_pause', 'the pause switch exists');

insert into public.guest_stop_notices (host_member_id, event_id, kind, guest_name, title, starts_at) values
  ('f1000000-0000-4000-8000-000000000001', null, 'new', 'Rolling Taps', 'Pause test', now() + interval '1 day');

update public.guest_stop_send_pause set paused = true;
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(100000, false) c where c.title = 'Pause test'),
  0, 'while paused, nothing is claimed');
insert into _tap (line) select is(
  (select sent_at from public.guest_stop_notices where title = 'Pause test'),
  null, 'the paused note waits in the queue');

update public.guest_stop_send_pause set paused = false;
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(100000, false) c where c.title = 'Pause test'),
  1, 'unpaused, the waiting note is claimed');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
