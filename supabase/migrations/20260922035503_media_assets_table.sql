create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  byte_size bigint not null,
  width int,
  height int,
  duration_ms int,
  original_filename text,
  source text not null check (source in ('member_upload', 'creator_upload')),
  uploaded_by_user_id uuid references auth.users (id),
  upload_token_id uuid, -- FK added in Task 9, once upload_tokens exists
  creator_name text,
  creator_credit boolean not null default false,
  permission_accepted_at timestamptz,
  review_status text not null default 'approved'
    check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_member_id_idx on public.media_assets (member_id);

-- Deferred FK from Task 3: both tables now exist.
alter table public.members
  add constraint members_logo_asset_id_fkey
    foreign key (logo_asset_id) references public.media_assets (id) on delete set null,
  add constraint members_cover_asset_id_fkey
    foreign key (cover_asset_id) references public.media_assets (id) on delete set null;

alter table public.media_assets enable row level security;

-- Public select: approved AND referenced by a published slide, logo, or
-- cover (spec, "Row level security"). carousel_slides doesn't exist until
-- Task 6, so this policy is created there instead, once it can reference it.

create policy "media_assets: owners and editors can read all their own rows"
  on public.media_assets for select
  to authenticated
  using (public.is_member_editor(member_id));

create policy "media_assets: guild admins can read every row"
  on public.media_assets for select
  to authenticated
  using (public.is_guild_admin());

create policy "media_assets: owners and editors can insert"
  on public.media_assets for insert
  to authenticated
  with check (public.is_member_editor(member_id));

create policy "media_assets: owners and editors can update their own rows"
  on public.media_assets for update
  to authenticated
  using (public.is_member_editor(member_id))
  with check (public.is_member_editor(member_id));

create policy "media_assets: owners and editors can delete their own rows"
  on public.media_assets for delete
  to authenticated
  using (public.is_member_editor(member_id));

create policy "media_assets: guild admins can manage every row"
  on public.media_assets for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
