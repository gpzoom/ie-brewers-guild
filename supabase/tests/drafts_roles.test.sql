-- Who may do what with drafts (spec, "People and permissions" ->
-- "Enforcement"; plan phase 1, item 9). Runs entirely inside one
-- transaction that is rolled back at the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(151);

-- ---------------------------------------------------------------------
-- Photos & events editor (media_events) on m1
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';

insert into _tap (line) select is(public.member_role('f1000000-0000-4000-8000-000000000001'), 'media_events', 'member_role() reports media_events');
insert into _tap (line) select ok(public.can_edit_section('f1000000-0000-4000-8000-000000000001', 'media'), 'media_events can edit media');
insert into _tap (line) select ok(not public.can_edit_section('f1000000-0000-4000-8000-000000000001', 'basics'), 'media_events cannot edit basics');
insert into _tap (line) select ok(not public.is_member_full_editor('f1000000-0000-4000-8000-000000000001'), 'media_events is not a full editor');

insert into _tap (line) select lives_ok(
  $q$ select public.ensure_member_draft('f1000000-0000-4000-8000-000000000001') $q$,
  'media_events: ensure_member_draft creates the draft');

insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media',
       '{"slides":[
          {"asset_id":"f2000000-0000-4000-8000-000000000002","crop":{"x":0,"y":0,"w":0.8,"h":1},"outbound_url":null,"sort_order":0},
          {"asset_id":"f2000000-0000-4000-8000-000000000001","crop":{"x":0.1,"y":0,"w":0.8,"h":1},"outbound_url":"https://shop.example.test","sort_order":1}
        ]}') $q$,
  'media_events: save media section');

insert into _tap (line) select is(
  (select dirty_sections from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  array['media'], 'media_events: media is marked dirty (and the draft is readable)');
insert into _tap (line) select is(
  (select media_updated_by_user_id from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  'f0000000-0000-4000-8000-000000000003'::uuid, 'media_events: media_updated_by_user_id records who changed photos');

insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"business_name":"Hacked"}') $q$,
  '42501', null, 'media_events: save basics is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'links', '{"links":[]}') $q$,
  '42501', null, 'media_events: save links is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'discount', '{"discount_percent":50}') $q$,
  '42501', null, 'media_events: save discount is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"plum"}') $q$,
  '42501', null, 'media_events: save theme is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media', '{"slides":[],"status":"published"}') $q$,
  '22023', null, 'media_events: a key outside the media allowlist is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-000000000004","crop":{"x":0,"y":0,"w":1,"h":1},"sort_order":0}]}') $q$,
  '22023', null, 'media_events: a slide using another member''s photo is refused at save');

insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['media','basics'], true) $q$,
  '42501', null, 'media_events: publishing media + basics is refused as a whole');
insert into _tap (line) select throws_ok(
  $q$ select public.discard_member_draft_sections('f1000000-0000-4000-8000-000000000001', array['basics']) $q$,
  '42501', null, 'media_events: discarding basics is refused');

insert into _tap (line) select throws_ok(
  $q$ insert into public.member_drafts (member_id, data) values ('f1000000-0000-4000-8000-000000000003', '{}') $q$,
  '42501', null, 'media_events: direct insert into member_drafts is denied');
insert into _tap (line) select throws_ok(
  $q$ update public.member_drafts set dirty_sections = '{}' where member_id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'media_events: direct update of member_drafts is denied');
insert into _tap (line) select throws_ok(
  $q$ delete from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'media_events: direct delete from member_drafts is denied');

insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['media'], false) $q$,
  'media_events: publish media (no hours check needed)');

reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.carousel_slides where member_id = 'f1000000-0000-4000-8000-000000000001'),
  2, 'publish media: live carousel now has the two drafted slides');
insert into _tap (line) select is(
  (select asset_id from public.carousel_slides where member_id = 'f1000000-0000-4000-8000-000000000001' and sort_order = 0),
  'f2000000-0000-4000-8000-000000000002'::uuid, 'publish media: slide order follows the draft');
