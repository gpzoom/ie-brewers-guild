insert into storage.buckets (id, name, public)
values ('member-media', 'member-media', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('member-logos', 'member-logos', true)
on conflict (id) do nothing;

-- Path convention for both buckets: {member_id}/{filename}. This lets
-- storage.foldername(name) pull the member_id straight out of the path
-- for RLS, without a lookup table.

-- member-media: fully private. The public reaches it only through a
-- Worker that applies crop/resize (a later plan) using the service key,
-- which bypasses RLS -- so there is deliberately no anon/public select
-- policy on this bucket at all.
create policy "member-media: owners and editors manage their folder"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'member-media'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'member-media'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  );

create policy "member-media: guild admins manage everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'member-media' and public.is_guild_admin())
  with check (bucket_id = 'member-media' and public.is_guild_admin());

-- member-logos: public, since logos are published anyway (spec, "Storage
-- buckets").
create policy "member-logos: anyone can read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'member-logos');

create policy "member-logos: owners and editors manage their folder"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'member-logos'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'member-logos'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  );

create policy "member-logos: guild admins manage everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'member-logos' and public.is_guild_admin())
  with check (bucket_id = 'member-logos' and public.is_guild_admin());
