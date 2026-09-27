-- Site settings (20260927180000_site_settings.sql): one row; only the
-- super admin reads or changes it; nobody adds or deletes rows through the
-- API; the interval is one of the offered choices. Runs inside one
-- transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(9);

insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

insert into _tap (line) select is((select count(*)::int from public.site_settings), 1, 'there is exactly one settings row');
insert into _tap (line) select throws_ok(
  $q$ update public.site_settings set calendar_sync_interval_minutes = 5 $q$,
  '23514', null, 'only the offered intervals are allowed');

-- A Guild admin sees nothing and changes nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is((select count(*)::int from public.site_settings), 0, 'guild admin: reads nothing');
update public.site_settings set calendar_sync_interval_minutes = 1440;
insert into _tap (line) select throws_ok(
  $q$ insert into public.site_settings (id) values (true) $q$,
  '42501', null, 'guild admin: cannot add a row');

-- A member sees nothing either.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is((select count(*)::int from public.site_settings), 0, 'owner: reads nothing');

-- The super admin reads and changes it, but can't delete it.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
insert into _tap (line) select isnt(
  (select calendar_sync_interval_minutes from public.site_settings), 1440,
  'super admin: the Guild admin''s update changed nothing');
update public.site_settings set calendar_sync_interval_minutes = 60;
insert into _tap (line) select is(
  (select calendar_sync_interval_minutes from public.site_settings), 60, 'super admin: changes the interval');
insert into _tap (line) select throws_ok(
  $q$ delete from public.site_settings $q$,
  '42501', null, 'super admin: cannot delete the row');

reset role;
insert into _tap (line) select is((select count(*)::int from public.site_settings), 1, 'still exactly one row');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
