-- Member notifications (spec: docs/superpowers/specs/2026-11-13-member-alerts-design.md).
--
-- One row per notification per member told. Two kinds:
--   problem  -- opened and resolved by a check (closed-day conflicts, UTC
--               calendars): status 'open' or 'resolved'. Only one OPEN row
--               per dedupe_key; a problem that comes back after resolving is
--               a new row.
--   message  -- created once by notify() where something happens: status
--               'unread' or 'read'.
-- The type registry (TypeScript) supplies kind, recipient_roles, email_mode
-- and reminder_days for each insert, so a new type needs no new columns.
--
-- Quiet rule (spec, "Launch: start quietly"): while
-- member_notification_settings.emails_enabled is false, every new row is
-- stored quiet and is never emailed -- except rows for Sample members
-- (business_name like 'Sample %'), which are never quiet, so staging can test
-- the emails before launch.
--
-- Sample rule for the email claim (live vs. staging share this database): a
-- row's involved members are member_id plus details->>'other_member_id' when
-- present. A row is Sample-only when every involved member is Sample;
-- staging claims only those (p_sample_only = true) and the live site only the
-- rest, so no real member is ever emailed from staging and each email goes
-- out once.
--
-- Public pages hide events with an open closed-day conflict; visitors can't
-- read this table, so open_conflict_event_ids() hands out only those ids.
--
-- Additive and safe for the deployed code: new tables, new functions and two
-- nullable columns on calendar_connections. Emails start switched off.

create table public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  kind text not null check (kind in ('problem', 'message')),
  member_id uuid not null references public.members (id) on delete cascade,
  dedupe_key text,
  details jsonb not null default '{}'::jsonb,
  -- Also kept in details; a deleted event leaves the notification in place.
  event_id uuid references public.events (id) on delete set null,
  due_date date,
  recipient_roles text[] not null
    check (recipient_roles <@ array['owner', 'co_owner', 'editor', 'media_events']::text[]),
  email_mode text not null default 'batched' check (email_mode in ('batched', 'none')),
  reminder_days int check (reminder_days is null or reminder_days >= 0),
  status text not null check (status in ('open', 'resolved', 'unread', 'read')),
  quiet boolean not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  read_at timestamptz,
  notice_sent_at timestamptz,
  reminder_sent_at timestamptz,
  claimed_at timestamptz,
  attempts int not null default 0,
  last_error text,
  check ((kind = 'problem' and status in ('open', 'resolved'))
      or (kind = 'message' and status in ('unread', 'read'))),
  -- A problem without a key could open twice.
  check (kind = 'message' or dedupe_key is not null)
);

create unique index member_notifications_open_dedupe_key
  on public.member_notifications (dedupe_key) where status = 'open';
create index member_notifications_member_id_idx
  on public.member_notifications (member_id, created_at desc);
create index member_notifications_open_conflict_event_idx
  on public.member_notifications (event_id)
  where status = 'open' and type = 'closed_day_conflict';
create index member_notifications_unsent_idx
  on public.member_notifications (created_at)
  where notice_sent_at is null and not quiet;

alter table public.member_notifications enable row level security;
revoke all on public.member_notifications from anon, authenticated;
grant select on public.member_notifications to authenticated;

-- Read only; the service role writes, and marking read goes through
-- mark_member_notification_read().
create policy "member_notifications: the member's people read rows meant for their role"
  on public.member_notifications for select to authenticated
  using (public.member_role(member_id) = any (recipient_roles));
create policy "member_notifications: guild admins read every row"
  on public.member_notifications for select to authenticated
  using (public.is_guild_admin());

