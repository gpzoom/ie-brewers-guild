create table public.brand_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  font_pairing text not null,
  tokens jsonb not null,
  updated_by_user_id uuid references auth.users (id)
);

-- Enforces "one row holding the current brand JSON" (task brief) at the DB
-- layer: a unique index on a constant expression permits at most one row
-- in the whole table, regardless of application-code discipline.
create unique index brand_settings_singleton_idx on public.brand_settings ((true));

alter table public.brand_settings enable row level security;

-- Guild-admin-only, no public access at all -- only server-rendered pages
-- read this row, via the service-role client (task brief: "public no
-- access since only server-rendered pages read it, not the browser
-- directly").
create policy "brand_settings: guild admins can read"
  on public.brand_settings for select
  to authenticated
  using (public.is_guild_admin());

create policy "brand_settings: guild admins can manage"
  on public.brand_settings for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
