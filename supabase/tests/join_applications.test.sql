-- Join the Guild + Fill from Google: new members columns and their write
-- limits. Runs entirely inside one transaction that is rolled back at the
-- end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(17);

insert into _tap (line) select has_column('public', 'members', 'google_place_id', 'members.google_place_id exists');
insert into _tap (line) select has_column('public', 'members', 'applied_via_join_at', 'members.applied_via_join_at exists');
insert into _tap (line) select has_column('public', 'members', 'join_welcomed_at', 'members.join_welcomed_at exists');
insert into _tap (line) select has_column('public', 'members', 'join_details_notified_at', 'members.join_details_notified_at exists');

-- Guild admin can set the Google place id.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select isnt_empty(
  $q$ update public.members set google_place_id = 'ChIJ_test_place' where id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'guild admin: can set google_place_id');

-- Member owner cannot set the Join columns or the place id on their own row.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ update public.members set applied_via_join_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: cannot set applied_via_join_at');
insert into _tap (line) select throws_ok(
  $q$ update public.members set join_welcomed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: cannot set join_welcomed_at');
insert into _tap (line) select throws_ok(
  $q$ update public.members set google_place_id = 'ChIJ_other' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: cannot set google_place_id');

reset role;

-- Ruling R6: a Join applicant never joins a business automatically, even
-- when its name matches an existing ungrouped member elsewhere.
create temp table _biz_before on commit drop as select count(*)::int as n from public.businesses;
-- The sibling is older, so the regression check below picks it
-- deterministically (now() is the same for every row in one transaction).
insert into public.members (id, slug, member_type, business_name, city, status, created_at) values
  ('f1000000-0000-4000-8000-0000000000c1', 'pgtap-join-sib', 'producer', 'PgTap Join Grouping', 'Riverside', 'draft', now() - interval '1 day');
insert into public.members (id, slug, member_type, business_name, city, status, applied_via_join_at) values
  ('f1000000-0000-4000-8000-0000000000c2', 'pgtap-join-app', 'producer', 'PgTap Join Grouping', 'Ontario', 'applied', now());
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c2'), null,
  'applied insert with a matching name: no business');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1'), null,
  'applied insert with a matching name: sibling business_id unchanged');
insert into _tap (line) select is(
  (select count(*)::int from public.businesses), (select n from _biz_before),
  'applied insert with a matching name: no businesses row created');

-- Regression: a draft insert with a matching name still groups.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c3', 'pgtap-join-draft', 'producer', 'PgTap Join Grouping', 'Corona', 'draft');
insert into _tap (line) select isnt(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c3'), null,
  'draft insert with a matching name: joins a business');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1'),
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c3'),
  'draft insert with a matching name: grouped with the ungrouped sibling');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c2'), null,
  'the applicant stays out of the new business');

-- A new member never groups with an applicant: a draft whose name matches
-- only an applied row stays ungrouped and creates no business.
create temp table _biz_before_2 on commit drop as select count(*)::int as n from public.businesses;
insert into public.members (id, slug, member_type, business_name, city, status, applied_via_join_at) values
  ('f1000000-0000-4000-8000-0000000000c4', 'pgtap-join-app-only', 'producer', 'PgTap Applicant Only', 'Ontario', 'applied', now());
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c5', 'pgtap-join-draft-2', 'producer', 'PgTap Applicant Only', 'Corona', 'draft');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c5'), null,
  'draft matching only an applied row: not grouped');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c4'), null,
  'draft matching only an applied row: the applicant stays ungrouped');
insert into _tap (line) select is(
  (select count(*)::int from public.businesses), (select n from _biz_before_2),
  'draft matching only an applied row: no businesses row created');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
