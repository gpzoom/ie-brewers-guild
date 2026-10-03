create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  provider text not null check (provider in ('google', 'ics')),
  -- Holds a Supabase Vault secret reference once the OAuth flow exists
  -- (spec: "store in Supabase Vault, not plaintext"), not the raw token.
  -- Vault wiring is implemented in the Member Admin (Events) plan.
  google_refresh_token text,
  google_calendar_id text,
  ics_url text,
  sync_tag text,
  last_synced_at timestamptz,
  last_sync_error text,
  sync_status text not null default 'ok' check (sync_status in ('ok', 'failing', 'disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_connections_member_id_idx on public.calendar_connections (member_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  calendar_connection_id uuid references public.calendar_connections (id) on delete cascade,
  source text not null check (source in ('google', 'ics', 'manual')),
  external_event_id text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text,
  city text,
  address text,
  overlay_status text check (overlay_status in ('postponed', 'rescheduled', 'canceled')),
  overlay_starts_at timestamptz,
  overlay_note text,
  overlay_set_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_connection_id, external_event_id)
);

create index events_member_id_starts_at_idx on public.events (member_id, starts_at);

alter table public.calendar_connections enable row level security;

-- No public select at all (spec, "Row level security") -- only owners/
-- editors and guild admins, ever.
create policy "calendar_connections: owners and editors can read their own"
  on public.calendar_connections for select to authenticated using (public.is_member_editor(member_id));
create policy "calendar_connections: guild admins can read every row"
  on public.calendar_connections for select to authenticated using (public.is_guild_admin());
create policy "calendar_connections: owners and editors can manage their own"
  on public.calendar_connections for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "calendar_connections: guild admins can manage every row"
  on public.calendar_connections for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.events enable row level security;

create policy "events: public can read events of published members"
  on public.events for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = events.member_id and m.status = 'published'));
create policy "events: owners and editors can read their own"
  on public.events for select to authenticated using (public.is_member_editor(member_id));
create policy "events: guild admins can read every row"
  on public.events for select to authenticated using (public.is_guild_admin());
create policy "events: owners and editors can manage their own"
  on public.events for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "events: guild admins can manage every row"
  on public.events for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
