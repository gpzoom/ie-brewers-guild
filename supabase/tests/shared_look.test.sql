-- Shared look (20261017100000_shared_look_save.sql): in a one-manager
-- business the logo, cover, link-preview image and theme are the
-- business's. A save on one location reaches every location's draft, only
-- the business manager or a Guild admin may change them, and members
-- outside a one-manager business behave exactly as before.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(48);

-- A three-location one-manager business. The name trigger groups them.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000d1', 'pgtap-look-a', 'producer', 'PgTap Look', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-0000000000d2', 'pgtap-look-b', 'producer', 'PgTap Look', 'Riverside', 'draft'),
  ('f1000000-0000-4000-8000-0000000000d3', 'pgtap-look-c', 'producer', 'PgTap Look', 'Irvine', 'draft');
update public.businesses
set management_mode = 'one_manager', manager_user_id = 'f0000000-0000-4000-8000-000000000006'
where id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000d1');

insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-0000000000d1', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000d2', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000d3', 'f0000000-0000-4000-8000-000000000005', 'owner'),
  ('f1000000-0000-4000-8000-0000000000d1', 'f0000000-0000-4000-8000-000000000002', 'editor');

insert into public.media_assets (id, member_id, storage_path, kind, mime_type, byte_size, source, review_status) values
  ('f2000000-0000-4000-8000-0000000000e1', 'f1000000-0000-4000-8000-0000000000d1', 'pgtap/e1.jpg', 'image', 'image/jpeg', 1000, 'member_upload', 'approved');

-- The business manager.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';

insert into _tap (line) select lives_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d1', 'theme', '{"theme":"teal"}') $$,
  'manager: theme save on one location');
reset role;
insert into _tap (line) select is(
  (select data #>> '{theme,theme}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d2'),
  'teal', 'theme reaches the second location');
insert into _tap (line) select is(
  (select data #>> '{theme,theme}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d3'),
  'teal', 'theme reaches the third location (which had no draft yet)');
insert into _tap (line) select ok(
  (select 'theme' = any (dirty_sections) from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d2'),
  'second location has theme unpublished');
insert into _tap (line) select ok(
  (select 'theme' = any (dirty_sections) from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d3'),
  'third location has theme unpublished');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d2', 'basics',
       '{"logo_asset_id":"f2000000-0000-4000-8000-0000000000e1"}') $$,
  'manager: a logo owned by another location of the business is accepted');
reset role;
insert into _tap (line) select is(
  (select data #>> '{basics,logo_asset_id}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d1'),
  'f2000000-0000-4000-8000-0000000000e1', 'logo reaches the first location');
insert into _tap (line) select is(
  (select data #>> '{basics,logo_asset_id}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d3'),
  'f2000000-0000-4000-8000-0000000000e1', 'logo reaches the third location');

-- Carousel slides keep the own-gallery rule, even inside the business.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d2', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-0000000000e1","crop":null,"outbound_url":null,"sort_order":0}]}') $$,
  '22023', 'slides[0].asset_id isn''t in this member''s gallery.',
  'manager: a slide photo owned by another location is refused');
reset role;

-- A location manager (owner of d3, not the business manager).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d3', 'theme', '{"theme":"rust"}') $$,
  '42501', null, 'location manager: theme save refused');
insert into _tap (line) select throws_like(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d3', 'theme', '{"theme":"rust"}') $$,
  '%shared by all PgTap Look locations%', 'refusal names the business');
insert into _tap (line) select throws_like(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d3', 'theme', '{"theme":"rust"}') $$,
  '%pgtap-nobody@example.test manages them%', 'refusal names the manager''s email');
insert into _tap (line) select lives_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d3', 'basics', '{"tagline":"Own words"}') $$,
  'location manager: own tagline saves');
reset role;
insert into _tap (line) select is(
  (select data #>> '{basics,tagline}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d3'),
  'Own words', 'tagline is on the third location');
insert into _tap (line) select is(
  (select data #>> '{basics,tagline}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d1'),
  null, 'tagline does not reach the first location');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d3', 'basics',
       '{"tagline":"Mixed","logo_background":"dark"}') $$,
  '42501', null, 'location manager: a basics save that touches the look is refused');
