-- Phase 2: the live profile changes only through publish_member_draft,
-- unpublish_member, Guild admin paths and the service role
-- (20260925210000_unpublish_member.sql,
-- 20260925210100_lock_live_profile_writes.sql). Runs entirely inside one
-- transaction that is rolled back at the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(44);

-- ---------------------------------------------------------------------
-- Owner: no direct writes to the drafted live data
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into _tap (line) select throws_ok(
  $q$ update public.members set tagline = 'Direct' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: direct tagline update denied');
insert into _tap (line) select throws_ok(
  $q$ update public.members set theme = 'plum' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: direct theme update denied');
insert into _tap (line) select throws_ok(
  $q$ update public.members set logo_asset_id = 'f2000000-0000-4000-8000-000000000001' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: direct logo update denied');
insert into _tap (line) select throws_ok(
  $q$ update public.members set discount_percent = 50 where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: direct discount update denied');
insert into _tap (line) select throws_ok(
  $q$ update public.members set status = 'draft' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: cannot unpublish directly (only unpublish_member)');
insert into _tap (line) select throws_ok(
  $q$ update public.members set published_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'owner: cannot set published_at directly');
insert into _tap (line) select throws_ok(
  $q$ update public.members set member_type = 'allied', tagline = 'Sneaky' where id = 'f1000000-0000-4000-8000-000000000003' $q$,
  '42501', null, 'owner: a type change can''t carry another column with it');
insert into _tap (line) select lives_ok(
  $q$ update public.members set member_type = 'allied' where id = 'f1000000-0000-4000-8000-000000000003' $q$,
  'owner: an unconfirmed member_type alone can still be changed live');

insert into _tap (line) select throws_ok(
  $q$ insert into public.hours (member_id, weekday, is_closed) values ('f1000000-0000-4000-8000-000000000001', 0, true) $q$,
  '42501', null, 'owner: hours insert denied');
insert into _tap (line) select is_empty(
  $q$ update public.hours set is_closed = true where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'owner: hours update matches nothing');
insert into _tap (line) select is_empty(
  $q$ delete from public.hours where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'owner: hours delete matches nothing');
insert into _tap (line) select throws_ok(
  $q$ insert into public.special_hours (member_id, date, is_closed) values ('f1000000-0000-4000-8000-000000000001', '2026-12-25', true) $q$,
  '42501', null, 'owner: special_hours insert denied');
insert into _tap (line) select is_empty(
  $q$ update public.carousel_slides set outbound_url = 'https://x.example.test' where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'owner: carousel_slides update matches nothing');
insert into _tap (line) select is_empty(
  $q$ delete from public.carousel_slides where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'owner: carousel_slides delete matches nothing');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_links (member_id, kind, url) values ('f1000000-0000-4000-8000-000000000001', 'other', 'https://x.example.test') $q$,
  '42501', null, 'owner: member_links insert denied');
insert into _tap (line) select is_empty(
  $q$ update public.member_links set url = 'https://x.example.test' where member_id = 'f1000000-0000-4000-8000-000000000001' returning 1 $q$,
  'owner: member_links update matches nothing');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_categories (member_id, category_id) values ('f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'owner: member_categories insert denied');

-- The editor gets the same treatment.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ update public.members set business_name = 'Direct' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'editor: direct business_name update denied');
insert into _tap (line) select throws_ok(
  $q$ insert into public.hours (member_id, weekday, is_closed) values ('f1000000-0000-4000-8000-000000000001', 3, true) $q$,
  '42501', null, 'editor: hours insert denied');

reset role;
insert into _tap (line) select ok(
  (select m.tagline = 'Live tagline' and m.theme = 'amber' and m.logo_asset_id is null and m.status = 'published'
          and (select count(*) from public.hours h where h.member_id = m.id) = 2
          and (select count(*) from public.carousel_slides c where c.member_id = m.id) = 1
          and (select count(*) from public.member_links l where l.member_id = m.id) = 1
          and (select count(*) from public.member_categories mc where mc.member_id = m.id) = 0
   from public.members m where m.id = 'f1000000-0000-4000-8000-000000000001'),
  'direct writes: live m1 unchanged');

-- ---------------------------------------------------------------------
-- Publishing still works
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"tagline":"Published through the draft","phone":"555-0101",
         "hours":[{"weekday":3,"opens_at":"11:00","closes_at":"19:00","closes_next_day":false,"is_closed":false}]}') $q$,
  'owner: save basics to the draft');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'theme', '{"theme":"forest"}') $q$,
  'owner: save theme to the draft');
