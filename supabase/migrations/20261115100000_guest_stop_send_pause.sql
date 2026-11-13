-- A pause switch for the taprooms' Guild member visit emails (owner,
-- 2026-11-13: no bug-fixing activity may email real members).
--
-- Staging and the live site share this database and both run the 15-minute
-- job, which links stops and then sends the queued notes in the same run. A
-- fix to the linking rule therefore queues and sends "new visit" notes the
-- moment either site runs it. While paused, claim_guest_stop_notices hands
-- out nothing: notes wait in the queue (nothing is lost), so the ones a fix
-- caused can be marked done by hand before the switch is turned back off.
--
-- Additive and safe for the deployed code: the claim function keeps its
-- signature, and the switch starts off.

create table public.guest_stop_send_pause (
  singleton boolean primary key default true check (singleton),
  paused boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);
insert into public.guest_stop_send_pause (singleton, paused) values (true, false);
-- Service role only: RLS on, no policies.
alter table public.guest_stop_send_pause enable row level security;
revoke all on public.guest_stop_send_pause from anon, authenticated;

create or replace function public.claim_guest_stop_notices(p_limit int, p_sample_only boolean)
returns setof public.guest_stop_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.guest_stop_send_pause where paused) then
    return;
  end if;
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
