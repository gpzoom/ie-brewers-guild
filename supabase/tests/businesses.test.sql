-- Businesses (20261015200000_businesses.sql): the table, the backfill rule,
-- the insert/rename trigger that groups same-named members, and who can read/write.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(14);

insert into _tap (line) select has_table('public', 'businesses', 'businesses table exists');
insert into _tap (line) select has_column('public', 'members', 'business_id', 'members.business_id exists');
insert into _tap (line) select col_default_is(
  'public', 'businesses', 'management_mode', 'separate', 'new businesses start as separate');

-- Insert trigger: a second location with the same name (stray space) joins a new business with the first.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000a1', 'pgtap-chain-a', 'producer', 'PgTap Chain', 'Redlands', 'published');
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000a2', 'pgtap-chain-b', 'producer', 'PgTap Chain ', 'Riverside', 'published');
insert into _tap (line) select isnt(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'), null,
  'trigger: the first location now has a business');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a2'),
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'),
  'trigger: same name (ignoring stray spaces) joins the same business');

-- A third location joins the existing business rather than making another.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000a3', 'pgtap-chain-c', 'producer', 'PgTap Chain', 'Irvine', 'draft');
insert into _tap (line) select is(
  (select count(distinct business_id)::int from public.members where business_name like 'PgTap Chain%'), 1,
  'trigger: a third location joins the existing business');
insert into _tap (line) select is(
  (select management_mode from public.businesses
    where id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a3')),
  'separate', 'trigger-made business is separate');

-- A member with a unique name gets no business.
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000002'), null,
  'a single-location member has no business');

-- Renaming: an unlinked location renamed to an existing chain's name joins that business.
update public.members set business_name = 'PgTap Chain' where id = 'f1000000-0000-4000-8000-000000000002';
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000002'),
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'),
  'rename: an unlinked member renamed to a chain''s name joins its business');

-- Renaming a location that already has a business leaves its business alone.
create temp table _before as
  select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a3';
update public.members
set business_name = (select business_name from public.members where id = 'f1000000-0000-4000-8000-000000000001')
where id = 'f1000000-0000-4000-8000-0000000000a3';
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a3'),
  (select business_id from _before),
  'rename: a member already in a business keeps it');

-- Visitors read id and name, not the manager.
set local role anon;
insert into _tap (line) select lives_ok(
  $$ select id, name from public.businesses $$, 'anon can read business id and name');
insert into _tap (line) select throws_ok(
  $$ select manager_user_id from public.businesses $$, '42501', null, 'anon cannot read manager_user_id');
reset role;

-- A member can't move their own location into another business.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ update public.members set business_id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1')
     where id = 'f1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'owner cannot change business_id');
-- Nor create a business.
insert into _tap (line) select throws_ok(
  $$ insert into public.businesses (name) values ('Sneaky') $$, '42501', null, 'owner cannot create a business');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