insert into _tap (line) select is(
  (select dirty_sections from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  '{}'::text[], 'publish media: media no longer dirty');
insert into _tap (line) select is(
  (select business_name || '/' || status from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'PgTap Brewing/published', 'refused mixed publish left basics live data alone');

-- Direct REST writes to the live profile tables: denied for media_events
-- (20260925201100_member_role_write_limits.sql). An RLS-filtered UPDATE or
-- DELETE matches zero rows rather than erroring, hence is_empty() on
-- `returning`; an INSERT fails its with-check and errors.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select is_empty(
  $q$ update public.members set tagline = 'Direct write' where id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: direct members update denied');
insert into _tap (line) select is_empty(
  $q$ update public.members set status = 'published' where id = 'f1000000-0000-4000-8000-000000000003' returning 1 $q$,
  'media_events: cannot make a never-published member live directly');
insert into _tap (line) select is_empty(
  $q$ update public.members set status = 'draft' where id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: cannot unpublish directly');
insert into _tap (line) select is_empty(
  $q$ update public.members set hours_confirmed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: cannot set hours_confirmed_at directly');
insert into _tap (line) select is_empty(
  $q$ update public.members set published_at = now() where id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: cannot set published_at directly');
insert into _tap (line) select is_empty(
  $q$ update public.members set member_type = 'allied' where id = 'f1000000-0000-4000-8000-000000000003' returning 1 $q$,
  'media_events: cannot change an unconfirmed member_type directly');
insert into _tap (line) select is_empty(
  $q$ delete from public.hours where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: cannot delete hours');
insert into _tap (line) select throws_ok(
  $q$ insert into public.hours (member_id, weekday, is_closed) values ('f1000000-0000-4000-8000-000000000001', 0, true) $q$,
  '42501', null, 'media_events: cannot insert hours');
insert into _tap (line) select is_empty(
  $q$ update public.carousel_slides set outbound_url = 'https://evil.example.test'
      where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: cannot update live carousel_slides');
insert into _tap (line) select throws_ok(
  $q$ insert into public.carousel_slides (member_id, asset_id, crop, sort_order)
      values ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '{"x":0,"y":0,"w":1,"h":1}', 3) $q$,
  '42501', null, 'media_events: cannot insert live carousel_slides');
insert into _tap (line) select throws_ok(
  $q$ insert into public.special_hours (member_id, date, is_closed) values ('f1000000-0000-4000-8000-000000000001', '2026-12-25', true) $q$,
  '42501', null, 'media_events: cannot insert special_hours');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_links (member_id, kind, url) values ('f1000000-0000-4000-8000-000000000001', 'other', 'https://evil.example.test') $q$,
  '42501', null, 'media_events: cannot insert member_links');
insert into _tap (line) select is_empty(
  $q$ delete from public.member_links where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'media_events: cannot delete member_links');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_categories (member_id, category_id) values ('f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'media_events: cannot insert member_categories');

reset role;
insert into _tap (line) select ok(
  (select m1.status = 'published' and m1.tagline = 'Live tagline' and m1.hours_confirmed_at is null
          and m3.status = 'draft' and m3.member_type = 'producer'
          and (select count(*) from public.hours h where h.member_id = m1.id) = 2
          and (select count(*) from public.member_links l where l.member_id = m1.id) = 1
          and (select count(*) from public.carousel_slides c where c.member_id = m1.id) = 2
   from public.members m1, public.members m3
   where m1.id = 'f1000000-0000-4000-8000-000000000001' and m3.id = 'f1000000-0000-4000-8000-000000000003'),
  'media_events direct writes: live m1 and m3 unchanged');

-- ...and since phase 2 (20260925210100_lock_live_profile_writes.sql) the
-- owner and full editor can't write the drafted live data directly either:
-- only publish_member_draft / unpublish_member change it. (More cases in
-- live_locks.test.sql.)
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ update public.members set tagline = 'Editor direct' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'editor: direct members update of a drafted column is denied');
insert into _tap (line) select throws_ok(
  $q$ insert into public.carousel_slides (member_id, asset_id, crop, sort_order)
      values ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '{"x":0,"y":0,"w":1,"h":1}', 3) $q$,
  '42501', null, 'editor: direct carousel_slides insert is denied');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ update public.members set hours_confirmed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: can no longer set hours_confirmed_at directly');
insert into _tap (line) select throws_ok(
  $q$ update public.members set status = 'published' where id = 'f1000000-0000-4000-8000-000000000003' $q$,
  '42501', null, 'owner: can no longer publish directly');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';

insert into _tap (line) select throws_ok(
  $q$ insert into public.calendar_connections (member_id, provider, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'ics', 'https://cal.example.test/a.ics', 'beer') $q$,
  '42501', null, 'media_events: calendar_connections insert is denied');

insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media', '{"slides":[]}') $q$,
  'media_events: save media again');
insert into _tap (line) select lives_ok(
  $q$ select public.discard_member_draft_sections('f1000000-0000-4000-8000-000000000001', array['media']) $q$,
  'media_events: discard media');

reset role;
insert into _tap (line) select is(
  (select dirty_sections from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  '{}'::text[], 'discard media: media no longer dirty');
insert into _tap (line) select is(
  (select data -> 'media' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  public._draft_section_from_live('f1000000-0000-4000-8000-000000000001', 'media'),
  'discard media: draft media reset to live');

-- ---------------------------------------------------------------------
-- Full editor on m1
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';

insert into _tap (line) select throws_ok(
  $q$ insert into public.calendar_connections (member_id, provider, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'ics', 'https://cal.example.test/a.ics', 'beer') $q$,
  '42501', null, 'editor: calendar_connections insert is denied (owner only)');
insert into _tap (line) select ok(public.is_member_full_editor('f1000000-0000-4000-8000-000000000001'), 'editor is a full editor');

insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"business_name":"Editor Brewing",
         "hours":[{"weekday":2,"opens_at":"10:00","closes_at":"18:00","closes_next_day":false,"is_closed":false}],
         "special_hours":[{"date":"2026-11-26","is_closed":true,"opens_at":null,"closes_at":null,"closes_next_day":false,"note":"Thanksgiving"}]}') $q$,
  'editor: save basics');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-000000000001","crop":{"x":0,"y":0,"w":0.8,"h":1},"outbound_url":"https://x.example.test","sort_order":0}]}') $q$,
  'editor: save media');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'links',
       '{"links":[{"kind":"instagram","label":null,"url":"https://instagram.com/pgtap","sort_order":0},
                  {"kind":"website","label":"Site","url":"https://pgtap.example.test","sort_order":1}]}') $q$,
  'editor: save links');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'discount',
       '{"discount_percent":10,"discount_no_fixed_percent":false,"discount_redeem_text":"Show your card",
         "category_ids":["f3000000-0000-4000-8000-000000000001"]}') $q$,
  'editor: save discount');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"teal"}') $q$,
  'editor: save theme');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"member_type":"allied"}') $q$,
  '22023', null, 'editor: member_type can never be saved into a draft');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', jsonb_build_object('tagline', repeat('x', 71))) $q$,
  '22023', null, 'editor: tagline over 70 characters is refused at save');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"slug":"stolen-slug"}') $q$,
  '22023', null, 'editor: slug can never be saved into a draft');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"status":"published"}') $q$,
  '22023', null, 'editor: status can never be saved into a draft');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"published_at":"2020-01-01T00:00:00Z"}') $q$,
  '22023', null, 'editor: published_at can never be saved into a draft');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"hours":[{"weekday":1,"opens_at":"09:00","closes_at":"17:00","member_id":"f1000000-0000-4000-8000-000000000002"}]}') $q$,
  '22023', null, 'editor: an extra key inside an hours[] element is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"teal","custom_css":"body{}"}') $q$,
  '22023', null, 'editor: an unknown top-level key is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'links',
       '{"links":[{"kind":"website","label":null,"url":"javascript:alert(1)","sort_order":0}]}') $q$,
  '22023', null, 'editor: a javascript: link URL is refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-000000000001","crop":{"x":0,"y":0,"w":1,"h":1},"outbound_url":"JavaScript:alert(1)","sort_order":0}]}') $q$,
  '22023', null, 'editor: a javascript: slide tap-through URL is refused');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media',
       '{"slides":[{"asset_id":"f2000000-0000-4000-8000-000000000001","crop":{"x":0,"y":0,"w":1,"h":1},"outbound_url":"HTTPS://Shop.Example.test","sort_order":0}]}') $q$,
  'editor: an upper-case HTTPS URL is fine');

insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001',
       array['basics','media','links','discount','theme'], true) $q$,
  'editor: publish every section');

reset role;
insert into _tap (line) select is(
  (select business_name from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'Editor Brewing', 'editor publish: business_name live');
insert into _tap (line) select is(
  (select array_agg(weekday order by weekday) from public.hours where member_id = 'f1000000-0000-4000-8000-000000000001'),
  array[2]::smallint[], 'editor publish: hours replaced by the draft''s');
insert into _tap (line) select is(
  (select note from public.special_hours where member_id = 'f1000000-0000-4000-8000-000000000001' and date = '2026-11-26'),
  'Thanksgiving', 'editor publish: special hours live');
insert into _tap (line) select is(
  (select count(*)::int from public.member_links where member_id = 'f1000000-0000-4000-8000-000000000001'),
  2, 'editor publish: links replaced');
insert into _tap (line) select is(
  (select count(*)::int from public.member_categories where member_id = 'f1000000-0000-4000-8000-000000000001'),
  1, 'editor publish: categories replaced');
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'teal', 'editor publish: theme live');
insert into _tap (line) select is(
  (select discount_percent::int from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  10, 'editor publish: discount live');
insert into _tap (line) select ok(
  (select hours_confirmed_at is not null from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'editor publish: hours_confirmed_at set by the confirm tick');
insert into _tap (line) select is(
  (select dirty_sections from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  '{}'::text[], 'editor publish: nothing left dirty');

-- ---------------------------------------------------------------------
-- Owner: the only member role that manages the calendar connection
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ insert into public.calendar_connections (member_id, provider, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'ics', 'https://cal.example.test/a.ics', 'beer') $q$,
  'owner: calendar_connections insert allowed');

-- ---------------------------------------------------------------------
-- Signed in but not linked
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.ensure_member_draft('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'unlinked user: ensure_member_draft refused');
insert into _tap (line) select is(
  (select count(*)::int from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'unlinked user: cannot see the draft');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'media', '{"slides":[]}') $q$,
  '42501', null, 'unlinked user: save refused');

-- ---------------------------------------------------------------------
-- Guild admin (impersonating): allowed, and audited against themselves
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"olive"}') $q$,
  'guild admin: save theme');
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.audit_log
   where actor_user_id = 'f0000000-0000-4000-8000-000000000004'
     and member_id = 'f1000000-0000-4000-8000-000000000001' and table_name = 'member_drafts'),
  1, 'guild admin: draft save audited against the real actor');

