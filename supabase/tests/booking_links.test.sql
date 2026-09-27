-- Booking link types for Mobile members (20260927140000_booking_link_kinds.sql):
-- instagram_dm and whatsapp save to the draft and publish to member_links;
-- an unknown kind is still refused. Runs inside one transaction that is
-- rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(5);

set local role authenticated;
-- The owner of m4 (a mobile member).
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000004', 'links',
      '{"links":[{"kind":"instagram_dm","label":null,"url":"https://ig.me/m/rollingtaps","sort_order":0},
                 {"kind":"whatsapp","label":null,"url":"https://wa.me/19515551234","sort_order":1}]}') $q$,
  'owner: Instagram DM and WhatsApp links save to the draft');

insert into _tap (line) select throws_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000004', 'links',
      '{"links":[{"kind":"carrier_pigeon","label":null,"url":"https://x.example.test","sort_order":0}]}') $q$,
  null, null, 'owner: an unknown link kind is still refused');

insert into _tap (line) select lives_ok(
  $q$ select public.publish_member_draft('f1000000-0000-4000-8000-000000000004', array['links'], false) $q$,
  'owner: the booking links publish');

reset role;
insert into _tap (line) select is(
  (select array_agg(kind order by sort_order) from public.member_links where member_id = 'f1000000-0000-4000-8000-000000000004'),
  array['instagram_dm', 'whatsapp'],
  'both are live in member_links, in order');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_links (member_id, kind, url) values ('f1000000-0000-4000-8000-000000000004', 'carrier_pigeon', 'https://x.example.test') $q$,
  '23514', null, 'member_links still refuses an unknown kind');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
