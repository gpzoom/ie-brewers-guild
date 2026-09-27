-- Food calendar (20260927190000_food_calendar.sql): a producer can connect
-- a second calendar (purpose 'food'); its entries are events rows with kind
-- 'food'; visitors read them like any event, and learn from
-- member_has_food_calendar() only whether a published producer has one.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(13);

-- m1 (producer, published) is owned by f0..01.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into _tap (line) select lives_ok(
  $q$ insert into public.calendar_connections (id, member_id, provider, purpose, ics_url, sync_tag)
      values ('f5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'ics', 'events', 'https://cal.example/e.ics', '#guild') $q$,
  'owner: saves the events calendar');
insert into _tap (line) select lives_ok(
  $q$ insert into public.calendar_connections (id, member_id, provider, purpose, ics_url, sync_tag)
      values ('f5000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'ics', 'food', 'https://cal.example/f.ics', '#food') $q$,
  'owner: saves a food calendar beside it');
insert into _tap (line) select throws_ok(
  $q$ insert into public.calendar_connections (member_id, provider, purpose, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'ics', 'food', 'https://cal.example/g.ics', '#tacos') $q$,
  '23505', null, 'owner: only one food calendar');
insert into _tap (line) select throws_ok(
  $q$ insert into public.calendar_connections (member_id, provider, purpose, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'ics', 'drinks', 'https://cal.example/d.ics', '#d') $q$,
  '23514', null, 'only events and food are purposes');

reset role;
-- What the sync writes (the service role; here, postgres).
insert into public.events (id, member_id, calendar_connection_id, source, kind, external_event_id, title, starts_at)
values
  ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'ics', 'food', 'food-1', 'Taco Truck', now() + interval '1 day'),
  ('f6000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'ics', 'event', 'event-1', 'Trivia', now() + interval '2 days');
insert into _tap (line) select throws_ok(
  $q$ insert into public.events (member_id, source, kind, starts_at) values ('f1000000-0000-4000-8000-000000000001', 'manual', 'snack', now()) $q$,
  '23514', null, 'only event and food are kinds');
insert into _tap (line) select is(
  (select kind from public.events where title = 'Trivia' and member_id = 'f1000000-0000-4000-8000-000000000001'),
  'event', 'an event row is kind event');

-- A visitor reads the food vendor like an event, and filtering by kind keeps them apart.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _tap (line) select is(
  (select count(*)::int from public.events where member_id = 'f1000000-0000-4000-8000-000000000001' and kind = 'food'),
  1, 'visitor: reads the food vendor');
insert into _tap (line) select is(
  (select count(*)::int from public.events where member_id = 'f1000000-0000-4000-8000-000000000001' and kind = 'event' and title = 'Taco Truck'),
  0, 'visitor: the food vendor is not an event');
insert into _tap (line) select ok(
  public.member_has_food_calendar('f1000000-0000-4000-8000-000000000001'),
  'visitor: a published producer with a food calendar shows the food week');
insert into _tap (line) select ok(
  not public.member_has_food_calendar('f1000000-0000-4000-8000-000000000002'),
  'visitor: a producer without one does not');
insert into _tap (line) select is(
  (select count(*)::int from public.calendar_connections),
  0, 'visitor: still cannot read anyone''s calendar links');

reset role;
insert into _tap (line) select is(
  (select all_day from public.events where id = 'f6000000-0000-4000-8000-000000000001'),
  false, 'a timed entry is not all-day (20260927200000_event_all_day_and_images.sql)');
insert into _tap (line) select is(
  (select public from storage.buckets where id = 'event-images'),
  true, 'food pictures live in a public bucket');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
