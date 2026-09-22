create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  token_hash text not null,
  created_by_user_id uuid not null references auth.users (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_files smallint not null default 5,
  used_count smallint not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index upload_tokens_member_id_idx on public.upload_tokens (member_id);

alter table public.media_assets
  add constraint media_assets_upload_token_id_fkey
    foreign key (upload_token_id) references public.upload_tokens (id) on delete set null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_categories (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, category_id)
);

create index member_categories_member_id_idx on public.member_categories (member_id);

alter table public.upload_tokens enable row level security;

-- No public select at all -- the creator-upload Worker route validates
-- tokens with the service key, which bypasses RLS entirely.
create policy "upload_tokens: owners and editors can read their own"
  on public.upload_tokens for select to authenticated using (public.is_member_editor(member_id));
create policy "upload_tokens: guild admins can read every row"
  on public.upload_tokens for select to authenticated using (public.is_guild_admin());
create policy "upload_tokens: owners and editors can manage their own"
  on public.upload_tokens for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "upload_tokens: guild admins can manage every row"
  on public.upload_tokens for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.categories enable row level security;

-- Categories are a shared, curated taxonomy (artboard S is a Guild admin
-- screen) -- everyone reads, only Guild admins write.
create policy "categories: anyone can read"
  on public.categories for select to anon, authenticated using (true);
create policy "categories: guild admins can manage"
  on public.categories for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.member_categories enable row level security;

create policy "member_categories: public can read categories of published members"
  on public.member_categories for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = member_categories.member_id and m.status = 'published'));
create policy "member_categories: owners and editors can read their own"
  on public.member_categories for select to authenticated using (public.is_member_editor(member_id));
create policy "member_categories: guild admins can read every row"
  on public.member_categories for select to authenticated using (public.is_guild_admin());
create policy "member_categories: owners and editors can manage their own"
  on public.member_categories for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "member_categories: guild admins can manage every row"
  on public.member_categories for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
