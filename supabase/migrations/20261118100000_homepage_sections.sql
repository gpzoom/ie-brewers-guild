-- Homepage sections and the announcement image gallery
-- (docs/superpowers/specs/2026-11-14-homepage-sections-design.md).
--
-- homepage_sections is the ordered list of blocks on the homepage below the
-- hero: the Events block, the Spotlight block, and any number of image
-- announcements. announcement_images is the reusable gallery the image
-- sections point at. Only the super admin reads or changes either table; the
-- public homepage reads them through the Worker's service role.

create table public.announcement_images (
  id uuid primary key default gen_random_uuid(),
  image_path text not null check (image_path ~ '^announcements/[A-Za-z0-9._-]+$'),
  alt_text text not null check (length(trim(alt_text)) > 0),
  width int,
  height int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users (id) on delete set null
);

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('events', 'spotlight', 'image')),
  position int not null,
  enabled boolean not null default true,
  image_id uuid references public.announcement_images (id) on delete restrict,
  alt_text text,
  link_kind text not null default 'none' check (link_kind in ('none', 'internal', 'external')),
  link_target text,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users (id) on delete set null,
  constraint homepage_sections_image_iff_kind
    check ((kind = 'image') = (image_id is not null)),
  constraint homepage_sections_link_iff_target
    check ((link_kind = 'none') = (link_target is null)),
  constraint homepage_sections_dates_ordered
    check (starts_on is null or ends_on is null or ends_on >= starts_on),
  -- Deferred so two sections can swap positions inside one statement/transaction.
  constraint homepage_sections_position_key
    unique (position) deferrable initially deferred
);

-- Exactly one Events block and one Spotlight block; any number of images.
create unique index homepage_sections_one_per_kind
  on public.homepage_sections (kind)
  where kind in ('events', 'spotlight');

create trigger set_updated_at before update on public.announcement_images
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.homepage_sections
  for each row execute function public.set_updated_at();

alter table public.announcement_images enable row level security;
alter table public.homepage_sections enable row level security;

create policy "announcement_images: super admins can read"
  on public.announcement_images for select to authenticated
  using (public.is_super_admin());
create policy "announcement_images: super admins can insert"
  on public.announcement_images for insert to authenticated
  with check (public.is_super_admin());
create policy "announcement_images: super admins can update"
  on public.announcement_images for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "announcement_images: super admins can delete"
  on public.announcement_images for delete to authenticated
  using (public.is_super_admin());

create policy "homepage_sections: super admins can read"
  on public.homepage_sections for select to authenticated
  using (public.is_super_admin());
create policy "homepage_sections: super admins can insert"
  on public.homepage_sections for insert to authenticated
  with check (public.is_super_admin());
create policy "homepage_sections: super admins can update"
  on public.homepage_sections for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
-- The Events and Spotlight blocks can be turned off but never deleted.
create policy "homepage_sections: super admins can delete images"
  on public.homepage_sections for delete to authenticated
  using (public.is_super_admin() and kind = 'image');

-- Seed: Spotlight first (keeping today's on/off switch), then Events.
insert into public.homepage_sections (kind, position, enabled)
values
  ('spotlight', 1, coalesce((select spotlight_enabled from public.site_settings limit 1), false)),
  ('events', 2, true);

-- Swap a section's position with its nearest neighbor above (-1) or below (1).
-- Runs as the caller, so RLS still limits it to the super admin.
create or replace function public.move_homepage_section(p_id uuid, p_direction int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pos int;
  v_other_id uuid;
  v_other_pos int;
begin
  if p_direction not in (-1, 1) then
    raise exception 'p_direction must be -1 or 1';
  end if;

  select position into v_pos from homepage_sections where id = p_id;
  if v_pos is null then
    return;
  end if;

  if p_direction = -1 then
    select id, position into v_other_id, v_other_pos from homepage_sections
      where position < v_pos order by position desc limit 1;
  else
    select id, position into v_other_id, v_other_pos from homepage_sections
      where position > v_pos order by position asc limit 1;
  end if;
  if v_other_id is null then
    return;
  end if;

  update homepage_sections
    set position = case when id = p_id then v_other_pos else v_pos end
    where id in (p_id, v_other_id);
end;
$$;
