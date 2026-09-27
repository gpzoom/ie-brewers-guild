-- The Help button's messages (20260927160000_support_messages.sql,
-- 20260927170000_support_messages_status.sql): only
-- the server writes them, and only the super admin can read them. A
-- member or a Guild admin can't read, add, change or delete one straight
-- through the database. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(12);

-- The super admin for this test (f0..07).
insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

-- What the server writes (as the service role; here, as postgres).
insert into public.support_messages (id, kind, first_name, email, message, member_id, member_name, submitted_by_user_id)
values ('f4000000-0000-4000-8000-000000000001', 'bug', 'Sam', 'pgtap-owner@example.test', 'It broke.',
        'f1000000-0000-4000-8000-000000000001', 'PgTap Brewing', 'f0000000-0000-4000-8000-000000000001');

insert into _tap (line) select throws_ok(
  $q$ insert into public.support_messages (kind, first_name, email, message) values ('praise', 'Sam', 'a@b.co', 'hi') $q$,
  '23514', null, 'only bug and feature are kinds');
insert into _tap (line) select is(
  (select status from public.support_messages where id = 'f4000000-0000-4000-8000-000000000001'),
  'waiting', 'a new message is waiting');
insert into _tap (line) select throws_ok(
  $q$ update public.support_messages set status = 'lost' where id = 'f4000000-0000-4000-8000-000000000001' $q$,
  '23514', null, 'only waiting and done are statuses');

-- The member who sent it can't read it back, or send one straight to the table.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is((select count(*)::int from public.support_messages), 0, 'owner: reads nothing');
insert into _tap (line) select throws_ok(
  $q$ insert into public.support_messages (kind, first_name, email, message) values ('bug', 'Sam', 'a@b.co', 'hi') $q$,
  '42501', null, 'owner: cannot add a message directly');

-- A Guild admin can't read them either.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is((select count(*)::int from public.support_messages), 0, 'guild admin: reads nothing');
insert into _tap (line) select throws_ok(
  $q$ insert into public.support_messages (kind, first_name, email, message) values ('bug', 'Sam', 'a@b.co', 'hi') $q$,
  '42501', null, 'guild admin: cannot add a message directly');

-- The super admin reads them, but can't change or delete them.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
-- (The shared database may hold real messages too, so these look for the fixture's own.)
insert into _tap (line) select is(
  (select count(*)::int from public.support_messages where id = 'f4000000-0000-4000-8000-000000000001'), 1,
  'super admin: reads the message');
insert into _tap (line) select is(
  (select count(*)::int from public.support_messages
    where status = 'waiting' and id = 'f4000000-0000-4000-8000-000000000001'), 1,
  'super admin: counts the waiting ones (the bell)');
update public.support_messages set message = 'changed', status = 'done' where id = 'f4000000-0000-4000-8000-000000000001';
delete from public.support_messages where id = 'f4000000-0000-4000-8000-000000000001';

reset role;
insert into _tap (line) select is(
  (select message from public.support_messages where id = 'f4000000-0000-4000-8000-000000000001'),
  'It broke.', 'super admin: an update changes nothing (marking done goes through the server)');
insert into _tap (line) select is(
  (select count(*)::int from public.support_messages where id = 'f4000000-0000-4000-8000-000000000001'),
  1, 'super admin: a delete removes nothing');

-- Deleting the member keeps the message, with the name it was sent under.
delete from public.members where id = 'f1000000-0000-4000-8000-000000000001';
insert into _tap (line) select is(
  (select member_id is null and member_name = 'PgTap Brewing' from public.support_messages
    where id = 'f4000000-0000-4000-8000-000000000001'),
  true, 'a deleted member leaves the message, still named');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