-- ---------------------------------------------------------------------
-- Anonymous: nothing
-- ---------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"plum"}') $q$,
  '42501', null, 'anon: cannot execute save_member_draft_section');
insert into _tap (line) select throws_ok(
  $q$ select * from public.member_drafts $q$,
  '42501', null, 'anon: cannot read member_drafts');

-- ---------------------------------------------------------------------
-- member_invites (service role only) and support_requests
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select * from public.member_invites $q$,
  '42501', null, 'owner: member_invites has no client access');
insert into _tap (line) select lives_ok(
  $q$ insert into public.support_requests (member_id, requested_by_user_id, kind, requested_member_type, note)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'type_change', 'allied', 'We sell supplies now') $q$,
  'owner: can file a type-change request');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ insert into public.support_requests (member_id, requested_by_user_id, kind, requested_member_type)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 'type_change', 'mobile') $q$,
  '42501', null, 'media_events: cannot file a type-change request');
insert into _tap (line) select is(
  (select count(*)::int from public.support_requests where member_id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'media_events: cannot read support requests');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ insert into public.support_requests (member_id, requested_by_user_id, kind, requested_member_type)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'type_change', 'mobile') $q$,
  '42501', null, 'owner: cannot file a request in someone else''s name');
insert into _tap (line) select throws_ok(
  $q$ insert into public.support_requests (member_id, requested_by_user_id, kind, requested_member_type, status)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'type_change', 'mobile', 'handled') $q$,
  '42501', null, 'owner: cannot file a request already marked handled');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ insert into public.support_requests (member_id, requested_by_user_id, kind, requested_member_type)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000005', 'type_change', 'mobile') $q$,
  '42501', null, 'owner of another member: cannot file a request for this one');