reset role;
insert into _tap (line) select is(
  (select data #>> '{basics,tagline}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d3'),
  'Own words', 'and nothing from it was saved');

-- An editor of one location (not the business manager).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d1', 'theme', '{"theme":"rust"}') $$,
  '42501', null, 'location editor: theme save refused');
reset role;

-- A Guild admin.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d3', 'theme', '{"theme":"plum"}') $$,
  'guild admin: theme save on a location');
reset role;
insert into _tap (line) select is(
  (select data #>> '{theme,theme}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d1'),
  'plum', 'the admin''s theme reaches the first location');
insert into _tap (line) select ok(
  exists (select 1 from public.audit_log where table_name = 'member_drafts'
          and member_id = 'f1000000-0000-4000-8000-0000000000d1'
          and actor_user_id = 'f0000000-0000-4000-8000-000000000004'),
  'the admin''s write to the first location''s draft is audit-logged');

-- A later non-look save on a sibling keeps the shared look.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d2', 'basics', '{"tagline":"x"}');
reset role;
insert into _tap (line) select is(
  (select data #>> '{theme,theme}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d2'),
  'plum', 'a tagline save on the second location keeps the admin''s theme');

-- Outside any business: today's behavior.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000002', 'theme', '{"theme":"rust"}') $$,
  'owner of a member outside any business: theme save works');
reset role;

-- The gallery rule still holds across unrelated members.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d1', 'basics',
       '{"logo_asset_id":"f2000000-0000-4000-8000-000000000004"}') $$,
  '22023', null, 'manager: another member''s asset is refused');
reset role;

-- Part 4, task 2 (20261017110000_shared_look_publish.sql): publishing,
-- type, mode and Part of carry the shared look.

-- Publishing the look on one live location reaches the others' live profiles.
update public.members set status = 'published'
where id in ('f1000000-0000-4000-8000-0000000000d1', 'f1000000-0000-4000-8000-0000000000d2');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d1', 'basics',
  '{"logo_asset_id":"f2000000-0000-4000-8000-0000000000e1"}');
select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000d2', 'basics', '{"tagline":"B only"}');
insert into _tap (line) select lives_ok(
  $$ select public.publish_member_draft('f1000000-0000-4000-8000-0000000000d1', array['basics', 'theme'], true) $$,
  'manager: publishes the look on the first location');
reset role;
insert into _tap (line) select is(
  (select logo_asset_id from public.members where id = 'f1000000-0000-4000-8000-0000000000d2'),
  'f2000000-0000-4000-8000-0000000000e1'::uuid, 'the second (live) location shows the published logo');
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-0000000000d2'),
  (select theme from public.members where id = 'f1000000-0000-4000-8000-0000000000d1'),
  'the second location shows the published theme');
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-0000000000d2'),
  'plum', 'which is the drafted theme');
insert into _tap (line) select isnt(
  (select tagline from public.members where id = 'f1000000-0000-4000-8000-0000000000d2'),
  'B only', 'the second location''s own unpublished tagline is not published');
insert into _tap (line) select is(
  (select status from public.members where id = 'f1000000-0000-4000-8000-0000000000d2'),
  'published', 'the second location stays published');
