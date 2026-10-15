-- Homepage spotlight switch (20261015100000_homepage_spotlight_switch.sql):
-- off by default, and only the super admin can turn it on.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(3);

insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

-- The live value may already be on, so check the column's default.
insert into _tap (line) select col_default_is(
  'public', 'site_settings', 'spotlight_enabled', 'false', 'the spotlight is off by default');

-- A Guild admin's update touches no rows (the update policy is super admin only).
update public.site_settings set spotlight_enabled = false;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
update public.site_settings set spotlight_enabled = true;
reset role;
insert into _tap (line) select is(
  (select spotlight_enabled from public.site_settings), false, 'guild admin: cannot turn the spotlight on');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
update public.site_settings set spotlight_enabled = true, updated_by_user_id = 'f0000000-0000-4000-8000-000000000007';
reset role;
insert into _tap (line) select is(
  (select spotlight_enabled from public.site_settings), true, 'super admin: turns the spotlight on');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
