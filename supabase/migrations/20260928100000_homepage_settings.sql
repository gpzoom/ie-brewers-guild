-- Homepage (docs/member-profiles.md, "Homepage"; owner, 2026-09-28):
--
-- 1. How long each page of the "Coming up at our members" carousel stays up
--    before the next one tears off. The super admin picks it on Settings.
-- 2. The homepage hero image, uploaded by the super admin on Settings. Null
--    means the site's built-in image. The public homepage reads both through
--    the server (service role): site_settings stays super-admin-only.
alter table public.site_settings
  add column carousel_dwell_seconds integer not null default 6
    check (carousel_dwell_seconds in (4, 6, 8, 10, 15)),
  add column hero_image_path text
    check (hero_image_path is null or hero_image_path ~ '^hero/[A-Za-z0-9._-]+$');

-- site-images: public (the hero shows to everyone), written only by the
-- super admin. JPEG or PNG, up to 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "site-images: anyone can read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'site-images');

create policy "site-images: super admins manage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'site-images' and public.is_super_admin())
  with check (bucket_id = 'site-images' and public.is_super_admin());
