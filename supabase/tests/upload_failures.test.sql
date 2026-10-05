-- Rejected uploads (20261005110000_upload_failures.sql): written by the
-- server (service role) when a photo is refused, so support can see what
-- was tried. Only Guild admins can read them; nobody writes them directly.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(5);

insert into _tap (line) select has_table('public', 'upload_failures', 'upload_failures exists');

insert into public.upload_failures (member_id, source, original_filename, claimed_type, detected_type, byte_size, reason)
values ('f1000000-0000-4000-8000-000000000001', 'gallery', 'beer.jpg', 'image/jpeg', 'image/webp', 1234, 'unreadable');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.upload_failures where original_filename = 'beer.jpg'), 1,
  'a Guild admin can read them');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.upload_failures), 0,
  'a member (even the owner) can''t read them');
insert into _tap (line) select throws_ok(
  $q$ insert into public.upload_failures (source, original_filename, reason) values ('gallery', 'x.jpg', 'x') $q$,
  '42501', null, 'a member can''t write them');

reset role;
set local role anon;
insert into _tap (line) select is(
  (select count(*)::int from public.upload_failures), 0, 'a visitor can''t read them');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