-- ---------------------------------------------------------------------
-- Cross-member: being linked to one member gives nothing on another
-- ---------------------------------------------------------------------
-- f0..05 owns m2 only; acting on m1.
insert into _tap (line) select throws_ok(
  $q$ select public.ensure_member_draft('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'owner of m2: ensure_member_draft on m1 refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"plum"}') $q$,
  '42501', null, 'owner of m2: save on m1 refused');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['theme'], false) $q$,
  '42501', null, 'owner of m2: publish on m1 refused');
insert into _tap (line) select throws_ok(
  $q$ select public.discard_member_draft_sections('f1000000-0000-4000-8000-000000000001', array['theme']) $q$,
  '42501', null, 'owner of m2: discard on m1 refused');
insert into _tap (line) select is(
  (select count(*)::int from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'owner of m2: cannot read m1''s draft');

-- f0..03 is media_events on m1 only; acting on m2.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.ensure_member_draft('f1000000-0000-4000-8000-000000000002') $q$,
  '42501', null, 'media_events of m1: ensure_member_draft on m2 refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000002', 'media', '{"slides":[]}') $q$,
  '42501', null, 'media_events of m1: save media on m2 refused');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000002', array['media'], false) $q$,
  '42501', null, 'media_events of m1: publish media on m2 refused');

-- ---------------------------------------------------------------------
-- Function privileges: internal helpers are unreachable from the API;
-- the exposed functions are for signed-in users only.
-- ---------------------------------------------------------------------
reset role;
insert into _tap (line) select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like '\_draft\_%' or p.proname like '\_validate\_%')),
  15, 'there are 15 internal draft helpers (update this test when adding one)');
insert into _tap (line)
select ok(not has_function_privilege(r.role, p.oid, 'execute'),
          format('%s cannot execute %s', r.role, p.oid::regprocedure))
from pg_proc p
cross join (values ('anon'), ('authenticated')) as r (role)
where p.pronamespace = 'public'::regnamespace
  and (p.proname like '\_draft\_%' or p.proname like '\_validate\_%')
order by p.proname, r.role;
insert into _tap (line)
select ok(has_function_privilege(r.role, f.sig, 'execute') = (r.role = 'authenticated'),
          format('%s %s execute %s', r.role, case when r.role = 'authenticated' then 'can' else 'cannot' end, f.sig))
from (values
  ('public.ensure_member_draft(uuid)'),
  ('public.save_member_draft_section(uuid,text,jsonb)'),
  ('public.publish_member_draft(uuid,text[],boolean)'),
  ('public.discard_member_draft_sections(uuid,text[])'),
  ('public.confirm_member_type(uuid,text)'),
  ('public.complete_member_setup(uuid)'),
  ('public.unpublish_member(uuid)'),
  ('public.member_role(uuid)'),
  ('public.is_member_full_editor(uuid)'),
  ('public.can_edit_section(uuid,text)')
) as f (sig)
cross join (values ('anon'), ('authenticated')) as r (role)
order by f.sig, r.role;

-- ---------------------------------------------------------------------
-- member_users: role values and one owner per member
-- ---------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_users (member_id, user_id, role)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006', 'owner') $q$,
  '23505', null, 'member_users: a second owner is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_users (member_id, user_id, role)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006', 'admin') $q$,
  '23514', null, 'member_users: unknown role is refused');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