create table public.member_notification_settings (
  singleton boolean primary key default true check (singleton),
  emails_enabled boolean not null default false,
  paused boolean not null default false,
  launch_summary_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.member_notification_settings (singleton) values (true);
-- Service role only: RLS on, no policies.
alter table public.member_notification_settings enable row level security;
revoke all on public.member_notification_settings from anon, authenticated;

-- What the UTC-calendar check reads from each sync.
alter table public.calendar_connections
  add column if not exists feed_time_zone text,
  add column if not exists feed_has_timed_events boolean;

-- Is this member a Sample (test) member?
create or replace function public.member_notification_is_sample(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select m.business_name like 'Sample %' from public.members m where m.id = p_member_id), false);
$$;
revoke all on function public.member_notification_is_sample(uuid) from public, anon, authenticated;
grant execute on function public.member_notification_is_sample(uuid) to service_role;

-- Open new problems and resolve ones that are fixed, in one call from the
-- check. p_opens is a JSON array of rows: type, member_id, dedupe_key,
-- details, event_id, due_date, recipient_roles (array), email_mode,
-- reminder_days. An open that is already open does nothing; a resolve of a
-- row no longer open does nothing. Returns how many rows changed (opened +
-- resolved).
create or replace function public.apply_member_problems(p_opens jsonb, p_resolve_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_open jsonb;
  v_member uuid;
  v_n int;
  v_total int := 0;
begin
  select coalesce((select s.emails_enabled from public.member_notification_settings s), false) into v_enabled;

  for v_open in select * from jsonb_array_elements(coalesce(p_opens, '[]'::jsonb)) loop
    v_member := (v_open ->> 'member_id')::uuid;
    insert into public.member_notifications (
      type, kind, member_id, dedupe_key, details, event_id, due_date,
      recipient_roles, email_mode, reminder_days, status, quiet)
    values (
      v_open ->> 'type',
      'problem',
      v_member,
      v_open ->> 'dedupe_key',
      coalesce(v_open -> 'details', '{}'::jsonb),
      nullif(v_open ->> 'event_id', '')::uuid,
      nullif(v_open ->> 'due_date', '')::date,
      array(select jsonb_array_elements_text(v_open -> 'recipient_roles')),
      coalesce(v_open ->> 'email_mode', 'batched'),
      nullif(v_open ->> 'reminder_days', '')::int,
      'open',
      not v_enabled and not public.member_notification_is_sample(v_member))
    on conflict (dedupe_key) where status = 'open' do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  if p_resolve_ids is not null and cardinality(p_resolve_ids) > 0 then
    update public.member_notifications
       set status = 'resolved', resolved_at = now()
     where id = any (p_resolve_ids) and kind = 'problem' and status = 'open';
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;
revoke all on function public.apply_member_problems(jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_member_problems(jsonb, uuid[]) to service_role;

-- notify(): one message row, unread. p_row has the same keys as an open.
create or replace function public.insert_member_message(p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_member uuid := (p_row ->> 'member_id')::uuid;
  v_id uuid;
begin
  select coalesce((select s.emails_enabled from public.member_notification_settings s), false) into v_enabled;
  insert into public.member_notifications (
    type, kind, member_id, dedupe_key, details, event_id, due_date,
    recipient_roles, email_mode, reminder_days, status, quiet)
  values (
    p_row ->> 'type',
    'message',
    v_member,
    p_row ->> 'dedupe_key',
    coalesce(p_row -> 'details', '{}'::jsonb),
    nullif(p_row ->> 'event_id', '')::uuid,
    nullif(p_row ->> 'due_date', '')::date,
    array(select jsonb_array_elements_text(p_row -> 'recipient_roles')),
    coalesce(p_row ->> 'email_mode', 'batched'),
    nullif(p_row ->> 'reminder_days', '')::int,
    'unread',
    not v_enabled and not public.member_notification_is_sample(v_member))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.insert_member_message(jsonb) from public, anon, authenticated;
grant execute on function public.insert_member_message(jsonb) to service_role;

-- The sender's claim, like claim_guest_stop_notices: nothing while paused;
-- each claim counts an attempt; a claim older than 10 minutes can be taken
-- again; after 5 attempts a row is left alone; skip locked so two runs never
-- take the same row. send_kind says which email: 'notice' (new, not quiet)
-- or 'reminder' (an open problem inside its reminder window, in the member's
-- time zone, whose notice went out).
create or replace function public.claim_member_notification_emails(p_limit int, p_sample_only boolean)
returns table (
  id uuid,
  type text,
  kind text,
  member_id uuid,
  dedupe_key text,
  details jsonb,
  event_id uuid,
  due_date date,
  recipient_roles text[],
  email_mode text,
  reminder_days int,
  status text,
  quiet boolean,
  created_at timestamptz,
  resolved_at timestamptz,
  read_at timestamptz,
  notice_sent_at timestamptz,
  reminder_sent_at timestamptz,
  claimed_at timestamptz,
  attempts int,
  last_error text,
  send_kind text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with picked as (
    select n.id,
           case when n.notice_sent_at is null then 'notice' else 'reminder' end as send_kind
      from public.member_notifications n
      join public.members m on m.id = n.member_id
      -- A malformed id must not break every claim: it just counts as absent.
      left join public.members om
        on om.id = case when n.details ->> 'other_member_id'
                               ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (n.details ->> 'other_member_id')::uuid end
     where not exists (select 1 from public.member_notification_settings s where s.paused)
       and n.attempts < 5
       and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')
       and ((m.business_name like 'Sample %'
             and (om.id is null or om.business_name like 'Sample %')) = p_sample_only)
       and (
         (not n.quiet
          and n.email_mode = 'batched'
          and n.notice_sent_at is null
          and n.status in ('open', 'unread'))
         or
         (n.kind = 'problem'
          and n.status = 'open'
          and n.notice_sent_at is not null
          and n.reminder_sent_at is null
          and n.reminder_days is not null
          and n.due_date - n.reminder_days <= (now() at time zone m.timezone)::date
          and (now() at time zone m.timezone)::date <= n.due_date)
       )
     order by n.created_at
     limit p_limit
     for update of n skip locked
  )
  update public.member_notifications u
     set claimed_at = now(), attempts = u.attempts + 1
    from picked
   where u.id = picked.id
  returning u.id, u.type, u.kind, u.member_id, u.dedupe_key, u.details, u.event_id, u.due_date,
            u.recipient_roles, u.email_mode, u.reminder_days, u.status, u.quiet, u.created_at,
            u.resolved_at, u.read_at, u.notice_sent_at, u.reminder_sent_at, u.claimed_at,
            u.attempts, u.last_error, picked.send_kind;
$$;
revoke all on function public.claim_member_notification_emails(int, boolean) from public, anon, authenticated;
grant execute on function public.claim_member_notification_emails(int, boolean) to service_role;

-- Public pages: which of these events are hidden by an open closed-day
-- conflict. Returns those ids and nothing else.
create or replace function public.open_conflict_event_ids(p_event_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct n.event_id
    from public.member_notifications n
   where n.event_id = any (p_event_ids)
     and n.type = 'closed_day_conflict'
     and n.status = 'open';
$$;
revoke all on function public.open_conflict_event_ids(uuid[]) from public;
grant execute on function public.open_conflict_event_ids(uuid[]) to anon, authenticated, service_role;

-- A member's people (role in the row's recipient_roles) or a Guild admin
-- mark a message read. Problems resolve only through their check.
create or replace function public.mark_member_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.member_notifications%rowtype;
begin
  select * into v_row from public.member_notifications where id = p_id;
  if not found
     or not (public.is_guild_admin()
             or coalesce(public.member_role(v_row.member_id) = any (v_row.recipient_roles), false)) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if v_row.kind <> 'message' then
    raise exception 'Only messages can be marked read.' using errcode = '22023';
  end if;
  update public.member_notifications
     set status = 'read', read_at = now()
   where id = p_id and status = 'unread';
end;
$$;
revoke all on function public.mark_member_notification_read(uuid) from public, anon;
grant execute on function public.mark_member_notification_read(uuid) to authenticated, service_role;
