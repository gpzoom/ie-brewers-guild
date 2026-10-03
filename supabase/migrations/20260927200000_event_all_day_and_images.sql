-- Calendar entries: all-day, and a picture (docs/member-profiles.md,
-- "Events" > "Food calendar").
--
-- all_day: an all-day calendar entry (a DATE, not a time). It's stored from
-- the member's own local midnight and shown as "All day" rather than a
-- clock time.
--
-- image_source / image_path: a food vendor's picture. The calendar gives a
-- link (a Google Drive attachment, or an image link in the description);
-- the sync copies the picture once into the public event-images bucket
-- (image_path) and remembers where it came from (image_source), so a
-- re-sync only fetches it again when the link changes.
alter table public.events
  add column all_day boolean not null default false,
  add column image_source text,
  add column image_path text;

-- Public, like member-logos: the pictures only ever show on published
-- profiles. Written only by the Worker's sync with the service key (which
-- bypasses these policies), so there is no write policy for anyone.
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy "event-images: anyone can read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'event-images');
