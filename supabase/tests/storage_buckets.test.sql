-- Storage bucket file types (20261014100000_member_logos_png_only.sql):
-- logos are PNG only, so nobody can put an SVG (which can carry a script)
-- into the public logo bucket by going around the app.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(2);

insert into _tap (line) select is(
  (select allowed_mime_types from storage.buckets where id = 'member-logos'),
  array['image/png'], 'member-logos accepts PNG only');

insert into _tap (line) select ok(
  not exists (select 1 from storage.buckets where 'image/svg+xml' = any (allowed_mime_types)),
  'no bucket accepts SVG');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
