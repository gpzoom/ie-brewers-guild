-- Requests from a member to the Guild (spec, "Member type: confirm once,
-- then locked" and "Data model additions"). Only 'type_change' for now: a
-- confirmed type is locked on the member's side, so the portal's "Request a
-- type change" lands here and the Guild admin makes the change from the
-- roster.
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('type_change')),
  requested_member_type text check (requested_member_type in ('producer', 'mobile', 'allied')),
  note text,
  status text not null default 'open' check (status in ('open', 'handled')),
  handled_by_user_id uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A type-change request without a requested type gives the Guild nothing
  -- to act on.
  constraint support_requests_type_change_has_type
    check (kind <> 'type_change' or requested_member_type is not null)
);

create index support_requests_member_id_idx on public.support_requests (member_id);
create index support_requests_status_idx on public.support_requests (status);
create index support_requests_requested_by_user_id_idx on public.support_requests (requested_by_user_id);
create index support_requests_handled_by_user_id_idx on public.support_requests (handled_by_user_id);

create trigger set_updated_at before update on public.support_requests
  for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;

-- Owner and full editor only: the Photos & events editor has no "Request a
-- type change" (spec, "People and permissions"). A member's insert must be
-- attributed to themselves and arrive open/unhandled, so nobody can file a
-- request in someone else's name or pre-mark it handled.
create policy "support_requests: owners and editors can read their own"
  on public.support_requests for select to authenticated
  using (coalesce(public.member_role(member_id) in ('owner', 'editor'), false));
create policy "support_requests: owners and editors can insert their own"
  on public.support_requests for insert to authenticated
  with check (
    coalesce(public.member_role(member_id) in ('owner', 'editor'), false)
    and requested_by_user_id = auth.uid()
    and status = 'open'
    and handled_by_user_id is null
    and handled_at is null
  );
create policy "support_requests: guild admins can manage every row"
  on public.support_requests for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

revoke all on public.support_requests from anon;
