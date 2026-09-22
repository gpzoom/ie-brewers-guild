create table public.member_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in (
    'website', 'instagram', 'facebook', 'tiktok', 'taplist', 'menu', 'press_kit', 'catalog', 'other'
  )),
  label text,
  url text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_links_member_id_idx on public.member_links (member_id);

create table public.hours (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hours_member_id_weekday_idx on public.hours (member_id, weekday);

create table public.special_hours (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  date date not null,
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index special_hours_member_id_date_idx on public.special_hours (member_id, date);

-- Same three-policy shape (public-if-parent-published, owner-all,
-- guild-admin-all) repeats for every remaining member-scoped child table.
alter table public.member_links enable row level security;

create policy "member_links: public can read links of published members"
  on public.member_links for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = member_links.member_id and m.status = 'published'));
create policy "member_links: owners and editors can read their own"
  on public.member_links for select to authenticated using (public.is_member_editor(member_id));
create policy "member_links: guild admins can read every row"
  on public.member_links for select to authenticated using (public.is_guild_admin());
create policy "member_links: owners and editors can manage their own"
  on public.member_links for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "member_links: guild admins can manage every row"
  on public.member_links for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.hours enable row level security;

create policy "hours: public can read hours of published members"
  on public.hours for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = hours.member_id and m.status = 'published'));
create policy "hours: owners and editors can read their own"
  on public.hours for select to authenticated using (public.is_member_editor(member_id));
create policy "hours: guild admins can read every row"
  on public.hours for select to authenticated using (public.is_guild_admin());
create policy "hours: owners and editors can manage their own"
  on public.hours for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "hours: guild admins can manage every row"
  on public.hours for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.special_hours enable row level security;

create policy "special_hours: public can read special hours of published members"
  on public.special_hours for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = special_hours.member_id and m.status = 'published'));
create policy "special_hours: owners and editors can read their own"
  on public.special_hours for select to authenticated using (public.is_member_editor(member_id));
create policy "special_hours: guild admins can read every row"
  on public.special_hours for select to authenticated using (public.is_guild_admin());
create policy "special_hours: owners and editors can manage their own"
  on public.special_hours for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "special_hours: guild admins can manage every row"
  on public.special_hours for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
