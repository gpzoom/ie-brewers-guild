-- publish_member_draft: all-or-nothing, the hours rule, first publish
-- (plan phase 1, items 7 and 9; Decision 10). Runs entirely inside one
-- transaction that is rolled back at the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(48);

-- Snapshot of everything a publish of m1 could touch.
create temp view _m1_live as
select
  (select to_jsonb(m) from public.members m where m.id = 'f1000000-0000-4000-8000-000000000001') as member,
  (select jsonb_agg(to_jsonb(h) order by h.id) from public.hours h where h.member_id = 'f1000000-0000-4000-8000-000000000001') as hours,
  (select jsonb_agg(to_jsonb(s) order by s.id) from public.special_hours s where s.member_id = 'f1000000-0000-4000-8000-000000000001') as special_hours,
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.carousel_slides c where c.member_id = 'f1000000-0000-4000-8000-000000000001') as slides,
  (select jsonb_agg(to_jsonb(l) order by l.id) from public.member_links l where l.member_id = 'f1000000-0000-4000-8000-000000000001') as links,
  (select jsonb_agg(to_jsonb(mc) order by mc.id) from public.member_categories mc where mc.member_id = 'f1000000-0000-4000-8000-000000000001') as categories;

-- ---------------------------------------------------------------------
-- Atomicity: valid basics + a slide that can't go live
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';

insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"business_name":"Should Not Go Live","tagline":"Nope",
         "hours":[{"weekday":0,"opens_at":"09:00","closes_at":"17:00","closes_next_day":false,"is_closed":false}]}') $q$,
  'editor: save basics with new name and hours');
-- a3 is m1's own photo but still pending review: fine in a draft, not live.
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-000000000003","crop":{"x":0,"y":0,"w":1,"h":1},"sort_order":0}]}') $q$,
  'editor: save media using a pending photo');

reset role;
create temp table _before on commit drop as select * from _m1_live;

set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics','media'], true) $q$,
  '22023', null, 'publish basics+media with an unapproved photo fails');

reset role;
insert into _tap (line) select is((select member from _m1_live), (select member from _before), 'failed publish: members row exactly as before');
insert into _tap (line) select is((select hours from _m1_live), (select hours from _before), 'failed publish: hours exactly as before');
insert into _tap (line) select is((select slides from _m1_live), (select slides from _before), 'failed publish: carousel_slides exactly as before');
insert into _tap (line) select is(
  (select jsonb_build_array(special_hours, links, categories) from _m1_live),
  (select jsonb_build_array(special_hours, links, categories) from _before),
  'failed publish: special_hours, links and categories exactly as before');
insert into _tap (line) select is(
  (select dirty_sections from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  array['basics','media'], 'failed publish: both sections still dirty');

-- A draft pointing at ANOTHER member's photo (can't be saved that way, so
-- written straight into the draft here, as if the asset had moved).
update public.member_drafts
set data = jsonb_set(data, '{media,slides}',
  '[{"asset_id":"f2000000-0000-4000-8000-000000000004","crop":{"x":0,"y":0,"w":1,"h":1},"outbound_url":null,"sort_order":0}]')
where member_id = 'f1000000-0000-4000-8000-000000000001';

set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics','media'], true) $q$,
  '22023', null, 'publish basics+media with another member''s photo fails');
reset role;
insert into _tap (line) select is((select member from _m1_live), (select member from _before), 'foreign-photo publish: members row exactly as before');
insert into _tap (line) select is((select slides from _m1_live), (select slides from _before), 'foreign-photo publish: carousel_slides exactly as before');

-- ---------------------------------------------------------------------
-- Hours rule
-- ---------------------------------------------------------------------
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], false) $q$,
  '22023', 'Confirm your hours are right before publishing.', 'producer: publishing basics without the hours tick fails');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  'producer: publishing basics with the hours tick works (media left out)');
reset role;
insert into _tap (line) select is(
  (select business_name from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'Should Not Go Live', 'basics-only publish: basics live');
insert into _tap (line) select is((select slides from _m1_live), (select slides from _before), 'basics-only publish: slides untouched');
insert into _tap (line) select is(
  (select dirty_sections from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  array['media'], 'basics-only publish: media still dirty');

set local role authenticated;
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000004', 'basics', '{"business_name":"Rolling Taps Two"}') $q$,
  'mobile: save basics');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000004', array['basics'], false) $q$,
  'mobile: publishing basics needs no hours tick');
reset role;
insert into _tap (line) select ok(
  (select hours_confirmed_at is null and business_name = 'Rolling Taps Two' from public.members where id = 'f1000000-0000-4000-8000-000000000004'),
  'mobile: basics live, hours_confirmed_at untouched without the tick');

-- ---------------------------------------------------------------------
-- Never-published member (m3, status draft)
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000003', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-000000000005","crop":{"x":0,"y":0,"w":1,"h":1},"sort_order":0}]}') $q$,
  'media_events: save media on a never-published member');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000003', array['media'], false) $q$,
  '42501', null, 'media_events: cannot make a never-published member live');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000003', array['basics'], true) $q$,
  '22023', null, 'editor: first publish of only some sections fails');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000003', array['basics','media','links','discount','theme'], false) $q$,
  '22023', 'Confirm your hours are right before publishing.', 'editor: first publish always runs the hours check');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000003', array['basics','media','links','discount','theme'], true) $q$,
  'editor: full first publish works');
