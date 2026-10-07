-- Guild Mobile members at taprooms, Part 2
-- (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-part-2-design.md):
-- "Ask me first", the pending/declined statuses, what was last told to the
-- taproom (so the linker can spot changes), the notes queue the 15-minute
-- job sends from, and the trigger that leaves a note when a link disappears.

-- The setting. Members can't write `members` directly (20260925210100); it
-- goes through set_guest_stops_mode below.
alter table public.members add column guest_stops_mode text not null default 'show'
  check (guest_stops_mode in ('show', 'ask'));
grant select (guest_stops_mode) on public.members to authenticated;

alter table public.event_hosts drop constraint event_hosts_status_check;
alter table public.event_hosts add constraint event_hosts_status_check
  check (status in ('shown', 'hidden', 'pending', 'declined'));
alter table public.event_hosts
  add column guest_name text,
  add column title text,
  add column notified_starts_at timestamptz,
  add column notified_ends_at timestamptz,
  add column notified_all_day boolean not null default false,
  add column cancel_notified boolean not null default false;

create table public.guest_stop_notices (
  id uuid primary key default gen_random_uuid(),
  host_member_id uuid not null references public.members (id) on delete cascade,
  event_id uuid,
  kind text not null check (kind in ('new', 'request', 'changed', 'canceled')),
  guest_name text not null,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  old_starts_at timestamptz,
  old_ends_at timestamptz,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index guest_stop_notices_unsent_idx on public.guest_stop_notices (created_at) where sent_at is null;
-- Service role only: RLS on, no policies.
alter table public.guest_stop_notices enable row level security;
revoke all on public.guest_stop_notices from anon, authenticated;

create or replace function public.set_guest_stops_mode(p_member_id uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
begin
  if p_mode not in ('show', 'ask') then
    raise exception 'unknown mode %', p_mode using errcode = '22023';
  end if;
  if not public.is_member_full_editor(p_member_id) then
    raise exception 'Only the owner or a full editor can change this.' using errcode = '42501';
  end if;
  select member_type into v_type from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_type <> 'producer' then
    raise exception 'Only producers host Guild members.' using errcode = '22023';
  end if;
  update public.members set guest_stops_mode = p_mode where id = p_member_id;
  -- Waiting visits were waiting only because of Ask me first.
  if p_mode = 'show' then
    update public.event_hosts
       set status = 'shown', status_set_by_user_id = auth.uid(), updated_at = now()
     where host_member_id = p_member_id and status = 'pending';
  end if;
  return p_mode;
end;
$$;
revoke execute on function public.set_guest_stops_mode(uuid, text) from public, anon;
grant execute on function public.set_guest_stops_mode(uuid, text) to authenticated;

-- People may show, hide or decline; only the linker sets pending.
create or replace function public.set_event_host_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host uuid;
begin
  if p_status not in ('shown', 'hidden', 'declined') then
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
revoke all on function public.set_event_host_status(uuid, text) from public, anon;
grant execute on function public.set_event_host_status(uuid, text) to authenticated;

-- A link that disappears (the stop was deleted, or the linker found it's no
-- longer at a Guild taproom) while the taproom could see it or was asked
-- about it, and still upcoming: tell the taproom it's canceled, once.
create or replace function public.event_hosts_note_removed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('shown', 'pending')
     and not old.cancel_notified
     and old.guest_name is not null
     and old.notified_starts_at is not null
     and coalesce(old.notified_ends_at, old.notified_starts_at + interval '2 hours') > now()
     and exists (select 1 from public.members m where m.id = old.host_member_id)
  then
    insert into public.guest_stop_notices
      (host_member_id, event_id, kind, guest_name, title, starts_at, ends_at, all_day)
    values
      (old.host_member_id, old.event_id, 'canceled', old.guest_name, old.title,
       old.notified_starts_at, old.notified_ends_at, old.notified_all_day);
  end if;
  return old;
end;
$$;
create trigger event_hosts_note_removed
  after delete on public.event_hosts
  for each row execute function public.event_hosts_note_removed();

-- The 15-minute job's claim: unsent notes not claimed in the last 10 minutes
-- (a crashed send is retried), under 5 attempts -- each claim counts one. `for update skip locked`, so
-- two Workers running at once never take the same note. p_sample_only:
-- staging (true) takes only the Sample test taprooms; the live site (false)
-- takes everything else.
create or replace function public.claim_guest_stop_notices(p_limit int, p_sample_only boolean)
returns setof public.guest_stop_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.guest_stop_notices n
     set claimed_at = now(), attempts = n.attempts + 1
   where n.id in (
     select g.id
       from public.guest_stop_notices g
       join public.members m on m.id = g.host_member_id
      where g.sent_at is null
        and g.attempts < 5
        and (g.claimed_at is null or g.claimed_at < now() - interval '10 minutes')
        and ((m.business_name like 'Sample %') = p_sample_only)
      order by g.created_at
      limit p_limit
      for update of g skip locked
   )
  returning n.*;
end;
$$;
revoke all on function public.claim_guest_stop_notices(int, boolean) from public, anon, authenticated;
grant execute on function public.claim_guest_stop_notices(int, boolean) to service_role;

-- The linker's writes (src/lib/events/guest-links.ts decides,
-- guest-links.server.ts calls this). Each write says what it expects to find
-- -- no row for a new link; otherwise the taproom, status and what was last
-- told -- and applies only if the row is still like that. So two Workers
-- running at once, or a taproom's Approve/Decline/Hide landing between the
-- linker's read and its write, can neither double an email nor undo a
-- choice: the write that lost simply doesn't happen, and the next run
-- looks again. A write's email notes are queued only when the write took
-- effect, in the same transaction. Same-taproom writes never touch status.
create or replace function public.apply_guest_links(p_writes jsonb, p_deletes jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w jsonb;
  l jsonb;
  e jsonb;
  n jsonb;
  d jsonb;
  v_done boolean;
  v_notes integer := 0;
begin
  for w in select * from jsonb_array_elements(coalesce(p_writes, '[]'::jsonb))
  loop
    l := w->'link';
    e := w->'expect';
    if e is null or jsonb_typeof(e) = 'null' then
      insert into public.event_hosts
        (event_id, host_member_id, status, guest_name, title, notified_starts_at, notified_ends_at, notified_all_day, cancel_notified)
      values
        ((l->>'event_id')::uuid, (l->>'host_member_id')::uuid, l->>'status', l->>'guest_name', l->>'title',
         (l->>'notified_starts_at')::timestamptz, (l->>'notified_ends_at')::timestamptz,
         coalesce((l->>'notified_all_day')::boolean, false), coalesce((l->>'cancel_notified')::boolean, false))
      on conflict (event_id) do nothing;
      v_done := found;
    else
      update public.event_hosts h
         set host_member_id = (l->>'host_member_id')::uuid,
             -- A move starts fresh under the new taproom's setting; the same
             -- taproom keeps whatever status it has now.
             status = case when (e->>'host_member_id') = (l->>'host_member_id') then h.status else l->>'status' end,
             status_set_by_user_id = case when (e->>'host_member_id') = (l->>'host_member_id') then h.status_set_by_user_id else null end,
             guest_name = l->>'guest_name',
             title = l->>'title',
             notified_starts_at = (l->>'notified_starts_at')::timestamptz,
             notified_ends_at = (l->>'notified_ends_at')::timestamptz,
             notified_all_day = coalesce((l->>'notified_all_day')::boolean, false),
             cancel_notified = coalesce((l->>'cancel_notified')::boolean, false),
             updated_at = now()
       where h.event_id = (l->>'event_id')::uuid
         and h.host_member_id = (e->>'host_member_id')::uuid
         and h.status = e->>'status'
         and h.notified_starts_at is not distinct from (e->>'notified_starts_at')::timestamptz
         and h.notified_ends_at is not distinct from (e->>'notified_ends_at')::timestamptz
         and h.cancel_notified = coalesce((e->>'cancel_notified')::boolean, false);
      v_done := found;
    end if;

    if v_done then
      for n in select * from jsonb_array_elements(coalesce(w->'notices', '[]'::jsonb))
      loop
        insert into public.guest_stop_notices
          (host_member_id, event_id, kind, guest_name, title, starts_at, ends_at, all_day, old_starts_at, old_ends_at)
        values
          ((n->>'host_member_id')::uuid, (n->>'event_id')::uuid, n->>'kind', n->>'guest_name', n->>'title',
           (n->>'starts_at')::timestamptz, (n->>'ends_at')::timestamptz, coalesce((n->>'all_day')::boolean, false),
           (n->>'old_starts_at')::timestamptz, (n->>'old_ends_at')::timestamptz);
        v_notes := v_notes + 1;
      end loop;
    end if;
  end loop;

  -- No longer at a Guild taproom: only if it's still at the one the linker saw.
  -- The delete trigger above queues the taproom's Canceled note.
  for d in select * from jsonb_array_elements(coalesce(p_deletes, '[]'::jsonb))
  loop
    delete from public.event_hosts
     where event_id = (d->>'event_id')::uuid and host_member_id = (d->>'host_member_id')::uuid;
  end loop;

  return v_notes;
end;
$$;
revoke all on function public.apply_guest_links(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_guest_links(jsonb, jsonb) to service_role;
