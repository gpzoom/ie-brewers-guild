-- The draft's basics carry the ZIP and the map pin (address suggestions,
-- 20260926120000_draft_basics_address_coordinates.sql): read from live, saved
-- and validated in the draft, written live on publish. Runs entirely inside
-- one transaction that is rolled back at the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(22);

-- m1's live row starts with a ZIP and a pin, so a new draft reads them.
update public.members
set street_address = '1 Old Rd', postal_code = '92501', latitude = 33.9, longitude = -117.4
where id = 'f1000000-0000-4000-8000-000000000001';

insert into _tap (line) select is(
  (select jsonb_build_object('p', b -> 'postal_code', 'lat', b -> 'latitude', 'lng', b -> 'longitude')
   from (select public._draft_section_from_live('f1000000-0000-4000-8000-000000000001', 'basics') as b) x),
  '{"p":"92501","lat":33.900000,"lng":-117.400000}'::jsonb,
  'basics read from live includes postal_code, latitude and longitude');

-- ---------------------------------------------------------------------
-- Save + publish round trip (a picked suggestion)
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';

insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"street_address":"1710 Sessums Drive","city":"Redlands","state":"CA",
         "postal_code":"92374","latitude":34.066123,"longitude":-117.200123}') $q$,
  'editor: save a picked address with ZIP and pin');
reset role;
insert into _tap (line) select is(
  (select data #> '{basics,postal_code}' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  '"92374"'::jsonb, 'draft holds the ZIP');
insert into _tap (line) select is(
  (select (latitude, longitude, postal_code)::text from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  '(33.900000,-117.400000,92501)', 'saving the draft leaves live alone');

set local role authenticated;
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  'editor: publish basics');
reset role;
insert into _tap (line) select is(
  (select (street_address, city, postal_code, latitude, longitude)::text from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  '("1710 Sessums Drive",Redlands,92374,34.066123,-117.200123)', 'publish: address, ZIP and pin live');
insert into _tap (line) select is(
  (select data -> 'basics' from public.member_drafts where member_id = 'f1000000-0000-4000-8000-000000000001'),
  public._draft_section_from_live('f1000000-0000-4000-8000-000000000001', 'basics'),
  'publish: draft basics match live afterwards');

-- A hand edit clears the pin in the draft; publishing puts null live (the
-- app's post-publish geocode then looks the address up).
set local role authenticated;
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"street_address":"1712 Sessums Drive","postal_code":null,"latitude":null,"longitude":null}') $q$,
  'editor: hand edit clears ZIP and pin');
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  'editor: publish the hand edit');
reset role;
insert into _tap (line) select is(
  (select (street_address, postal_code, latitude, longitude)::text from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  '("1712 Sessums Drive",,,)', 'publish: cleared ZIP and pin are cleared live');

-- A draft saved before the keys existed keeps live's values.
update public.members
set postal_code = '92373', latitude = 34.05, longitude = -117.18
where id = 'f1000000-0000-4000-8000-000000000001';
update public.member_drafts
set data = jsonb_set(data, '{basics}', (data -> 'basics') - 'postal_code' - 'latitude' - 'longitude')
where member_id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  'editor: publish a draft without the new keys');
reset role;
insert into _tap (line) select is(
  (select (postal_code, latitude, longitude)::text from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  '(92373,34.050000,-117.180000)', 'old-shape draft: live ZIP and pin kept');

-- ---------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"latitude":91,"longitude":-117}') $q$,
  '22023', 'latitude must be from -90 to 90.', 'latitude out of range refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"latitude":34,"longitude":-181}') $q$,
  '22023', 'longitude must be from -180 to 180.', 'longitude out of range refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"latitude":34,"longitude":null}') $q$,
  '22023', 'latitude and longitude must be saved together.', 'half a pin refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"latitude":"34","longitude":"-117"}') $q$,
  '22023', 'latitude must be a number.', 'coordinates as strings refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"postal_code":92374}') $q$,
  '22023', 'postal_code must be a string.', 'ZIP as a number refused');
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"postal_code":"123456789012345678901"}') $q$,
  '22023', 'ZIP code must be 20 characters or fewer.', 'overlong ZIP refused');

-- A pin written straight into the draft (bypassing save) is still checked
-- at publish.
reset role;
update public.member_drafts
set data = jsonb_set(data, '{basics,latitude}', '95')
where member_id = 'f1000000-0000-4000-8000-000000000001';
create temp table _before_bad on commit drop as
  select to_jsonb(m) as m from public.members m where m.id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  '22023', null, 'publish refuses an out-of-range pin that bypassed save');
reset role;
insert into _tap (line) select is(
  (select to_jsonb(m) from public.members m where m.id = 'f1000000-0000-4000-8000-000000000001'),
  (select m from _before_bad), 'bad-pin publish: live unchanged');

-- ---------------------------------------------------------------------
-- Photos & events editors still can't touch basics
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics',
       '{"postal_code":"92374","latitude":34.066,"longitude":-117.2}') $q$,
  '42501', null, 'media_events: cannot save ZIP or pin');
insert into _tap (line) select throws_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000001', array['basics'], true) $q$,
  '42501', null, 'media_events: cannot publish basics');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
