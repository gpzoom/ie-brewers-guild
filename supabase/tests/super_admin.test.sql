-- Super admin (20260927100000_super_admin_role.sql,
-- 20260927100100_super_admin_policies.sql,
-- 20260927100200_guild_admin_invites.sql,
-- 20260927100400_category_delete_function.sql). A Guild admin can't delete a
-- member, save brand settings, delete a category, read the audit log,
-- change who's a Guild admin or super admin, or flip the Trail switch --
-- straight through the database, the way a hand-made REST call would. The
-- super admin can. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(36);

-- The super admin for this test (f0..07); the fixtures' Guild admin is f0..04.
insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

-- Something to find in the audit log, and a brand row to try to change.
insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
values ('f0000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'members', null, 'update');
-- A second category, sitting in m2's draft, for delete_category().
insert into public.categories (id, name, slug, sort_order) values
  ('f3000000-0000-4000-8000-000000000002', 'pgTAP drafted category', 'pgtap-drafted-category', 997);
insert into public.member_drafts (member_id, data)
values ('f1000000-0000-4000-8000-000000000002',
        '{"discount":{"category_ids":["f3000000-0000-4000-8000-000000000002","f3000000-0000-4000-8000-000000000001"]}}')
on conflict (member_id) do update set data = excluded.data;
insert into public.brand_settings (font_pairing, tokens)
select 'pgtap', '{}'::jsonb
where not exists (select 1 from public.brand_settings);

-- ---------------------------------------------------------------------
-- Guild admin: every super-admin-only action is refused
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';

insert into _tap (line) select ok(public.is_guild_admin(), 'guild admin: is_guild_admin()');
insert into _tap (line) select ok(not public.is_super_admin(), 'guild admin: not is_super_admin()');

insert into _tap (line) select is_empty(
  $q$ delete from public.members where id = 'f1000000-0000-4000-8000-000000000005' returning 1 $q$,
  'guild admin: deleting a member matches nothing');
insert into _tap (line) select isnt_empty(
  $q$ select 1 from public.members where id = 'f1000000-0000-4000-8000-000000000005' $q$,
  'guild admin: the member is still there');
insert into _tap (line) select lives_ok(
  $q$ update public.members set status = 'suspended' where id = 'f1000000-0000-4000-8000-000000000002' $q$,
  'guild admin: can still suspend a member');

insert into _tap (line) select is_empty(
  $q$ update public.brand_settings set font_pairing = 'hacked' returning 1 $q$,
  'guild admin: brand settings update matches nothing');
insert into _tap (line) select is_empty(
  $q$ delete from public.brand_settings returning 1 $q$,
  'guild admin: brand settings delete matches nothing');
insert into _tap (line) select throws_ok(
  $q$ insert into public.brand_settings (font_pairing, tokens) values ('hacked', '{}') $q$,
  '42501', null, 'guild admin: brand settings insert denied');
insert into _tap (line) select isnt_empty(
  $q$ select 1 from public.brand_settings $q$,
  'guild admin: can still read brand settings');

insert into _tap (line) select is_empty(
  $q$ delete from public.categories where id = 'f3000000-0000-4000-8000-000000000001' returning 1 $q$,
  'guild admin: deleting a category matches nothing');
insert into _tap (line) select throws_ok(
  $q$ select public.delete_category('f3000000-0000-4000-8000-000000000002') $q$,
  '42501', null, 'guild admin: delete_category() refused');
insert into _tap (line) select is(
  public.category_usage('f3000000-0000-4000-8000-000000000002'), 1,
  'guild admin: category_usage() counts the member whose draft uses it');
insert into _tap (line) select isnt_empty(
  $q$ update public.categories set name = 'pgTAP renamed' where id = 'f3000000-0000-4000-8000-000000000001' returning 1 $q$,
  'guild admin: can still rename a category');
insert into _tap (line) select lives_ok(
  $q$ insert into public.categories (name, slug, sort_order, member_type) values ('pgTAP added', 'pgtap-added', 998, 'mobile') $q$,
  'guild admin: can still add a category');

insert into _tap (line) select is_empty(
  $q$ select 1 from public.audit_log $q$,
  'guild admin: can''t read the audit log');
insert into _tap (line) select lives_ok(
  $q$ insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
      values ('f0000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'members', null, 'update') $q$,
  'guild admin: can still write their own audit rows');

insert into _tap (line) select throws_ok(
  $q$ update public.profiles set is_guild_admin = true where id = 'f0000000-0000-4000-8000-000000000006' $q$,
  '42501', null, 'guild admin: can''t make someone a Guild admin');
insert into _tap (line) select throws_ok(
  $q$ update public.profiles set is_guild_admin = false where id = 'f0000000-0000-4000-8000-000000000004' $q$,
  '42501', null, 'guild admin: can''t change their own Guild admin flag');
insert into _tap (line) select throws_ok(
  $q$ update public.profiles set is_super_admin = true where id = 'f0000000-0000-4000-8000-000000000004' $q$,
  '42501', null, 'guild admin: can''t make themselves super admin');
insert into _tap (line) select throws_ok(
  $q$ insert into public.profiles (id, is_guild_admin) values ('f0000000-0000-4000-8000-000000000006', true) $q$,
  '42501', null, 'guild admin: can''t insert a Guild admin profile');

insert into _tap (line) select throws_ok(
  $q$ update public.members set trail_eligible = true where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'guild admin: can''t flip the Trail switch');

insert into _tap (line) select throws_ok(
  $q$ select 1 from public.guild_admin_invites $q$,
  '42501', null, 'guild admin: no access to Guild admin invites');

-- ---------------------------------------------------------------------
-- Super admin: allowed
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';

insert into _tap (line) select ok(public.is_super_admin() and public.is_guild_admin(), 'super admin: both checks true');
insert into _tap (line) select isnt_empty(
  $q$ select 1 from public.audit_log where actor_user_id = 'f0000000-0000-4000-8000-000000000004' $q$,
  'super admin: reads the audit log');
insert into _tap (line) select isnt_empty(
  $q$ update public.brand_settings set updated_by_user_id = 'f0000000-0000-4000-8000-000000000007' returning 1 $q$,
  'super admin: saves brand settings');
insert into _tap (line) select lives_ok(
  $q$ update public.members set trail_eligible = true where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'super admin: flips the Trail switch');
insert into _tap (line) select isnt_empty(
  $q$ delete from public.categories where id = 'f3000000-0000-4000-8000-000000000001' returning 1 $q$,
  'super admin: deletes a category');
insert into _tap (line) select isnt_empty(
  $q$ delete from public.members where id = 'f1000000-0000-4000-8000-000000000005' returning 1 $q$,
  'super admin: deletes a member');
insert into _tap (line) select lives_ok(
  $q$ select public.delete_category('f3000000-0000-4000-8000-000000000002') $q$,
  'super admin: delete_category()');
insert into _tap (line) select is_empty(
  $q$ select 1 from public.categories where id = 'f3000000-0000-4000-8000-000000000002' $q$,
  'super admin: the category is gone');
reset role;
insert into _tap (line) select is(
  (select data #> '{discount,category_ids}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000002'),
  '["f3000000-0000-4000-8000-000000000001"]'::jsonb,
  'delete_category(): takes just that category out of the draft (the app always deletes through it)');
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.delete_category('f3000000-0000-4000-8000-000000000002') $q$,
  'P0002', null, 'super admin: deleting it again says it''s gone');
insert into _tap (line) select throws_ok(
  $q$ update public.profiles set is_guild_admin = true where id = 'f0000000-0000-4000-8000-000000000006' $q$,
  '42501', null, 'super admin: grants go through the Worker, not a direct write');

-- ---------------------------------------------------------------------
-- Even the service key can't grant or remove super admin
-- ---------------------------------------------------------------------
reset role;
set local role service_role;

insert into _tap (line) select throws_ok(
  $q$ update public.profiles set is_super_admin = true where id = 'f0000000-0000-4000-8000-000000000004' $q$,
  '42501', null, 'service role: can''t grant super admin');
insert into _tap (line) select throws_ok(
  $q$ update public.profiles set is_guild_admin = false where id = 'f0000000-0000-4000-8000-000000000007' $q$,
  '42501', null, 'service role: can''t take Guild admin access from the super admin');
insert into _tap (line) select lives_ok(
  $q$ update public.profiles set is_guild_admin = true where id = 'f0000000-0000-4000-8000-000000000006' $q$,
  'service role: can grant Guild admin (the Guild admins screen, after its super admin check)');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
