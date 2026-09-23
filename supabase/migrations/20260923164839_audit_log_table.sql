create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users (id),
  member_id uuid references public.members (id),
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('insert', 'update', 'delete'))
);

create index audit_log_member_id_idx on public.audit_log (member_id);
create index audit_log_actor_user_id_idx on public.audit_log (actor_user_id);

alter table public.audit_log enable row level security;

create policy "audit_log: guild admins can read every row"
  on public.audit_log for select
  to authenticated
  using (public.is_guild_admin());

-- The insert policy requires actor_user_id to literally equal auth.uid(),
-- as a second, DB-level guarantee (beyond the application-layer wrapper
-- always passing the real signed-in user's id) that no row can ever be
-- logged against a fabricated actor.
create policy "audit_log: guild admins can insert rows attributed to themselves"
  on public.audit_log for insert
  to authenticated
  with check (public.is_guild_admin() and actor_user_id = auth.uid());
