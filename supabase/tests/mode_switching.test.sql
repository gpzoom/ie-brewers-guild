-- Mode switching with existing owners, and leaving a one-manager business
-- (20261018110000_business_mode_switching.sql). Runs inside one
-- transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(21);

-- Three locations: Redlands owned by f0..01, Riverside owned by f0..05
-- (with f0..03 as its Photos & events editor), Irvine unclaimed.
insert into public.members (id, slug, member_type, business_name, city, status, theme) values
  ('f1000000-0000-4000-8000-000000000201', 'pgtap-sw-a', 'producer', 'PgTap Switch', 'Redlands', 'draft', 'forest'),
  ('f1000000-0000-4000-8000-000000000202', 'pgtap-sw-b', 'producer', 'PgTap Switch', 'Riverside', 'draft', 'garnet'),
  ('f1000000-0000-4000-8000-000000000203', 'pgtap-sw-c', 'producer', 'PgTap Switch', 'Irvine', 'draft', 'olive');
insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000201', 'f0000000-0000-4000-8000-000000000001', 'owner'),
  ('f1000000-0000-4000-8000-000000000202', 'f0000000-0000-4000-8000-000000000005', 'owner'),
  ('f1000000-0000-4000-8000-000000000202', 'f0000000-0000-4000-8000-000000000001', 'media_events');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-000000000201';
grant select on _biz to public;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager', null, 'f0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a member can''t switch the mode');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate', null, 'f0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'A manager is chosen only when switching to one manager.', 'a manager with separate is refused');

-- Redlands' owner becomes the manager; Riverside's look is kept.
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager',
       'f1000000-0000-4000-8000-000000000202', 'f0000000-0000-4000-8000-000000000001') $$,
  'guild admin: switches a business with owners to one manager');
reset role;
insert into _tap (line) select is(
  (select manager_user_id from public.businesses where id = (select id from _biz)),
  'f0000000-0000-4000-8000-000000000001'::uuid, 'the manager is recorded');
insert into _tap (line) select is(
  (select string_agg(theme, ',' order by city) from public.members where business_id = (select id from _biz)),
  'garnet,garnet,garnet', 'every location takes the chosen look');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000201'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager keeps owning Redlands');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'
     and user_id = 'f0000000-0000-4000-8000-000000000005'), 'owner', 'Riverside''s owner stays its owner (handed off)');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'editor', 'the manager''s Photos & events link is raised to editor');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000203'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager owns the unclaimed Irvine');

-- A pending hand-off blocks switching back.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.hand_off_location('f1000000-0000-4000-8000-000000000203', 'pgtap-editor@example.test');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$,
  'P0001', 'Cancel the pending hand-off first.', 'a pending hand-off blocks the switch');
reset role;
update public.member_invites set cancelled_at = now()
  where member_id = 'f1000000-0000-4000-8000-000000000203' and role = 'owner';

-- Back to separate: owners and looks stay; the manager's handed-off link goes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$,
  'guild admin: switches back to each location separately');
reset role;
insert into _tap (line) select is(
  (select management_mode || ' ' || coalesce(manager_user_id::text, 'none') from public.businesses where id = (select id from _biz)),
  'separate none', 'separate, no manager');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 0, 'the manager''s link on handed-off Riverside is removed');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000203'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager still owns Irvine');
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-000000000201'), 'garnet',
  'each location keeps its current look');

-- Leaving a one-manager business: back to one manager (f0..01), Riverside leaves.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_business_mode((select id from _biz), 'one_manager', null, 'f0000000-0000-4000-8000-000000000001');
insert into _tap (line) select lives_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-000000000202', null) $$,
  'a handed-off location can leave a one-manager business');
reset role;
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000202'), null,
  'Riverside is a single location');
insert into _tap (line) select is(
  (select string_agg(role, ',') from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'),
  'owner', 'Riverside keeps its owner and loses the manager''s link');

-- Two left; Redlands is handed off; Irvine leaves, so the business dissolves.
update public.member_users set role = 'editor'
  where member_id = 'f1000000-0000-4000-8000-000000000201' and user_id = 'f0000000-0000-4000-8000-000000000001';
insert into public.member_users (member_id, user_id, role)
  values ('f1000000-0000-4000-8000-000000000201', 'f0000000-0000-4000-8000-000000000002', 'owner');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_member_business('f1000000-0000-4000-8000-000000000203', null);
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.businesses where id = (select id from _biz)), 0, 'the business dissolves');
insert into _tap (line) select is(
  (select string_agg(user_id::text || ':' || role, ',') from public.member_users
    where member_id = 'f1000000-0000-4000-8000-000000000201'),
  'f0000000-0000-4000-8000-000000000002:owner',
  'the remaining handed-off location keeps its owner and loses the manager''s link');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000203'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager keeps the location that left');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