reset role;
insert into _tap (line) select is(
  (select tagline from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'Live tagline', 'a draft save doesn''t touch live');
set local role authenticated;
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics','theme'], true) $q$,
  'owner: publish basics + theme');
reset role;
insert into _tap (line) select ok(
  (select tagline = 'Published through the draft' and phone = '555-0101' and theme = 'forest'
          and hours_confirmed_at is not null and published_at is not null and status = 'published'
   from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'publish: members columns, confirmation and publish time live');
insert into _tap (line) select is(
  (select array_agg(weekday order by weekday) from public.hours where member_id = 'f1000000-0000-4000-8000-000000000001'),
  array[3]::smallint[], 'publish: hours replaced');

-- ---------------------------------------------------------------------
-- unpublish_member ("Move back to draft")
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.unpublish_member('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'media_events: cannot unpublish');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.unpublish_member('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'unlinked user: cannot unpublish');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.unpublish_member('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'owner of another member: cannot unpublish this one');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select is(
  public.unpublish_member('f1000000-0000-4000-8000-000000000001'),
  'draft', 'editor: unpublish returns draft');
reset role;
insert into _tap (line) select is(
  (select status from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'draft', 'unpublish: member is draft');
insert into _tap (line) select is(
  (select tagline from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'Published through the draft', 'unpublish: content left alone');
set local role authenticated;
insert into _tap (line) select is(
  public.unpublish_member('f1000000-0000-4000-8000-000000000001'),
  'draft', 'unpublish again: already draft, no error');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.unpublish_member('f1000000-0000-4000-8000-000000000005') $q$,
  '42501', null, 'owner: an applied member can''t be moved to draft here');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['theme'], false) $q$,
  '22023', null, 'owner: back in draft, a partial publish is refused (first-publish rule)');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics','media','links','discount','theme'], true) $q$,
  'owner: republish with every section');
reset role;
insert into _tap (line) select is(
  (select status from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'published', 'republish: member is live again');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is(
  public.unpublish_member('f1000000-0000-4000-8000-000000000004'),
  'draft', 'guild admin: can move a member back to draft');
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.audit_log
   where actor_user_id = 'f0000000-0000-4000-8000-000000000004'
     and member_id = 'f1000000-0000-4000-8000-000000000004' and table_name = 'members'),
  1, 'guild admin unpublish: audited against the real actor');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _tap (line) select throws_ok(
  $q$ select public.unpublish_member('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'anon: cannot execute unpublish_member');

-- ---------------------------------------------------------------------
-- Guild admin and service-role paths keep writing live
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select isnt_empty(
  $q$ update public.members set tagline = 'Guild fix', member_type = 'allied' where id = 'f1000000-0000-4000-8000-000000000002' returning 1 $q$,
  'guild admin: roster edits to members still work');
insert into _tap (line) select lives_ok(
  $q$ insert into public.hours (member_id, weekday, is_closed) values ('f1000000-0000-4000-8000-000000000002', 0, true) $q$,
  'guild admin: live child-table writes still work');
insert into _tap (line) select isnt_empty(
  $q$ update public.members set status = 'suspended' where id = 'f1000000-0000-4000-8000-000000000002' returning 1 $q$,
  'guild admin: roster status changes still work');

reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into _tap (line) select isnt_empty(
  $q$ update public.members set hours_confirmed_at = now() where id = 'f1000000-0000-4000-8000-000000000004' returning 1 $q$,
  'service role: the one-click stale-hours link still sets hours_confirmed_at');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
