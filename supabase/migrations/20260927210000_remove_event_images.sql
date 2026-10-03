-- Food vendor photos are removed (owner, 27 September 2026: sharing a
-- Google Drive photo "Anyone with the link" was too much to ask of
-- members). Undoes the photo half of 20260927200000_event_all_day_and_images.sql;
-- all_day stays. No photo was ever stored (checked before this migration),
-- so the bucket is empty. Supabase doesn't allow deleting a bucket from SQL
-- (only through the Storage API), so it's made private and left unused.
alter table public.events
  drop column image_source,
  drop column image_path;

drop policy if exists "event-images: anyone can read" on storage.objects;

update storage.buckets set public = false where id = 'event-images';
