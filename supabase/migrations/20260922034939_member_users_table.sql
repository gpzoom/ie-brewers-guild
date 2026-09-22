create table public.member_users (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, user_id)
);

create index member_users_user_id_idx on public.member_users (user_id);

create or replace function public.is_member_editor(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_users mu
    where mu.member_id = target_member_id and mu.user_id = auth.uid()
  );
$$;

alter table public.member_users enable row level security;

create policy "member_users: users can read their own links"
  on public.member_users for select
  to authenticated
  using (user_id = auth.uid());

create policy "member_users: guild admins can read every row"
  on public.member_users for select
  to authenticated
  using (public.is_guild_admin());

create policy "member_users: guild admins can manage every row"
  on public.member_users for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());

-- Now that is_member_editor() exists, add the owner-visibility policies
-- the "Decisions made while filling gaps" note above calls for.
create policy "members: owners and editors can read their own row"
  on public.members for select
  to authenticated
  using (public.is_member_editor(id));

create policy "members: owners and editors can update their own row"
  on public.members for update
  to authenticated
  using (public.is_member_editor(id))
  with check (public.is_member_editor(id));