insert into _tap (line) select is(
  (select data #>> '{basics,tagline}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d2'),
  'B only', 'its draft keeps the unpublished tagline');
insert into _tap (line) select ok(
  (select 'basics' = any (dirty_sections) from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d2'),
  'and its basics are still unpublished');
insert into _tap (line) select ok(
  (select not ('theme' = any (dirty_sections)) from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000d2'),
  'its theme now matches live, so it is no longer unpublished');
insert into _tap (line) select is(
  (select logo_asset_id from public.members where id = 'f1000000-0000-4000-8000-0000000000d3'),
  null, 'a location that is not live yet gets no live copy');

-- Publishing the second location with the logo the first one owns works;
-- a slide owned by the first location is still refused at publish.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.publish_member_draft('f1000000-0000-4000-8000-0000000000d2', array['basics'], true) $$,
  'manager: publishing a location with a logo owned by another location of the business works');
reset role;
update public.member_drafts
set data = data || '{"media":{"slides":[{"asset_id":"f2000000-0000-4000-8000-0000000000e1","crop":null,"outbound_url":null,"sort_order":0}]}}'::jsonb
where member_id = 'f1000000-0000-4000-8000-0000000000d2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.publish_member_draft('f1000000-0000-4000-8000-0000000000d2', array['media'], true) $$,
  '22023', null, 'manager: a slide owned by another location is refused at publish');
reset role;

-- Confirming the type on one location confirms it on the business's unconfirmed locations.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000f1', 'pgtap-type-a', 'allied', 'PgTap Type', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-0000000000f2', 'pgtap-type-b', 'allied', 'PgTap Type', 'Riverside', 'draft'),
  ('f1000000-0000-4000-8000-0000000000f3', 'pgtap-type-c', 'allied', 'PgTap Type', 'Irvine', 'draft');
update public.businesses
set management_mode = 'one_manager', manager_user_id = 'f0000000-0000-4000-8000-000000000006'
where id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000f1');
insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-0000000000f1', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000f2', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000f3', 'f0000000-0000-4000-8000-000000000006', 'owner');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.confirm_member_type('f1000000-0000-4000-8000-0000000000f1', 'producer') $$,
  'manager: confirms the type on one location');
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.members
    where id in ('f1000000-0000-4000-8000-0000000000f2', 'f1000000-0000-4000-8000-0000000000f3')
      and type_confirmed_at is not null and member_type = 'producer'),
  2, 'the other two locations are confirmed as producer too');

-- Switching a business to one manager (now any Guild admin) shares the look.
insert into public.members (id, slug, member_type, business_name, city, status, theme, logo_background, setup_completed_at, type_confirmed_at) values
  ('f1000000-0000-4000-8000-0000000000a1', 'pgtap-mode-a', 'producer', 'PgTap Mode', 'Redlands', 'draft', 'forest', 'dark', now(), now());
insert into public.members (id, slug, member_type, business_name, city, status, theme) values
  ('f1000000-0000-4000-8000-0000000000a2', 'pgtap-mode-b', 'producer', 'PgTap Mode', 'Riverside', 'draft', 'garnet'),
  ('f1000000-0000-4000-8000-0000000000a3', 'pgtap-mode2-a', 'producer', 'PgTap Mode Two', 'Corona', 'draft', 'olive'),
  ('f1000000-0000-4000-8000-0000000000a4', 'pgtap-mode2-b', 'producer', 'PgTap Mode Two', 'Norco', 'draft', 'indigo');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode(
       (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'), 'one_manager') $$,
  'guild admin: switches a business to one manager');
reset role;
insert into _tap (line) select is(
  (select theme || '/' || logo_background from public.members where id = 'f1000000-0000-4000-8000-0000000000a2'),
  'forest/dark', 'the other location takes the set-up location''s look');
insert into _tap (line) select is(
  (select data #>> '{theme,theme}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000a2'),
  'forest', 'and its draft holds the same theme');
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'),
  'forest', 'the look source keeps its own theme');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode(
       (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a3'), 'one_manager',
       'f1000000-0000-4000-8000-0000000000a4') $$,
  'guild admin: switches with a chosen look source');
reset role;
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-0000000000a3'),
  'indigo', 'a chosen look source wins');

-- A location joining a one-manager business takes its look and type confirmation.
insert into public.members (id, slug, member_type, business_name, city, status, theme) values
  ('f1000000-0000-4000-8000-0000000000a5', 'pgtap-joiner', 'allied', 'PgTap Joiner', 'Chino', 'draft', 'rust');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000a5',
       (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1')) $$,
  'guild admin: adds a location to the one-manager business');
reset role;
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-0000000000a5'),
  'forest', 'the joining location shows the business''s theme');
insert into _tap (line) select is(
  (select data #>> '{theme,theme}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000a5'),
  'forest', 'and its draft holds it');
insert into _tap (line) select ok(
  (select type_confirmed_at is not null and member_type = 'producer' from public.members
    where id = 'f1000000-0000-4000-8000-0000000000a5'),
  'and its type is confirmed as the business''s');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
