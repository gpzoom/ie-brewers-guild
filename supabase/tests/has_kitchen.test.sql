-- "We have our own kitchen" (20261003100000_member_has_kitchen.sql): a
-- producer's owner (or a Guild admin) flips members.has_kitchen through
-- set_member_has_kitchen(); nobody else can, and only producers have it.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(7);

insert into _tap (line) select is(
  (select has_kitchen from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  false, 'has_kitchen defaults to off');

set local role authenticated;

-- m1 (producer) is owned by f0..01; f0..02 is its full editor, f0..03 its Photos & events editor.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.set_member_has_kitchen('f1000000-0000-4000-8000-000000000001', true) $q$,
  'owner: turns the kitchen switch on');
insert into _tap (line) select is(
  (select has_kitchen from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  true, 'owner: the switch is saved');
insert into _tap (line) select throws_ok(
  $q$ select public.set_member_has_kitchen('f1000000-0000-4000-8000-000000000004', true) $q$,
  '22023', null, 'a mobile member has no kitchen switch');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.set_member_has_kitchen('f1000000-0000-4000-8000-000000000001', false) $q$,
  '42501', null, 'Photos & events editor: refused');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.set_member_has_kitchen('f1000000-0000-4000-8000-000000000001', false) $q$,
  '42501', null, 'a stranger: refused');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.set_member_has_kitchen('f1000000-0000-4000-8000-000000000001', false) $q$,
  'Guild admin: can change it (Edit as them)');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