reset role;
insert into _tap (line) select is(
  (select status from public.members where id = 'f1000000-0000-4000-8000-000000000003'),
  'published', 'first publish: member is now published');
insert into _tap (line) select ok(
  (select published_at is not null and hours_confirmed_at is not null from public.members where id = 'f1000000-0000-4000-8000-000000000003'),
  'first publish: published_at and hours_confirmed_at set');
insert into _tap (line) select is(
  (select count(*)::int from public.carousel_slides where member_id = 'f1000000-0000-4000-8000-000000000003'),
  1, 'first publish: the media_events editor''s drafted slide went live with it');

set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000005', array['basics','media','links','discount','theme'], true) $q$,
  '42501', null, 'an applied (not yet approved) member cannot be published from a draft');

-- ---------------------------------------------------------------------
-- Argument and completeness checks
-- ---------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['bogus'], true) $q$,
  '22023', null, 'unknown section name refused');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', '{}'::text[], true) $q$,
  '22023', null, 'empty section list refused');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'links',
       '{"links":[{"kind":"website","label":null,"url":"","sort_order":0}]}') $q$,
  'a half-typed link (empty URL) can sit in the draft');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['links'], false) $q$,
  '22023', null, 'but a link without a URL cannot be published');
insert into _tap (line) select lives_ok(
  $q$ select public.discard_member_draft_sections('f1000000-0000-4000-8000-000000000001', array['links']) $q$,
  'editor: discard links');
reset role;
insert into _tap (line) select is(
  (select data -> 'links' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  public._draft_section_from_live('f1000000-0000-4000-8000-000000000001', 'links'),
  'discard links: draft links reset to live');

-- ---------------------------------------------------------------------
-- Logo, cover and social image are checked at publish too
-- ---------------------------------------------------------------------
set local role authenticated;
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"logo_asset_id":"f2000000-0000-4000-8000-000000000003"}') $q$,
  'editor: a pending logo can sit in the draft');
reset role;
create temp table _before_assets on commit drop as select * from _m1_live;

set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  '22023', null, 'publish with a pending logo fails');
reset role;
insert into _tap (line) select is((select to_jsonb(l) from _m1_live l), (select to_jsonb(b) from _before_assets b), 'pending-logo publish: live unchanged');

-- Another member's photo as cover, then as social image (written straight
-- into the draft; save would refuse them).
update public.member_drafts
set data = jsonb_set(jsonb_set(data, '{basics,logo_asset_id}', '"f2000000-0000-4000-8000-000000000001"'),
                     '{basics,cover_asset_id}', '"f2000000-0000-4000-8000-000000000004"')
where member_id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  '22023', null, 'publish with another member''s cover fails');
reset role;
insert into _tap (line) select is((select to_jsonb(l) from _m1_live l), (select to_jsonb(b) from _before_assets b), 'foreign-cover publish: live unchanged');

update public.member_drafts
set data = jsonb_set(jsonb_set(data, '{basics,cover_asset_id}', '"f2000000-0000-4000-8000-000000000002"'),
                     '{basics,og_image_asset_id}', '"f2000000-0000-4000-8000-000000000004"')
where member_id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  '22023', null, 'publish with another member''s social image fails');
reset role;
insert into _tap (line) select is((select to_jsonb(l) from _m1_live l), (select to_jsonb(b) from _before_assets b), 'foreign-social-image publish: live unchanged');

-- A javascript: URL written straight into the draft is still refused at
-- publish, which re-validates every section.
update public.member_drafts
set data = jsonb_set(data, '{links,links}', '[{"kind":"website","label":null,"url":"javascript:alert(1)","sort_order":0}]')
where member_id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['links'], false) $q$,
  '22023', null, 'publish refuses a javascript: link URL that bypassed save');

-- Links: sort_order given for some and missing for others still gives
-- distinct live positions.
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'links',
       '{"links":[{"kind":"website","url":"https://a.example.test","sort_order":0},
                  {"kind":"instagram","url":"https://b.example.test"},
                  {"kind":"menu","url":"https://c.example.test","sort_order":0}]}') $q$,
  'editor: save links with a missing and a duplicate sort_order');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['links'], false) $q$,
  'editor: publish those links');
reset role;
insert into _tap (line) select is(
  (select string_agg(kind || ':' || sort_order, ',' order by sort_order)
   from public.member_links where member_id = 'f1000000-0000-4000-8000-000000000001'),
  'website:0,menu:1,instagram:2', 'publish links: renumbered 0..n-1 without collisions');

-- ---------------------------------------------------------------------
-- Guild admin publish is audited against the real actor
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"garnet"}') $q$,
  'guild admin: save theme');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['theme'], false) $q$,
  'guild admin: publish theme');
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.audit_log
   where actor_user_id = 'f0000000-0000-4000-8000-000000000004'
     and member_id = 'f1000000-0000-4000-8000-000000000001' and table_name = 'members'),
  1, 'guild admin: publish audited against the real actor');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
