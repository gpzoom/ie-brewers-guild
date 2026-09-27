-- Site settings (docs/member-profiles.md, "Super admin" > "Settings"):
-- one row of site-wide switches only the super admin changes. The first
-- is how often members' calendars are re-synced automatically.
--
-- The Worker's cron still fires every 15 minutes; each run reads
-- calendar_sync_interval_minutes and only syncs when that much time has
-- passed since calendar_sync_last_run_at (0 = automatic sync off; members'
-- "Refresh now" still works). Staging and production share this database,
-- so the shared "last run" also keeps the two Workers from both syncing
-- every calendar on the same tick.
create table public.site_settings (
  id boolean primary key default true check (id),
  calendar_sync_interval_minutes integer not null default 15
    check (calendar_sync_interval_minutes in (0, 15, 30, 60, 180, 360, 720, 1440)),
  calendar_sync_last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users (id) on delete set null
);

insert into public.site_settings (id) values (true);

alter table public.site_settings enable row level security;

create policy "site_settings: super admins can read"
  on public.site_settings for select
  to authenticated
  using (public.is_super_admin());

create policy "site_settings: super admins can update"
  on public.site_settings for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- No insert or delete for anyone through the API: there is exactly one row.
revoke insert, delete on public.site_settings from anon, authenticated;
