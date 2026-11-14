-- Homepage sections (20261118100000_homepage_sections.sql): the ordered list of
-- homepage sections and the announcement image gallery. Only the super admin
-- reads or changes either table. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(10);

insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

insert into _tap (line) select ok(
  to_regclass('public.announcement_images') is not null
  and to_regclass('public.homepage_sections') is not null,
  'both tables exist');

insert into _tap (line) select is(
  (select array_agg(kind || ':' || position order by position) from public.homepage_sections),
  array['spotlight:1', 'events:2'],
  'seed: spotlight at 1, events at 2');

-- Guild admin (not super admin): blocked.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$insert into public.homepage_sections (kind, position) values ('events', 9)$$,
  '42501', null, 'guild admin: cannot insert a section');
insert into _tap (line) select is(
  (select count(*) from public.homepage_sections), 0::bigint, 'guild admin: sees no sections');

-- Super admin.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
insert into public.announcement_images (id, image_path, alt_text, width, height)
values ('f3000000-0000-4000-8000-000000000001', 'announcements/test.jpg', 'A test banner', 800, 400);
insert into public.homepage_sections (id, kind, position, image_id)
values ('f4000000-0000-4000-8000-000000000001', 'image', 3, 'f3000000-0000-4000-8000-000000000001');
reset role;
insert into _tap (line) select is(
  (select position from public.homepage_sections where kind = 'image'), 3,
  'super admin: adds an image and an image section at 3');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
select public.move_homepage_section('f4000000-0000-4000-8000-000000000001', -1);
reset role;
insert into _tap (line) select is(
  (select array_agg(kind || ':' || position order by position) from public.homepage_sections),
  array['spotlight:1', 'image:2', 'events:3'],
  'move up: image at 2, events at 3');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
select public.move_homepage_section((select id from public.homepage_sections where kind = 'spotlight'), -1);
reset role;
insert into _tap (line) select is(
  (select array_agg(kind || ':' || position order by position) from public.homepage_sections),
  array['spotlight:1', 'image:2', 'events:3'],
  'move up at the top: no change');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$delete from public.announcement_images where id = 'f3000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'cannot delete an image that a section uses');

with d as (delete from public.homepage_sections where kind = 'events' returning 1)
select count(*) as deleted into temp _del from d;
reset role;
insert into _tap (line) select is(
  (select deleted from _del), 0::bigint, 'super admin: cannot delete the events section');

insert into _tap (line) select throws_ok(
  $$insert into public.homepage_sections (kind, position, image_id, starts_on, ends_on)
    values ('image', 10, 'f3000000-0000-4000-8000-000000000001', '2026-12-10', '2026-12-01')$$,
  '23514', null, 'an image section ending before it starts is rejected');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
