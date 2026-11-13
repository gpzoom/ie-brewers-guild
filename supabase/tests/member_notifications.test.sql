-- Member notifications (20261116100000_member_notifications.sql): the table,
-- the settings singleton, the RPCs (apply, insert, claim, public hidden-event
-- list, mark read) and who can read what. Runs inside one transaction that is
-- rolled back.
--
-- This database is shared: every count below is limited to the test's own
-- members (m1 f1..01 producer, m4 f1..04 mobile) or its own dedupe keys.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(24);

insert into _tap (line) select has_table('public', 'member_notifications', 'member_notifications exists');
insert into _tap (line) select has_table('public', 'member_notification_settings', 'member_notification_settings exists');
insert into _tap (line) select has_column('public', 'calendar_connections', 'feed_time_zone', 'calendar_connections.feed_time_zone exists');

-- Emails off (launch), not paused, whatever the shared row says right now.
update public.member_notification_settings set emails_enabled = false, paused = false;

insert into public.events (id, member_id, source, kind, title, starts_at, venue_name) values
  ('f3000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000001', 'manual', 'event', 'Trivia', now() + interval '5 days', 'PgTap Brewing');

create temp table _open on commit drop as select jsonb_build_array(jsonb_build_object(
  'type', 'closed_day_conflict', 'kind', 'problem', 'member_id', 'f1000000-0000-4000-8000-000000000001',
  'dedupe_key', 'pgtap:closed_day_conflict:m1:e31', 'event_id', 'f3000000-0000-4000-8000-000000000031',
  'details', jsonb_build_object('role', 'own', 'event_id', 'f3000000-0000-4000-8000-000000000031'),
  'due_date', current_date + 5, 'recipient_roles', jsonb_build_array('owner', 'co_owner', 'editor', 'media_events'),
  'email_mode', 'batched', 'reminder_days', 3)) as opens;
grant select on _open to public;

-- Opening the same problem twice keeps one open row.
do $do$ begin perform public.apply_member_problems((select opens from _open), '{}'::uuid[]); end $do$;
do $do$ begin perform public.apply_member_problems((select opens from _open), '{}'::uuid[]); end $do$;
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications where dedupe_key = 'pgtap:closed_day_conflict:m1:e31'),
  1, 'the same open problem twice is one row');
insert into _tap (line) select is(
  (select quiet from public.member_notifications where dedupe_key = 'pgtap:closed_day_conflict:m1:e31'),
  true, 'a real member''s problem is quiet while emails are off');

-- Visitors learn the hidden event id, and nothing for a resolved conflict.
set local role anon;
insert into _tap (line) select is(
  (select count(*)::int from public.open_conflict_event_ids(array['f3000000-0000-4000-8000-000000000031'::uuid])),
  1, 'visitors get the event id of an open conflict');
reset role;
do $do$ begin perform public.apply_member_problems('[]'::jsonb, (select array_agg(id) from public.member_notifications
  where dedupe_key = 'pgtap:closed_day_conflict:m1:e31' and status = 'open')); end $do$;
set local role anon;
insert into _tap (line) select is(
  (select count(*)::int from public.open_conflict_event_ids(array['f3000000-0000-4000-8000-000000000031'::uuid])),
  0, 'a resolved conflict hides nothing');
reset role;

-- It comes back: a new row.
do $do$ begin perform public.apply_member_problems((select opens from _open), '{}'::uuid[]); end $do$;
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications where dedupe_key = 'pgtap:closed_day_conflict:m1:e31'),
  2, 'after resolving, the same problem opens a second row');

-- Deleting the event keeps the notifications, without the event.
delete from public.events where id = 'f3000000-0000-4000-8000-000000000031';
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications
    where dedupe_key = 'pgtap:closed_day_conflict:m1:e31' and event_id is null),
  2, 'deleting the event keeps the rows with event_id null');

-- Sample members are never quiet.
update public.members set business_name = 'Sample PgTap Mobile' where id = 'f1000000-0000-4000-8000-000000000004';
do $do$ begin perform public.insert_member_message(jsonb_build_object(
  'type', 'pgtap_message', 'member_id', 'f1000000-0000-4000-8000-000000000004', 'dedupe_key', 'pgtap:msg1',
  'details', jsonb_build_object('note', 'hello'), 'recipient_roles', jsonb_build_array('owner', 'editor'),
  'email_mode', 'batched')); end $do$;
insert into _tap (line) select is(
  (select quiet::text || ' / ' || status from public.member_notifications where dedupe_key = 'pgtap:msg1'),
  'false / unread', 'a Sample member''s message is not quiet, and starts unread');

