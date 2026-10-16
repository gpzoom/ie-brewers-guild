-- Business write functions (20261016100000_business_functions.sql): who may
-- call them, mode switching in part 2, linking a manager, Part of.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(19);

-- A three-location business nobody has been invited to, and a single member.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000b1', 'pgtap-biz-a', 'producer', 'PgTap Biz', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-0000000000b2', 'pgtap-biz-b', 'producer', 'PgTap Biz', 'Riverside', 'draft'),
  ('f1000000-0000-4000-8000-0000000000b3', 'pgtap-biz-c', 'producer', 'PgTap Biz', 'Irvine', 'draft'),
  ('f1000000-0000-4000-8000-0000000000b4', 'pgtap-solo', 'producer', 'PgTap Solo', 'Chino', 'draft');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-0000000000b1';
grant select on _biz to public;

-- Non-admins are refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager') $$, '42501', null,
  'member: cannot change a business mode');
insert into _tap (line) select throws_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000b4', (select id from _biz)) $$, '42501', null,
  'member: cannot change Part of');
insert into _tap (line) select throws_ok(
  $$ select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000001') $$, '42501', null,
  'member: cannot link a manager');
reset role;

-- Guild admin from here on.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';

select public.set_business_mode((select id from _biz), 'one_manager');
insert into _tap (line) select is(
  (select management_mode from public.businesses where id = (select id from _biz)), 'one_manager',
  'admin: switches an uninvited business to one manager');
-- audit_log is readable by the super admin only (RLS), so read it as the owner of the transaction.
reset role;
insert into _tap (line) select ok(
  exists (select 1 from public.audit_log where table_name = 'businesses' and row_id = (select id from _biz)
          and actor_user_id = 'f0000000-0000-4000-8000-000000000004'),
  'mode change is audit-logged against the admin');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';

-- Link the manager: owner of every location.
select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000006');
insert into _tap (line) select is(
  (select manager_user_id from public.businesses where id = (select id from _biz)),
  'f0000000-0000-4000-8000-000000000006'::uuid, 'manager recorded on the business');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users mu join public.members m on m.id = mu.member_id
    where m.business_id = (select id from _biz) and mu.user_id = 'f0000000-0000-4000-8000-000000000006' and mu.role = 'owner'),
  3, 'manager is owner of all three locations');
insert into _tap (line) select throws_ok(
  $$ select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000005') $$,
  'P0001', null, 'a second manager is refused');

-- Part 2 limits: back to separate refused once a manager exists.
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$, 'P0001', null,
  'switching back after a manager is invited is refused in part 2');

-- Adding the solo member to the one-manager business links the manager and asks to notify.
insert into _tap (line) select is(
  public.set_member_business('f1000000-0000-4000-8000-0000000000b4', (select id from _biz)) ->> 'notify_manager_user_id',
  'f0000000-0000-4000-8000-000000000006', 'joining a one-manager business returns the manager to email');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-0000000000b4'
     and user_id = 'f0000000-0000-4000-8000-000000000006'),
  'owner', 'the new location''s owner is the manager');

-- Leaving a one-manager business is refused in part 2.
insert into _tap (line) select throws_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000b4', null) $$, 'P0001', null,
  'leaving a one-manager business is refused in part 2');

-- Separate businesses: grouping two singles by member id, then splitting cleans up.
reset role;
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c1', 'pgtap-x', 'producer', 'PgTap X', 'Corona', 'draft'),
  ('f1000000-0000-4000-8000-0000000000c2', 'pgtap-y', 'producer', 'PgTap Y Different', 'Norco', 'draft');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_member_business('f1000000-0000-4000-8000-0000000000c2', 'f1000000-0000-4000-8000-0000000000c1');
insert into _tap (line) select ok(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1') is not null
  and (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1')
    = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c2'),
  'target = another member: both share a new business');
insert into _tap (line) select is(
  (select name from public.businesses where id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1')),
  'PgTap X', 'the new business is named after the target member');
select public.set_member_business('f1000000-0000-4000-8000-0000000000c2', null);
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1'), null,
  'taking out the second-to-last location clears the last one too');
insert into _tap (line) select is(
  (select count(*)::int from public.businesses where name = 'PgTap X'), 0,
  'and deletes the empty business');

-- The name rule never joins a one-manager business (Part of does, linking the manager).
reset role;
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c3', 'pgtap-biz-d', 'producer', 'PgTap Biz', 'Temecula', 'draft');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c3'), null,
  'a same-name location is not auto-joined to a one-manager business');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000002'), null,
  'unrelated members untouched');

-- A publish re-saves business_name unchanged; that must not undo a Part of choice.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000d1', 'pgtap-sep-1', 'producer', 'PgTap Sep', 'Colton', 'draft'),
  ('f1000000-0000-4000-8000-0000000000d2', 'pgtap-sep-2', 'producer', 'PgTap Sep', 'Fontana', 'draft'),
  ('f1000000-0000-4000-8000-0000000000d3', 'pgtap-sep-3', 'producer', 'PgTap Sep', 'Rialto', 'draft');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_member_business('f1000000-0000-4000-8000-0000000000d3', null);
reset role;
update public.members set business_name = business_name where id = 'f1000000-0000-4000-8000-0000000000d3';
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000d3'), null,
  'a publish that re-saves the same name does not re-join a member the Guild took out');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
