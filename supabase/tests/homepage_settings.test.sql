-- Homepage settings (20260928100000_homepage_settings.sql): the carousel
-- dwell time is one of the offered choices, the hero path stays inside
-- hero/, and only the super admin writes to the public site-images bucket.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(9);

insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

insert into _tap (line) select is(
  (select carousel_dwell_seconds from public.site_settings), 6, 'dwell defaults to 6 seconds');
insert into _tap (line) select throws_ok(
  $q$ update public.site_settings set carousel_dwell_seconds = 5 $q$,
  '23514', null, 'only the offered dwell times are allowed');
insert into _tap (line) select throws_ok(
  $q$ update public.site_settings set hero_image_path = '../member-media/x.jpg' $q$,
  '23514', null, 'the hero path must stay inside hero/');
insert into _tap (line) select lives_ok(
  $q$ update public.site_settings set hero_image_path = 'hero/abc-photo.jpg' $q$,
  'a hero/ path is accepted');
insert into _tap (line) select is(
  (select public from storage.buckets where id = 'site-images'), true, 'site-images is public');

-- A Guild admin can't put a file in site-images.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('site-images', 'hero/pgtap-guild.jpg') $q$,
  '42501', null, 'guild admin: cannot upload a hero image');

-- A member can't either.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('site-images', 'hero/pgtap-owner.jpg') $q$,
  '42501', null, 'owner: cannot upload a hero image');

-- The super admin can, and can change the dwell time.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('site-images', 'hero/pgtap-super.jpg') $q$,
  'super admin: uploads a hero image');
update public.site_settings set carousel_dwell_seconds = 10;
reset role;
insert into _tap (line) select is(
  (select carousel_dwell_seconds from public.site_settings), 10, 'super admin: changes the dwell time');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
