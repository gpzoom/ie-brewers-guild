-- Guild Mobile members at taprooms, Part 1
-- (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md).
-- One row per Mobile member's stop that is at a Guild producer's taproom.
-- Written only by the service role (the linker, src/lib/events/guest-links.server.ts).
-- The host's people flip shown/hidden through set_event_host_status.
-- Part 2 will add 'pending' and 'declined'.
create table public.event_hosts (
  event_id uuid primary key references public.events (id) on delete cascade,
  host_member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'shown' check (status in ('shown', 'hidden')),
  status_set_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_hosts_host_idx on public.event_hosts (host_member_id);

alter table public.event_hosts enable row level security;

-- Visitors: shown links of a published host, to an event they can read
-- themselves (the events policy: a published member's event).
create policy "event_hosts: public reads shown links of published hosts"
  on public.event_hosts for select
  using (
    status = 'shown'
    and exists (select 1 from public.members m where m.id = host_member_id and m.status = 'published')
    and exists (select 1 from public.events e where e.id = event_id)
  );

create policy "event_hosts: the host's people read all of theirs"
  on public.event_hosts for select
  using (exists (
    select 1 from public.member_users mu
    where mu.member_id = host_member_id and mu.user_id = auth.uid()
  ));

create policy "event_hosts: guild admins read every row"
  on public.event_hosts for select
  using (public.is_guild_admin());

revoke insert, update, delete on public.event_hosts from anon, authenticated;

create or replace function public.set_event_host_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host uuid;
begin
  if p_status not in ('shown', 'hidden') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;
  select host_member_id into v_host from public.event_hosts where event_id = p_event_id;
  if v_host is null then
    raise exception 'no such link' using errcode = 'P0002';
  end if;
  if not (
    public.is_guild_admin()
    or exists (select 1 from public.member_users mu where mu.member_id = v_host and mu.user_id = auth.uid())
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.event_hosts
     set status = p_status, status_set_by_user_id = auth.uid(), updated_at = now()
   where event_id = p_event_id;
end;
$$;

revoke all on function public.set_event_host_status(uuid, text) from public;
grant execute on function public.set_event_host_status(uuid, text) to authenticated;