-- The claim: nothing while paused; then the notice.
update public.member_notification_settings set paused = true;
insert into _tap (line) select is(
  (select count(*)::int from public.claim_member_notification_emails(100000, true) c
    where c.member_id = 'f1000000-0000-4000-8000-000000000004'),
  0, 'the claim hands out nothing while paused');
update public.member_notification_settings set paused = false;
insert into _tap (line) select is(
  (select string_agg(c.send_kind, ',') from public.claim_member_notification_emails(100000, true) c
    where c.dedupe_key = 'pgtap:msg1'),
  'notice', 'staging claims the Sample member''s new message as a notice');

-- The reminder: only inside its window (3 days before due, in the member's time zone).
do $do$ begin perform public.apply_member_problems(jsonb_build_array(jsonb_build_object(
  'type', 'closed_day_conflict', 'kind', 'problem', 'member_id', 'f1000000-0000-4000-8000-000000000004',
  'dedupe_key', 'pgtap:closed_day_conflict:m4:x', 'details', jsonb_build_object('role', 'guest'),
  'due_date', (select (now() at time zone timezone)::date + 10 from public.members where id = 'f1000000-0000-4000-8000-000000000004'),
  'recipient_roles', jsonb_build_array('owner', 'co_owner', 'editor', 'media_events'),
  'email_mode', 'batched', 'reminder_days', 3)), '{}'::uuid[]); end $do$;
update public.member_notifications set notice_sent_at = now() where dedupe_key = 'pgtap:closed_day_conflict:m4:x';
insert into _tap (line) select is(
  (select count(*)::int from public.claim_member_notification_emails(100000, true) c
    where c.dedupe_key = 'pgtap:closed_day_conflict:m4:x'),
  0, 'no reminder before its window');
update public.member_notifications
   set due_date = (select (now() at time zone timezone)::date + 2 from public.members where id = 'f1000000-0000-4000-8000-000000000004')
 where dedupe_key = 'pgtap:closed_day_conflict:m4:x';
insert into _tap (line) select is(
  (select string_agg(c.send_kind, ',') from public.claim_member_notification_emails(100000, true) c
    where c.dedupe_key = 'pgtap:closed_day_conflict:m4:x'),
  'reminder', 'a reminder once it is due');

-- A row that also involves a real member (m1) is the live site's, not staging's.
do $do$ begin perform public.insert_member_message(jsonb_build_object(
  'type', 'pgtap_message', 'member_id', 'f1000000-0000-4000-8000-000000000004', 'dedupe_key', 'pgtap:msg2',
  'details', jsonb_build_object('other_member_id', 'f1000000-0000-4000-8000-000000000001'),
  'recipient_roles', jsonb_build_array('owner', 'co_owner', 'editor', 'media_events'), 'email_mode', 'batched')); end $do$;
insert into _tap (line) select is(
  (select count(*)::int from public.claim_member_notification_emails(100000, true) c where c.dedupe_key = 'pgtap:msg2'),
  0, 'staging skips a row involving a real member');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_member_notification_emails(100000, false) c where c.dedupe_key = 'pgtap:msg2'),
  1, 'the live site takes it');
create temp table _msg2 on commit drop as
  select id from public.member_notifications where dedupe_key = 'pgtap:msg2';
grant select on _msg2 to public;

-- Who reads what. Test rows: 2 on m1, 3 on m4 (msg1 is for owner and editor only).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications where member_id = 'f1000000-0000-4000-8000-000000000001'),
  2, 'the owner reads m1''s rows');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications where member_id = 'f1000000-0000-4000-8000-000000000004'),
  2, 'a Photos & events editor doesn''t read a row not meant for their role');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications), 0, 'a stranger reads nothing');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.member_notifications
    where member_id in ('f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004')),
  5, 'the Guild admin reads all');

-- Mark read: the member's people (role in recipient_roles) yes, strangers no.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.mark_member_notification_read((select id from public.member_notifications where dedupe_key = 'pgtap:msg1')) $q$,
  'a full editor marks a message read');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.mark_member_notification_read((select id from _msg2)) $q$,
  '42501', null, 'a stranger can''t mark another member''s message read');
reset role;
insert into _tap (line) select is(
  (select status || ' / ' || (read_at is not null)::text from public.member_notifications where dedupe_key = 'pgtap:msg1'),
  'read / true', 'the message is read, with the time');

set local role anon;
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.member_notifications $q$,
  '42501', null, 'visitors can''t read notifications');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
