-- profiles: platform role, keyed to auth.users. Only is_guild_admin lives
-- here for now — member-editor role lives on member_users instead (spec,
-- "Roles"). A Guild admin is not automatically a member editor.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_guild_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security definer: profiles' own RLS only lets a user read their own row,
-- so every other table's RLS policy needs a way to check guild-admin status
-- that isn't itself blocked by that same restriction.
create or replace function public.is_guild_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_guild_admin
  );
$$;

create policy "profiles: users can read their own row"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: guild admins can read every row"
  on public.profiles for select
  to authenticated
  using (public.is_guild_admin());
