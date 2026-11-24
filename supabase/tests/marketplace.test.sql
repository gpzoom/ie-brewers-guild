-- Producer marketplace (20261127100000_marketplace.sql): who reads, who posts.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(23);

-- A Mobile-only owner, a draft-only Producer owner; m2 has one open and one
-- closed listing, draft m3 has one.
insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000008', 'pgtap-mobile@example.test', 'authenticated', 'authenticated'),
  ('f0000000-0000-4000-8000-00000000000a', 'pgtap-draft@example.test', 'authenticated', 'authenticated');
insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000008', 'co_owner'),
  ('f1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'co_owner');
insert into public.marketplace_categories (id, name) values
  ('f5000000-0000-4000-8000-000000000001', 'pgTAP category');
insert into public.marketplace_listings (id, member_id, kind, category_id, title, description, contact_email) values
  ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'equipment', 'f5000000-0000-4000-8000-000000000001', 'pgTAP mash tun', 'A tun', 'a@example.test'),
  ('f6000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'wanted', null, 'pgTAP draft listing', 'x', 'a@example.test');
insert into public.marketplace_listings (id, member_id, kind, title, description, contact_email, status) values
  ('f6000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'service', 'pgTAP closed', 'x', 'a@example.test', 'closed');

set local role anon;
insert into _tap (line) select is((select count(*)::int from public.marketplace_listings), 0, 'a visitor reads nothing');
insert into _tap (line) select is((select count(*)::int from public.marketplace_categories), 0, 'a visitor reads no categories');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000008","role":"authenticated"}';
insert into _tap (line) select is((select count(*)::int from public.marketplace_listings), 0, 'a Mobile owner reads nothing');
insert into _tap (line) select is((select count(*)::int from public.marketplace_categories), 0, 'a Mobile owner reads no categories');
insert into _tap (line) select throws_ok(
  $q$ insert into public.marketplace_listings (member_id, kind, title, description, contact_email) values ('f1000000-0000-4000-8000-000000000004', 'wanted', 'x', 'x', 'a@example.test') $q$,
  '42501', null, 'a Mobile owner cannot post');
insert into _tap (line) select throws_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('marketplace-photos', 'f1000000-0000-4000-8000-000000000004/a.jpg') $q$,
  '42501', null, 'a Mobile owner cannot add a photo');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is((select count(*)::int from public.marketplace_listings), 0, 'someone linked to nothing reads nothing');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into _tap (line) select is(
  (select array_agg(title) from public.marketplace_listings), array['pgTAP draft listing'], 'a draft Producer reads only its own');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.marketplace_listings where title like 'pgTAP%'), 0, 'a Photos & events editor reads nothing');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.marketplace_listings where title = 'pgTAP mash tun'), 1, 'a Producer reads another''s open listing');
insert into _tap (line) select is(
  (select count(*)::int from public.marketplace_listings where title = 'pgTAP closed'), 0, 'but not a closed one');
insert into _tap (line) select lives_ok(
  $q$ insert into public.marketplace_listings (id, member_id, kind, title, description, contact_phone, photo_paths, expires_at) values ('f6000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'equipment', 'pgTAP mine', 'x', '555', array['f1000000-0000-4000-8000-000000000001/a.jpg'], '2099-01-01') $q$,
  'a Producer posts');
insert into _tap (line) select is(
  (select expires_at from public.marketplace_listings where title = 'pgTAP mine'), now() + interval '60 days', 'the dates are the server''s');
insert into _tap (line) select throws_ok(
  $q$ insert into public.marketplace_listings (member_id, kind, title, description, contact_phone) values ('f1000000-0000-4000-8000-000000000002', 'wanted', 'x', 'x', '5') $q$,
  '42501', null, 'not for another member');
insert into _tap (line) select throws_ok(
  $q$ insert into public.marketplace_listings (member_id, kind, title, description, contact_phone, photo_paths) values ('f1000000-0000-4000-8000-000000000001', 'wanted', 'x', 'x', '5', array['f1000000-0000-4000-8000-000000000002/a.jpg']) $q$,
  '23514', null, 'not with another member''s photo');
insert into _tap (line) select throws_ok(
  $q$ insert into public.marketplace_listings (member_id, kind, title, description) values ('f1000000-0000-4000-8000-000000000001', 'wanted', 'x', 'x') $q$,
  '23514', null, 'a way to reach them is required');
update public.marketplace_listings set title = 'hacked' where id = 'f6000000-0000-4000-8000-000000000001';
delete from public.marketplace_listings where id = 'f6000000-0000-4000-8000-000000000001';
insert into _tap (line) select is(
  (select title from public.marketplace_listings where id = 'f6000000-0000-4000-8000-000000000001'), 'pgTAP mash tun', 'another''s listing can''t be changed or deleted');
insert into _tap (line) select throws_ok(
  $q$ insert into public.marketplace_categories (name) values ('mine') $q$, '42501', null, 'a Producer can''t add a category');
insert into _tap (line) select lives_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('marketplace-photos', 'f1000000-0000-4000-8000-000000000001/a.jpg') $q$, 'a Producer adds a photo to its folder');
insert into _tap (line) select throws_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('marketplace-photos', 'f1000000-0000-4000-8000-000000000002/a.jpg') $q$, '42501', null, 'not to another''s folder');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.marketplace_listings where title like 'pgTAP%'), 4, 'a Guild admin reads every listing');
insert into _tap (line) select lives_ok(
  $q$ delete from public.marketplace_categories where id = 'f5000000-0000-4000-8000-000000000001' $q$, 'a Guild admin deletes a category');
insert into _tap (line) select is(
  (select category_id from public.marketplace_listings where id = 'f6000000-0000-4000-8000-000000000001'), null::uuid, 'its listings stay, uncategorized');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
