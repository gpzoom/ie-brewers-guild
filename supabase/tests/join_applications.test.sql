-- Join the Guild + Fill from Google: new members columns and their write
-- limits. Runs entirely inside one transaction that is rolled back at the
-- end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(8);

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
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
