create table public.carousel_slides (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  crop jsonb not null,
  outbound_url text,
  sort_order smallint not null check (sort_order between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, sort_order)
);

create index carousel_slides_member_id_idx on public.carousel_slides (member_id);

alter table public.carousel_slides enable row level security;

create policy "carousel_slides: public can read slides of published members"
  on public.carousel_slides for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = carousel_slides.member_id and m.status = 'published'
    )
  );

create policy "carousel_slides: owners and editors can read their own"
  on public.carousel_slides for select
  to authenticated
  using (public.is_member_editor(member_id));

create policy "carousel_slides: guild admins can read every row"
  on public.carousel_slides for select
  to authenticated
  using (public.is_guild_admin());

create policy "carousel_slides: owners and editors can manage their own"
  on public.carousel_slides for all
  to authenticated
  using (public.is_member_editor(member_id))
  with check (public.is_member_editor(member_id));

create policy "carousel_slides: guild admins can manage every row"
  on public.carousel_slides for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());

-- Deferred from Task 5: media_assets' public select needs carousel_slides
-- to exist, to check "referenced by a published slide."
create policy "media_assets: public can read approved assets referenced by a published slide/logo/cover"
  on public.media_assets for select
  to anon, authenticated
  using (
    review_status = 'approved'
    and (
      exists (
        select 1 from public.carousel_slides cs
        join public.members m on m.id = cs.member_id
        where cs.asset_id = media_assets.id and m.status = 'published'
      )
      or exists (
        select 1 from public.members m
        where (m.logo_asset_id = media_assets.id or m.cover_asset_id = media_assets.id)
          and m.status = 'published'
      )
    )
  );
