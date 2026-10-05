-- Map coordinates for mobile members' stops (20261005100000_event_coordinates.sql):
-- three nullable columns the public can read with the event, and nobody
-- but the service role (the cron) is expected to fill.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(6);

insert into _tap (line) select has_column('public', 'events', 'latitude', 'events.latitude exists');
insert into _tap (line) select has_column('public', 'events', 'longitude', 'events.longitude exists');
insert into _tap (line) select has_column('public', 'events', 'geocoded_address', 'events.geocoded_address exists');

-- m4 (pgtap-m4) is a published mobile member.
insert into public.events (id, member_id, source, kind, title, starts_at, address, latitude, longitude, geocoded_address)
values ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event',
        'Tacos at the brewery', now() + interval '2 hours', '3900 Main St, Riverside, CA',
        33.98, -117.37, '3900 Main St, Riverside, CA');

set local role anon;
insert into _tap (line) select is(
  (select latitude::text from public.events where id = 'f3000000-0000-4000-8000-000000000001'),
  '33.980000', 'a visitor can read a published member''s stop coordinates');

update public.events set latitude = 0 where id = 'f3000000-0000-4000-8000-000000000001';
reset role;
insert into _tap (line) select is(
  (select latitude::text from public.events where id = 'f3000000-0000-4000-8000-000000000001'),
  '33.980000', 'a visitor can''t change them');

insert into _tap (line) select is(
  (select geocoded_address from public.events where id = 'f3000000-0000-4000-8000-000000000001'),
  '3900 Main St, Riverside, CA', 'geocoded_address is stored as given');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
