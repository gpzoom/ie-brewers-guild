-- prefill_location_setup (20261017120000_prefill_location_setup.sql): a new
-- location of a one-manager business starts from the first set-up
-- location's tagline, phone, year, links (and supplies for mobile), once.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(17);

-- Producer pair: b1 is set up, b2 is fresh. Mobile pair: c1 set up, c2 fresh.
insert into public.members (id, slug, member_type, business_name, city, status, setup_completed_at) values
  ('f1000000-0000-4000-8000-0000000000b1', 'pgtap-pre-a', 'producer', 'PgTap Prefill', 'Redlands', 'draft', now());
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000b2', 'pgtap-pre-b', 'producer', 'PgTap Prefill', 'Riverside', 'draft');
insert into public.members (id, slug, member_type, business_name, city, status, setup_completed_at) values
  ('f1000000-0000-4000-8000-0000000000c1', 'pgtap-premob-a', 'mobile', 'PgTap Prefill Mobile', 'Redlands', 'draft', now());
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c2', 'pgtap-premob-b', 'mobile', 'PgTap Prefill Mobile', 'Riverside', 'draft');
update public.businesses
set management_mode = 'one_manager', manager_user_id = 'f0000000-0000-4000-8000-000000000006'
where id in (select business_id from public.members where id in
  ('f1000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000c1'));

insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-0000000000b1', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000b2', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000c1', 'f0000000-0000-4000-8000-000000000006', 'owner'),
  ('f1000000-0000-4000-8000-0000000000c2', 'f0000000-0000-4000-8000-000000000006', 'owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000b1', 'basics',
  '{"tagline":"Since 2010","phone":"909-555-0100","member_since_year":2010}');
select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000b1', 'links',
  '{"links":[{"kind":"website","label":null,"url":"https://prefill.example.test","sort_order":0}]}');
select public.save_member_draft_section('f1000000-0000-4000-8000-0000000000c1', 'discount',
  '{"category_ids":["f3000000-0000-4000-8000-000000000001"]}');

insert into _tap (line) select is(
  public.prefill_location_setup('f1000000-0000-4000-8000-0000000000b2'),
  true, 'manager: prefill copies onto a fresh location');
reset role;
insert into _tap (line) select is(
  (select data #>> '{basics,tagline}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  'Since 2010', 'the tagline is copied');
insert into _tap (line) select is(
  (select data #>> '{basics,phone}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  '909-555-0100', 'the phone is copied');
insert into _tap (line) select is(
  (select data #>> '{basics,member_since_year}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  '2010', 'the member-since year is copied');
insert into _tap (line) select is(
  (select data #>> '{links,links,0,url}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  'https://prefill.example.test', 'the link is copied');
insert into _tap (line) select is(
  (select data #>> '{basics,city}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  'Riverside', 'the location''s own city is untouched');
insert into _tap (line) select ok(
  (select dirty_sections @> array['basics', 'links'] and not ('discount' = any (dirty_sections))
   from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  'basics and links are unpublished; discount is not (producer)');

-- A second call does nothing.
update public.member_drafts set data = jsonb_set(data, '{basics,tagline}', '"Changed"')
where member_id = 'f1000000-0000-4000-8000-0000000000b2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  public.prefill_location_setup('f1000000-0000-4000-8000-0000000000b2'),
  false, 'a second call returns false');
reset role;
insert into _tap (line) select is(
  (select data #>> '{basics,tagline}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000b2'),
  'Changed', 'and changes nothing');

-- A tagline already set: nothing copied.
update public.members set tagline = 'Mine' where id = 'f1000000-0000-4000-8000-0000000000c2';
delete from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000c2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  public.prefill_location_setup('f1000000-0000-4000-8000-0000000000c2'),
  false, 'a location with its own tagline: false');
reset role;
insert into _tap (line) select is(
  (select data #>> '{basics,phone}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000c2'),
  null, 'and nothing was copied');

-- Outside any business.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is(
  public.prefill_location_setup('f1000000-0000-4000-8000-000000000001'),
  false, 'a member outside any business: false');
reset role;

-- Not an editor of the member.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.prefill_location_setup('f1000000-0000-4000-8000-0000000000b2') $$,
  '42501', null, 'a non-editor is refused');
reset role;

-- Mobile: supplies are copied too.
update public.members set tagline = null where id = 'f1000000-0000-4000-8000-0000000000c2';
delete from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000c2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  public.prefill_location_setup('f1000000-0000-4000-8000-0000000000c2'),
  true, 'mobile: prefill copies');
reset role;
insert into _tap (line) select is(
  (select data #>> '{discount,category_ids,0}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000c2'),
  'f3000000-0000-4000-8000-000000000001', 'mobile: the supply categories are copied');
insert into _tap (line) select ok(
  (select 'discount' = any (dirty_sections) from public.member_drafts where member_id = 'f1000000-0000-4000-8000-0000000000c2'),
  'mobile: discount is marked unpublished');

-- Anonymous callers cannot run it.
set local role anon;
insert into _tap (line) select throws_ok(
  $$ select public.prefill_location_setup('f1000000-0000-4000-8000-0000000000b2') $$,
  '42501', null, 'anonymous: refused');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
