# Guild Mobile Members at Taprooms (Part 2: "Ask me first" and emails) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A taproom can choose "Show them on my page right away" (default) or "Ask me first" for Guild Mobile members' stops, and its owner and full editors get batched emails for new, changed and canceled visits, with Approve / Decline / Hide buttons that work without signing in.

**Architecture:**
- **Database.** `event_hosts` gains the `pending` and `declined` statuses plus a snapshot of what was last told (guest name, title, times, cancel flag).
- **The setting.** `members.guest_stops_mode` (`show` or `ask`), changed through a SECURITY DEFINER function.
- **The linker.** Still pure plus a thin I/O wrapper. It now also decides the status for each taproom's mode and writes "to send" notes into `guest_stop_notices`. A database trigger writes the note when a link disappears.
- **Sending.** The 15-minute job claims notes atomically (`for update skip locked`), groups them per taproom, and sends one email per taproom through Resend. The live site skips the Sample test members; staging sends only those, to the test inbox.
- **The email buttons** open `/visit/$token`, a two-step page with a signed token. Opening the page never changes anything; only its button does.

**Tech Stack:** TanStack Start (React 19), Cloudflare Workers (cron), Supabase Postgres + RLS (pgTAP), Resend (HTTP API), Vitest (node env, `src/**/*.test.ts`; components via `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-part-2-design.md`. Part 1: `docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md`. Artboards: GV2 `GuildVendorEmails`, GV1 `GuildVendorFood` (updated in Task 9).

## Global Constraints

- Work on `staging` only. Never merge to `main` without the owner's "go".
- The database is shared with production. **Before `npx supabase db push`, stop and ask the owner.**
- **Never print secrets.** `GUEST_STOP_LINK_SECRET` is set by the owner in Cloudflare (both Workers), with step-by-step instructions; its value never appears in chat.
- **Default mode:** `show`. **Recipients:** `member_users.role in ('owner','editor')`.
- **Only `shown` or `pending` links send email.** Only upcoming visits: the effective end is in the future and the start is within `GUEST_LINK_DAYS = 60`.
- **Staging test mail:** a taproom whose `business_name` starts with `"Sample "`. Test inbox: `STAGING_GUILD_NOTIFICATION_EMAIL` = `boblelle77+iscadmin@gmail.com`.
- **Copy, US spelling, verbatim from the spec:**
  - "Show them on my page right away"
  - "Ask me first"
  - "Waiting for approval"
  - "Declined"
  - "On your page" / "Hidden from your page"
  - "Approve" / "Decline" / "Hide this visit" / "See your page"
  - "Approve this visit" / "Decline this visit" / "Hide it from my page"
  - "Approved. It's on your page now." / "Declined. It won't show on your page." / "Hidden. It's off your page."
  - "Changed your mind? Your Events page has every visit."
  - "This visit is no longer at your taproom."
  - "Nothing shows on your page until you approve."
  - "It's on your page now."
  - "Your page already shows the new date."
  - "It's still waiting for your approval."
  - "It's off your page."
- **Audit:** every Guild-admin change through Edit as them is audited (`recordAuditLogIfImpersonating`). Email-button actions are not (nobody is signed in).
- **New `*.server.ts` called from client code** goes in `vite.config.ts` `excludeFiles`. Service-role helpers are imported only inside handlers, or by `src/server.ts`.
- **Tests:**
  - `npm run test`, `npm run test:db`, `npm run build`;
  - `npx tsc --noEmit` has exactly 1 known error (`survey.tsx`);
  - the RPC check: every 64-hex id in `dist/client` is found in `dist/server`, missing 0.

## Review Focus

1. **A stop moved from taproom A to taproom B.** A gets a "Canceled" email (the row is replaced, not deleted, so no trigger fires). B gets "new" or "request" under B's mode. (Test in Task 2.)
2. **Both Workers' crons running at once.** No note is claimed twice, and staging never sends a real taproom's note. (pgTAP in Task 1; the filter in Task 5.)
3. **A visit changed and then canceled within one 15-minute run.** Only the "Canceled" entry is in the email. (Test in Task 4.)
4. **An email button opened by a scanner.** Nothing changes until the button is pressed. A token for a visit that moved to another taproom does nothing. (Tests in Task 6.)
5. **Switching "Ask me first" → "Show right away" with visits waiting.** They become shown, and no second email goes out for them. (pgTAP in Task 1; the linker test "same host keeps status, no email" in Task 2.)

---

### Task 1: Database — statuses, the setting, the notes queue, the delete trigger, the claim

**Files:**
- Create: `supabase/migrations/20261008100000_guest_stops_part2.sql`
- Create: `supabase/tests/guest_stops_part2.test.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces:
  - `members.guest_stops_mode text` (`'show'|'ask'`, default `'show'`)
  - `event_hosts` new columns: `guest_name text`, `title text`, `notified_starts_at timestamptz`, `notified_ends_at timestamptz`, `notified_all_day boolean not null default false`, `cancel_notified boolean not null default false`; status check widened to `('shown','hidden','pending','declined')`
  - `guest_stop_notices(id uuid pk, host_member_id uuid, event_id uuid null, kind text check in ('new','request','changed','canceled'), guest_name text, title text, starts_at timestamptz, ends_at timestamptz, all_day boolean, old_starts_at timestamptz, old_ends_at timestamptz, created_at, claimed_at, sent_at, attempts int default 0, last_error text)`
  - `set_guest_stops_mode(p_member_id uuid, p_mode text) returns text`
  - `set_event_host_status(p_event_id uuid, p_status text)` now accepts `shown|hidden|declined`
  - `claim_guest_stop_notices(p_limit int, p_sample_only boolean) returns setof guest_stop_notices` (service role only)
  - TS types: `EventHostStatus = "shown" | "hidden" | "pending" | "declined"`, `GuestStopsMode = "show" | "ask"`, `GuestStopNoticeKind`, `GuestStopNoticeRow`

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/guest_stops_part2.test.sql` (fixtures: m1 published producer `PgTap Brewing` with f0..01 owner, f0..02 editor, f0..03 media_events; m4 published mobile; f0..04 Guild admin; f0..06 stranger):

```sql
-- Guild Mobile members at taprooms, Part 2 (20261008100000_guest_stops_part2.sql):
-- Ask me first, the pending/declined statuses, the notes queue, its delete
-- trigger and the claim. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(17);

insert into _tap (line) select has_column('public', 'members', 'guest_stops_mode', 'members.guest_stops_mode exists');
insert into _tap (line) select is(
  (select guest_stops_mode from public.members where id = 'f1000000-0000-4000-8000-000000000001'), 'show', 'default is show');

insert into public.events (id, member_id, source, kind, title, starts_at, ends_at, venue_name) values
  ('f3000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Tacos', now() + interval '1 day', now() + interval '1 day 3 hours', 'PgTap Brewing'),
  ('f3000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'More tacos', now() + interval '2 days', null, 'PgTap Brewing'),
  ('f3000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Old tacos', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'PgTap Brewing');
insert into public.event_hosts (event_id, host_member_id, status, guest_name, title, notified_starts_at, notified_ends_at) values
  ('f3000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000001', 'pending', 'Rolling Taps', 'Tacos', now() + interval '1 day', now() + interval '1 day 3 hours'),
  ('f3000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000001', 'hidden', 'Rolling Taps', 'More tacos', now() + interval '2 days', null),
  ('f3000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000001', 'shown', 'Rolling Taps', 'Old tacos', now() - interval '3 days', now() - interval '3 days' + interval '2 hours');

-- The setting: owner and full editor yes; Photos & events editor and strangers no.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'ask') $q$,
  '42501', null, 'a Photos & events editor can''t change the setting');
insert into _tap (line) select lives_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000022', 'declined') $q$,
  'a Photos & events editor can decline a visit');
insert into _tap (line) select throws_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000022', 'pending') $q$,
  '22023', null, 'people can''t set pending');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'ask') $q$,
  '42501', null, 'a stranger can''t change the setting');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select is(
  public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'ask'), 'ask', 'a full editor turns on Ask me first');
insert into _tap (line) select throws_ok(
  $q$ select public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'maybe') $q$,
  '22023', null, 'an unknown mode is refused');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is(
  public.set_guest_stops_mode('f1000000-0000-4000-8000-000000000001', 'show'), 'show', 'the owner switches back to Show right away');
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000021'), 'shown',
  'switching to show turns waiting visits into shown');
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000022'), 'declined',
  'a declined visit stays declined');
insert into _tap (line) select throws_ok(
  $q$ select count(*) from public.guest_stop_notices $q$,
  '42501', null, 'members can''t read the notes queue');
reset role;

-- The delete trigger: an upcoming shown link that disappears leaves a canceled note; a past or declined one doesn't.
delete from public.events where id in (
  'f3000000-0000-4000-8000-000000000021', 'f3000000-0000-4000-8000-000000000022', 'f3000000-0000-4000-8000-000000000023');
insert into _tap (line) select is(
  (select count(*)::int from public.guest_stop_notices where kind = 'canceled'), 1, 'one canceled note: the upcoming shown visit');
insert into _tap (line) select is(
  (select guest_name || ' / ' || title from public.guest_stop_notices where kind = 'canceled'), 'Rolling Taps / Tacos',
  'the note carries the snapshot');

-- The claim: a second claim never gets the same note; the Sample filter splits the queue.
insert into public.guest_stop_notices (host_member_id, kind, guest_name, starts_at) values
  ('f1000000-0000-4000-8000-000000000001', 'new', 'Rolling Taps', now() + interval '1 day');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(50, false)), 2, 'the first claim takes both unsent notes');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(50, false)), 0, 'a second claim gets nothing');
update public.members set business_name = 'Sample PgTap' where id = 'f1000000-0000-4000-8000-000000000002';
insert into public.guest_stop_notices (host_member_id, kind, guest_name, starts_at) values
  ('f1000000-0000-4000-8000-000000000002', 'new', 'Rolling Taps', now() + interval '1 day');
insert into _tap (line) select is(
  (select count(*)::int from public.claim_guest_stop_notices(50, false)), 0, 'the live site leaves Sample taprooms to staging');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
```

That makes 17 assertions; `plan(17)` must match. Count them before running.

- [ ] **Step 2: Write the migration** `supabase/migrations/20261008100000_guest_stops_part2.sql`:

```sql
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
-- (a crashed send is retried), under 5 attempts. `for update skip locked`, so
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
     set claimed_at = now()
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
```

- [ ] **Step 3: Dry run, ask the owner, push, run the database tests**

Run: `npx supabase db push --dry-run --linked`
Expected: only `20261008100000_guest_stops_part2.sql`.

**STOP and ask the owner:** "One database change for Part 2: the 'Ask me first' setting, the two new statuses, the email queue, and the note left when a visit disappears. It only adds; the live site behaves the same. OK to apply it to the shared database?"

After a yes, run `npx supabase db push --linked --yes`, then `npm run test:db`.
Expected: all files pass, `guest_stops_part2.test.sql` 17/17, and `event_hosts.test.sql` still 11/11. Its test "an unknown status is refused" uses `pending`, which people still can't set.

- [ ] **Step 4: Types.** In `src/lib/supabase/types.ts`, replace the Part 1 `EventHostStatus` and `EventHostRow` with the following:

```ts
/** Guild Mobile members at taprooms (Part 1 20261007100000_event_hosts.sql; Part 2 20261008100000_guest_stops_part2.sql). */
export type EventHostStatus = "shown" | "hidden" | "pending" | "declined";

/** A taproom's choice: show Guild members' stops right away, or ask first. */
export type GuestStopsMode = "show" | "ask";

export type EventHostRow = {
  event_id: string;
  host_member_id: string;
  status: EventHostStatus;
  status_set_by_user_id: string | null;
  /** What the taproom was last told (Part 2): the linker compares these to spot a change. */
  guest_name: string | null;
  title: string | null;
  notified_starts_at: string | null;
  notified_ends_at: string | null;
  notified_all_day: boolean;
  cancel_notified: boolean;
  created_at: string;
  updated_at: string;
};

export type GuestStopNoticeKind = "new" | "request" | "changed" | "canceled";

export type GuestStopNoticeRow = {
  id: string;
  host_member_id: string;
  event_id: string | null;
  kind: GuestStopNoticeKind;
  guest_name: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  old_starts_at: string | null;
  old_ends_at: string | null;
  created_at: string;
  claimed_at: string | null;
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
};
```

Run `npx tsc --noEmit 2>&1 | grep "error TS"`. Fix any `Record<EventHostStatus, …>` maps the widening breaks, adding the two new keys. Expected: only `survey.tsx`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20261008100000_guest_stops_part2.sql supabase/tests/guest_stops_part2.test.sql src/lib/supabase/types.ts
git commit -m "feat(db): Part 2 — Ask me first, pending/declined, the email notes queue, its delete trigger and claim"
```

---

### Task 2: The linker's decision — statuses by mode, and which notes to write (pure)

**Files:**
- Modify: `src/lib/events/guest-links.ts`, `src/lib/events/guest-links.test.ts`

**Interfaces:**
- Consumes: `matchHost`, `HostCandidate` (mobile-stops); `EventHostStatus`, `GuestStopsMode`, `GuestStopNoticeKind` (Task 1).
- Produces (replacing Part 1's `decideGuestLinks` signature):
  - `type GuestStop = { id; member_id; title: string | null; venue_name; address; city; starts_at; ends_at; all_day: boolean; overlay_status: string | null; overlay_starts_at: string | null; is_hidden: boolean }`
  - `type LinkHost = HostCandidate & { mode: GuestStopsMode }`
  - `type ExistingLink = { event_id; host_member_id; status: EventHostStatus; guest_name: string | null; title: string | null; notified_starts_at: string | null; notified_ends_at: string | null; notified_all_day: boolean; cancel_notified: boolean }`
  - `type LinkWrite = { event_id; host_member_id; status: EventHostStatus; guest_name: string; title: string | null; notified_starts_at: string; notified_ends_at: string | null; notified_all_day: boolean; cancel_notified: boolean }`
  - `type NoticeWrite = { host_member_id; event_id: string; kind: GuestStopNoticeKind; guest_name: string; title: string | null; starts_at: string; ends_at: string | null; all_day: boolean; old_starts_at: string | null; old_ends_at: string | null }`
  - `decideGuestLinks(args: { stops: GuestStop[]; hosts: LinkHost[]; existing: ExistingLink[]; guestNames: Map<string, string>; now: Date }): { upserts: LinkWrite[]; deletes: string[]; notices: NoticeWrite[] }`

**The rules:** the spec's linker section. Each stop in the window is handled as follows. Its effective start is `overlay_starts_at` when rescheduled. Its effective end is null when rescheduled, otherwise `ends_at`. It's **live** when it isn't member-hidden, canceled or postponed.
1. **No host:** delete the row if one exists. The database trigger writes the canceled note.
2. **New link** (no row, or a different host):
   - The status is `shown` for a mode `show` host, `pending` for `ask`.
   - If the stop is live, write a `new` note (when shown) or a `request` note (when pending), with `cancel_notified=false`. If it isn't live, write no note and set `cancel_notified=true`.
   - **A different host before:** if the old row was `shown` or `pending` and not `cancel_notified`, also write a `canceled` note for the **old** host, from the old row's snapshot. The upsert replaces the row, so the delete trigger never fires.
3. **Same host:** keep the status.
   - **Status `shown` or `pending`:**
     - live and `cancel_notified` (the stop is back): write a `new`/`request` note matching the status, and set `cancel_notified=false`;
     - live, and the effective start or end differs from what was notified: write a `changed` note, with the old times taken from what was notified;
     - not live and not `cancel_notified`: write a `canceled` note and set `cancel_notified=true`.
   - **Hidden or declined:** no notes.
   - Write the row (update the snapshot) only when a snapshot field or `cancel_notified` changes.

- [ ] **Step 1: Rewrite the tests.** In `src/lib/events/guest-links.test.ts`, give `stop()` `title: null, is_hidden: false`, and give the hosts `mode: "show"`. Keep the 7 Part 1 cases, updating their expected `upserts` to the `LinkWrite` shape. Use a helper:

```ts
const W = (o: Partial<LinkWrite>): LinkWrite => ({
  event_id: "e1", host_member_id: "mars", status: "shown", guest_name: "Sample Taco Truck", title: null,
  notified_starts_at: "2026-10-09T00:00:00Z", notified_ends_at: "2026-10-09T04:00:00Z", notified_all_day: false,
  cancel_notified: false, ...o,
});
const names = new Map([["truck", "Sample Taco Truck"]]);
const link = (o: Partial<ExistingLink>): ExistingLink => ({
  event_id: "e1", host_member_id: "mars", status: "shown", guest_name: "Sample Taco Truck", title: null,
  notified_starts_at: "2026-10-09T00:00:00Z", notified_ends_at: "2026-10-09T04:00:00Z", notified_all_day: false,
  cancel_notified: false, ...o,
});
```

Then add:

```ts
describe("decideGuestLinks, Part 2 (Ask me first and notes)", () => {
  const askHosts = hosts.map((h) => (h.id === "mars" ? { ...h, mode: "ask" as const } : h));
  it("a new stop at a Show-right-away taproom: shown, with a 'new' note", () => {
    const r = decideGuestLinks({ stops: [stop({})], hosts, existing: [], guestNames: names, now: NOW });
    expect(r.upserts).toEqual([W({})]);
    expect(r.notices.map((n) => [n.kind, n.host_member_id])).toEqual([["new", "mars"]]);
  });
  it("a new stop at an Ask-me-first taproom: pending, with a 'request' note", () => {
    const r = decideGuestLinks({ stops: [stop({})], hosts: askHosts, existing: [], guestNames: names, now: NOW });
    expect(r.upserts[0].status).toBe("pending");
    expect(r.notices.map((n) => n.kind)).toEqual(["request"]);
  });
  it("same taproom, nothing changed: no write, no note (switching modes never re-sends)", () => {
    const r = decideGuestLinks({ stops: [stop({})], hosts, existing: [link({ status: "pending" })], guestNames: names, now: NOW });
    expect(r).toEqual({ upserts: [], deletes: [], notices: [] });
  });
  it("time changed: a 'changed' note with the old times; the status is kept", () => {
    const r = decideGuestLinks({
      stops: [stop({ starts_at: "2026-10-10T00:00:00Z", ends_at: "2026-10-10T04:00:00Z" })], hosts,
      existing: [link({ status: "pending" })], guestNames: names, now: NOW,
    });
    expect(r.upserts).toEqual([W({ status: "pending", notified_starts_at: "2026-10-10T00:00:00Z", notified_ends_at: "2026-10-10T04:00:00Z" })]);
    expect(r.notices[0]).toMatchObject({ kind: "changed", old_starts_at: "2026-10-09T00:00:00Z", starts_at: "2026-10-10T00:00:00Z" });
  });
  it("rescheduled counts as a change to its new start, with no end", () => {
    const r = decideGuestLinks({
      stops: [stop({ overlay_status: "rescheduled", overlay_starts_at: "2026-10-11T01:00:00Z" })], hosts,
      existing: [link({})], guestNames: names, now: NOW,
    });
    expect(r.notices[0]).toMatchObject({ kind: "changed", starts_at: "2026-10-11T01:00:00Z", ends_at: null });
  });
  it("canceled (or postponed, or hidden by the member): one 'canceled' note, once", () => {
    for (const o of [{ overlay_status: "canceled" }, { overlay_status: "postponed" }, { is_hidden: true }]) {
      const r = decideGuestLinks({ stops: [stop(o)], hosts, existing: [link({})], guestNames: names, now: NOW });
      expect(r.notices.map((n) => n.kind)).toEqual(["canceled"]);
      expect(r.upserts[0].cancel_notified).toBe(true);
    }
    const again = decideGuestLinks({ stops: [stop({ overlay_status: "canceled" })], hosts, existing: [link({ cancel_notified: true })], guestNames: names, now: NOW });
    expect(again.notices).toEqual([]);
  });
  it("un-canceled: back on, with a fresh 'new' note", () => {
    const r = decideGuestLinks({ stops: [stop({})], hosts, existing: [link({ cancel_notified: true })], guestNames: names, now: NOW });
    expect(r.notices.map((n) => n.kind)).toEqual(["new"]);
    expect(r.upserts[0].cancel_notified).toBe(false);
  });
  it("hidden or declined: no notes for changes or cancels", () => {
    for (const status of ["hidden", "declined"] as const) {
      const r = decideGuestLinks({
        stops: [stop({ starts_at: "2026-10-10T00:00:00Z", overlay_status: "canceled" })], hosts,
        existing: [link({ status })], guestNames: names, now: NOW,
      });
      expect(r.notices).toEqual([]);
    }
  });
  it("moved from Mars (Ask me first) to Sample (Show): Mars gets 'canceled', Sample gets 'new'", () => {
    const r = decideGuestLinks({
      stops: [stop({ venue_name: "Sample Brewing Co." })], hosts: askHosts,
      existing: [link({ status: "pending" })], guestNames: names, now: NOW,
    });
    expect(r.upserts).toEqual([W({ host_member_id: "sample", status: "shown" })]);
    expect(r.notices.map((n) => [n.kind, n.host_member_id])).toEqual([["canceled", "mars"], ["new", "sample"]]);
  });
  it("a stop created already canceled is linked quietly", () => {
    const r = decideGuestLinks({ stops: [stop({ overlay_status: "canceled" })], hosts, existing: [], guestNames: names, now: NOW });
    expect(r.notices).toEqual([]);
    expect(r.upserts[0].cancel_notified).toBe(true);
  });
  it("the guest's new title is kept in the snapshot, without an email", () => {
    const r = decideGuestLinks({ stops: [stop({ title: "Taco Tuesday" })], hosts, existing: [link({})], guestNames: names, now: NOW });
    expect(r.upserts).toEqual([W({ title: "Taco Tuesday" })]);
    expect(r.notices).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/events/guest-links.test.ts`
Expected: FAIL (`guestNames`/`mode` ignored, `notices` undefined).

- [ ] **Step 3: Implement** in `guest-links.ts`. Keep `GUEST_LINK_DAYS`, `upcomingStopsFilter`, `startOf` and `inWindow`. Replace the types and `decideGuestLinks` with:

```ts
export type LinkHost = HostCandidate & { mode: GuestStopsMode };

export type ExistingLink = {
  event_id: string;
  host_member_id: string;
  status: EventHostStatus;
  guest_name: string | null;
  title: string | null;
  notified_starts_at: string | null;
  notified_ends_at: string | null;
  notified_all_day: boolean;
  cancel_notified: boolean;
};

export type LinkWrite = Omit<ExistingLink, "guest_name" | "notified_starts_at"> & {
  guest_name: string;
  notified_starts_at: string;
};

export type NoticeWrite = {
  host_member_id: string;
  event_id: string;
  kind: GuestStopNoticeKind;
  guest_name: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  old_starts_at: string | null;
  old_ends_at: string | null;
};

function isLive(s: GuestStop): boolean {
  return !s.is_hidden && s.overlay_status !== "canceled" && s.overlay_status !== "postponed";
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

export function decideGuestLinks(args: {
  stops: GuestStop[];
  hosts: LinkHost[];
  existing: ExistingLink[];
  guestNames: Map<string, string>;
  now: Date;
}): { upserts: LinkWrite[]; deletes: string[]; notices: NoticeWrite[] } {
  const existing = new Map(args.existing.map((l) => [l.event_id, l]));
  const upserts: LinkWrite[] = [];
  const deletes: string[] = [];
  const notices: NoticeWrite[] = [];
  for (const s of args.stops) {
    if (!inWindow(s, args.now)) continue;
    const host = matchHost(s, args.hosts);
    const before = existing.get(s.id);
    if (!host) {
      if (before) deletes.push(s.id); // the delete trigger tells the taproom
      continue;
    }
    const rescheduled = s.overlay_status === "rescheduled" && Boolean(s.overlay_starts_at);
    const startsAt = rescheduled ? (s.overlay_starts_at as string) : s.starts_at;
    const endsAt = rescheduled ? null : s.ends_at;
    const live = isLive(s);
    const guestName = args.guestNames.get(s.member_id) ?? before?.guest_name ?? "A Guild member";
    const title = s.title?.trim() || null;
    const note = (kind: GuestStopNoticeKind, hostId: string, old?: ExistingLink): NoticeWrite => ({
      host_member_id: hostId,
      event_id: s.id,
      kind,
      guest_name: old?.guest_name ?? guestName,
      title: old ? old.title : title,
      starts_at: old?.notified_starts_at ?? startsAt,
      ends_at: old ? old.notified_ends_at : endsAt,
      all_day: old ? old.notified_all_day : s.all_day,
      old_starts_at: null,
      old_ends_at: null,
    });
    const told = (status: EventHostStatus, cancelNotified: boolean): LinkWrite => ({
      event_id: s.id,
      host_member_id: host.id,
      status,
      guest_name: guestName,
      title,
      notified_starts_at: startsAt,
      notified_ends_at: endsAt,
      notified_all_day: s.all_day,
      cancel_notified: cancelNotified,
    });

    if (!before || before.host_member_id !== host.id) {
      if (before && (before.status === "shown" || before.status === "pending") && !before.cancel_notified && before.notified_starts_at) {
        notices.push(note("canceled", before.host_member_id, before));
      }
      const status: EventHostStatus = host.mode === "ask" ? "pending" : "shown";
      upserts.push(told(status, !live));
      if (live) notices.push(note(status === "pending" ? "request" : "new", host.id));
      continue;
    }

    const watching = before.status === "shown" || before.status === "pending";
    let cancelNotified = before.cancel_notified;
    if (watching && live && before.cancel_notified) {
      notices.push(note(before.status === "pending" ? "request" : "new", host.id));
      cancelNotified = false;
    } else if (watching && live && (!sameInstant(before.notified_starts_at, startsAt) || !sameInstant(before.notified_ends_at, endsAt))) {
      notices.push({ ...note("changed", host.id), old_starts_at: before.notified_starts_at, old_ends_at: before.notified_ends_at });
    } else if (watching && !live && !before.cancel_notified) {
      notices.push(note("canceled", host.id));
      cancelNotified = true;
    }
    const next = told(before.status, cancelNotified);
    const changed =
      next.guest_name !== before.guest_name ||
      next.title !== before.title ||
      !sameInstant(next.notified_starts_at, before.notified_starts_at) ||
      !sameInstant(next.notified_ends_at, before.notified_ends_at) ||
      next.notified_all_day !== before.notified_all_day ||
      next.cancel_notified !== before.cancel_notified;
    if (changed) upserts.push(next);
  }
  return { upserts, deletes, notices };
}
```

Add `title: string | null` and `is_hidden: boolean` to `GuestStop`. Import `GuestStopsMode` and `GuestStopNoticeKind` from `@/lib/supabase/types`.

A note on the "canceled" note for a same-host stop: `note("canceled", host.id)` uses the stop's **current** times, which is fine (cancel doesn't change them).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/events/guest-links.test.ts`
Expected: PASS (7 + 11).

- [ ] **Step 5: Commit**
```bash
git add src/lib/events/guest-links.ts src/lib/events/guest-links.test.ts
git commit -m "feat(events): the linker decides pending vs shown by the taproom's setting, and which emails to queue"
```

---

### Task 3: The linker's I/O — load modes, names and snapshots; write notes

**Files:**
- Modify: `src/lib/events/guest-links-load.ts`, `src/lib/events/guest-links.server.ts`
- Test: `src/lib/events/guest-reads.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's types.
- Produces:
  - `loadLinkerInputs(db, scope, now)` returns `{ stops: GuestStop[]; hosts: LinkHost[]; existing: ExistingLink[]; guestNames: Map<string, string> } | null`;
  - `relinkGuestStops` also inserts `notices` into `guest_stop_notices`.

- [ ] **Step 1: Append the failing test** to `guest-reads.test.ts`:

```ts
describe("the linker's inputs, Part 2", () => {
  it("hosts carry their setting; guests' names come with the Mobile members; links carry what was told", async () => {
    const { client, calls } = fakeSupabase({
      members: [{ id: "truck", business_name: "Sample Taco Truck", slug: "taco", city: "Riverside", street_address: null, guest_stops_mode: "ask" }],
      events: [{ ...event, is_hidden: false }],
      event_hosts: [],
    });
    const inputs = await loadLinkerInputs(client, { memberId: "truck" }, NOW);
    expect(inputs?.guestNames.get("truck")).toBe("Sample Taco Truck");
    expect(inputs?.hosts[0].mode).toBe("ask");
    const memberSelects = calls.filter((c) => c.table === "members").flatMap((c) => c.ops.filter(([op]) => op === "select").map(([, a]) => String(a[0])));
    expect(memberSelects.some((s) => s.includes("guest_stops_mode"))).toBe(true);
    const linkSelect = calls.find((c) => c.table === "event_hosts")?.ops.find(([op]) => op === "select");
    expect(String(linkSelect?.[1][0] ?? "")).toContain("notified_starts_at");
  });
});
```

Note: the fake returns the same `members` rows for every `members` query, which is fine here: the truck doubles as a host candidate. The event in this test has an id, so `event_hosts` is queried; `existing` comes back empty.

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run src/lib/events/guest-reads.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `guest-links-load.ts`:
  - **Mobile members query:** `select("id, business_name")`. Build `guestNames` from it.
  - **Hosts query:** add `guest_stops_mode`; map `mode: (h.guest_stops_mode === "ask" ? "ask" : "show")`.
  - **Stop columns:** `"id, member_id, title, venue_name, address, city, starts_at, ends_at, all_day, overlay_status, overlay_starts_at, is_hidden"`.
  - **Existing links:** `select("event_id, host_member_id, status, guest_name, title, notified_starts_at, notified_ends_at, notified_all_day, cancel_notified")`.
  - **Return** `{ stops, hosts, existing, guestNames }`.

  In `guest-links.server.ts`:
  - **Upsert:** `upserts.map((u) => ({ ...u, updated_at: now.toISOString() }))`. Drop the hard-coded `status_set_by_user_id: null`; a same-host write keeps the status, and a new link has no setter.
  - **Notices:** after the upserts and deletes, `if (notices.length) { const { error } = await db.from("guest_stop_notices").insert(notices); if (error) throw error; }`.

- [ ] **Step 4: Run** `npx vitest run src/lib/events`, then `npx tsc --noEmit 2>&1 | grep -c "error TS"`.
Expected: PASS; `1`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/events/guest-links-load.ts src/lib/events/guest-links.server.ts src/lib/events/guest-reads.test.ts
git commit -m "feat(events): the linker loads each taproom's setting and writes the email notes"
```

---

### Task 4: The emails — signed links, grouping, and the email text (pure)

**Files:**
- Create: `src/lib/crypto/signed-token.ts`, `src/lib/crypto/signed-token.test.ts`
- Create: `src/lib/events/visit-link-token.ts`, `src/lib/events/visit-link-token.test.ts`
- Create: `src/lib/events/guest-stop-email.ts`, `src/lib/events/guest-stop-email.test.ts`

**Interfaces:**
- Produces:
  - `signToken(payload: string, secret: string): Promise<string>`, `verifyToken(token: string, secret: string): Promise<string | null>`
  - `type VisitAction = "approve" | "decline" | "hide"`; `signVisitLink(p: { eventId: string; hostId: string; action: VisitAction; expiresAt: Date }, secret): Promise<string>`; `verifyVisitLink(token, secret, now = new Date()): Promise<{ valid: true; eventId; hostId; action } | { valid: false; reason: "invalid" | "expired" }>`; `visitLinkExpiry(startsAt: string, endsAt: string | null, now: Date): Date` (the visit's end, at most 60 days from now)
  - `groupNotices(notes: GuestStopNoticeRow[]): Map<string, GuestStopNoticeRow[]>`. Keyed by host. Within a host, per event: a `canceled` note wins alone; otherwise `new`/`request` absorbs later `changed` notes (with the latest times); several `changed` notes merge (earliest old, latest new). Results are sorted by `starts_at`.
  - `type EmailVisit = GuestStopNoticeRow & { buttons: Array<{ label: string; href: string }> }`
  - `buildGuestStopEmail(args: { taproomName: string; street: string | null; timezone: string; visits: EmailVisit[]; pageUrl: string; eventsUrl: string; staging: boolean }): { subject: string; html: string; text: string }`

- [ ] **Step 1: Write failing tests**

`src/lib/crypto/signed-token.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./signed-token";

describe("signed tokens", () => {
  it("round-trips", async () => {
    expect(await verifyToken(await signToken("a.b.c", "s3cret"), "s3cret")).toBe("a.b.c");
  });
  it("an altered token or the wrong secret: null", async () => {
    const t = await signToken("a.b.c", "s3cret");
    expect(await verifyToken(t, "other")).toBeNull();
    expect(await verifyToken(`x${t}`, "s3cret")).toBeNull();
    expect(await verifyToken("garbage", "s3cret")).toBeNull();
  });
});
```

`src/lib/events/visit-link-token.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { signVisitLink, verifyVisitLink, visitLinkExpiry } from "./visit-link-token";

const NOW = new Date("2026-10-07T18:00:00Z");
describe("visit links", () => {
  it("valid until the visit is over", async () => {
    const t = await signVisitLink({ eventId: "e1", hostId: "mars", action: "approve", expiresAt: new Date("2026-10-09T04:00:00Z") }, "k");
    expect(await verifyVisitLink(t, "k", NOW)).toEqual({ valid: true, eventId: "e1", hostId: "mars", action: "approve" });
    expect(await verifyVisitLink(t, "k", new Date("2026-10-09T05:00:00Z"))).toEqual({ valid: false, reason: "expired" });
    expect(await verifyVisitLink(t, "wrong", NOW)).toEqual({ valid: false, reason: "invalid" });
  });
  it("expiry: the end, else start + 2 hours, never more than 60 days out", () => {
    expect(visitLinkExpiry("2026-10-09T00:00:00Z", "2026-10-09T04:00:00Z", NOW).toISOString()).toBe("2026-10-09T04:00:00.000Z");
    expect(visitLinkExpiry("2026-10-09T00:00:00Z", null, NOW).toISOString()).toBe("2026-10-09T02:00:00.000Z");
    expect(visitLinkExpiry("2027-03-01T00:00:00Z", null, NOW).toISOString()).toBe("2026-12-06T18:00:00.000Z");
  });
});
```

`src/lib/events/guest-stop-email.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { GuestStopNoticeRow } from "@/lib/supabase/types";
import { buildGuestStopEmail, groupNotices, type EmailVisit } from "./guest-stop-email";

const n = (o: Partial<GuestStopNoticeRow>): GuestStopNoticeRow => ({
  id: "n", host_member_id: "mars", event_id: "e1", kind: "new", guest_name: "Tacos El Gordo", title: null,
  starts_at: "2026-10-03T00:00:00Z", ends_at: "2026-10-03T04:00:00Z", all_day: false, old_starts_at: null, old_ends_at: null,
  created_at: "2026-10-01T00:00:00Z", claimed_at: null, sent_at: null, attempts: 0, last_error: null, ...o,
});
const visit = (o: Partial<GuestStopNoticeRow>, buttons: EmailVisit["buttons"] = []): EmailVisit => ({ ...n(o), buttons });
const base = { taproomName: "Bob's Brewery", street: "9373 Coca Street", timezone: "America/Los_Angeles", pageUrl: "https://x/members/bob", eventsUrl: "https://x/portal/events", staging: false };

describe("groupNotices", () => {
  it("per taproom; changed then canceled in one run: only the canceled", () => {
    const g = groupNotices([
      n({ id: "1", kind: "changed", created_at: "2026-10-01T00:00:00Z" }),
      n({ id: "2", kind: "canceled", created_at: "2026-10-01T00:05:00Z" }),
      n({ id: "3", host_member_id: "sample", event_id: "e2", kind: "new" }),
    ]);
    expect(g.get("mars")?.map((x) => x.kind)).toEqual(["canceled"]);
    expect(g.get("sample")?.map((x) => x.kind)).toEqual(["new"]);
  });
  it("new then changed in one run: one 'new' at the latest time", () => {
    const g = groupNotices([n({ id: "1", kind: "new" }), n({ id: "2", kind: "changed", starts_at: "2026-10-04T00:00:00Z", created_at: "2026-10-01T00:05:00Z" })]);
    expect(g.get("mars")).toEqual([expect.objectContaining({ kind: "new", starts_at: "2026-10-04T00:00:00Z" })]);
  });
  it("two changes: earliest old time, latest new time", () => {
    const g = groupNotices([
      n({ id: "1", kind: "changed", old_starts_at: "2026-10-02T00:00:00Z", starts_at: "2026-10-03T00:00:00Z" }),
      n({ id: "2", kind: "changed", old_starts_at: "2026-10-03T00:00:00Z", starts_at: "2026-10-05T00:00:00Z", created_at: "2026-10-01T00:05:00Z" }),
    ]);
    expect(g.get("mars")).toEqual([expect.objectContaining({ old_starts_at: "2026-10-02T00:00:00Z", starts_at: "2026-10-05T00:00:00Z" })]);
  });
});

describe("buildGuestStopEmail", () => {
  it("one new visit (GV2 #1)", () => {
    const e = buildGuestStopEmail({ ...base, visits: [visit({}, [{ label: "Hide this visit", href: "https://x/visit/t1" }])] });
    expect(e.subject).toBe("Tacos El Gordo is coming to Bob's Brewery · Fri, Oct 2");
    expect(e.text).toContain("Tacos El Gordo, a Guild member, listed a stop at your taproom:");
    expect(e.text).toContain("Friday, October 2 · 5:00 – 9:00 pm");
    expect(e.text).toContain("Bob's Brewery · 9373 Coca Street");
    expect(e.text).toContain("It's on your page now.");
    expect(e.html).toContain('href="https://x/visit/t1"');
    expect(e.html).toContain("Hide this visit");
    expect(e.html).toContain("See your page");
  });
  it("a request (GV2 #2)", () => {
    const e = buildGuestStopEmail({ ...base, visits: [visit({ kind: "request", guest_name: "Rolling Smoke BBQ" })] });
    expect(e.subject).toBe("Approve a visit? Rolling Smoke BBQ · Fri, Oct 2");
    expect(e.text).toContain("would like to be listed at your taproom:");
    expect(e.text).toContain("Nothing shows on your page until you approve.");
  });
  it("changed (GV2 #3) and canceled", () => {
    const c = buildGuestStopEmail({ ...base, visits: [visit({ kind: "changed", old_starts_at: "2026-10-03T00:00:00Z", old_ends_at: "2026-10-03T04:00:00Z", starts_at: "2026-10-04T00:00:00Z", ends_at: "2026-10-04T04:00:00Z" })] });
    expect(c.subject).toBe("Changed: Tacos El Gordo moved to Sat, Oct 3");
    expect(c.text).toContain("Friday, October 2 · 5:00 – 9:00 pm → Saturday, October 3 · 5:00 – 9:00 pm");
    expect(c.text).toContain("Your page already shows the new date.");
    const x = buildGuestStopEmail({ ...base, visits: [visit({ kind: "canceled" })] });
    expect(x.subject).toBe("Canceled: Tacos El Gordo · Fri, Oct 2");
    expect(x.text).toContain("It's off your page.");
  });
  it("several visits: one summary email", () => {
    const e = buildGuestStopEmail({ ...base, visits: [visit({}), visit({ id: "2", event_id: "e2", starts_at: "2026-10-05T00:00:00Z" })] });
    expect(e.subject).toBe("2 Guild member visits at Bob's Brewery");
    const r = buildGuestStopEmail({ ...base, visits: [visit({ kind: "request" }), visit({ id: "2", event_id: "e2", kind: "request" })] });
    expect(r.subject).toBe("2 visits to approve at Bob's Brewery");
  });
  it("the visit's own title follows the name; text is escaped in HTML; footer; staging marker", () => {
    const e = buildGuestStopEmail({ ...base, staging: true, visits: [visit({ title: "<Taco> Tuesday" })] });
    expect(e.text).toContain("Tacos El Gordo — <Taco> Tuesday");
    expect(e.html).toContain("&lt;Taco&gt; Tuesday");
    expect(e.text).toContain("You get this because you're an owner or editor of Bob's Brewery on the ISC Brewers Guild site.");
    expect(e.subject.startsWith("[Staging] ")).toBe(true);
  });
});
```

The dates in these tests are in Pacific time. 2026-10-03T00:00Z is Fri Oct 2, 5:00 pm.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/crypto src/lib/events/visit-link-token.test.ts src/lib/events/guest-stop-email.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/lib/crypto/signed-token.ts`. It uses the same HMAC-SHA256 and base64url scheme as `src/lib/hours/confirm-token.ts`; that file stays as it is.
```ts
/** A payload plus its HMAC-SHA256 signature, base64url: `<payload>.<signature>`. No storage needed. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function signToken(payload: string, secret: string): Promise<string> {
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(await hmac(secret, payload))}`;
}
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  try {
    const payload = new TextDecoder().decode(fromBase64Url(p));
    return equal(fromBase64Url(s), await hmac(secret, payload)) ? payload : null;
  } catch {
    return null;
  }
}
```

`src/lib/events/visit-link-token.ts`:
```ts
import { signToken, verifyToken } from "@/lib/crypto/signed-token";

/** The email buttons' signed links (spec, "The email buttons"): which visit, which taproom, which action, until when. */
export type VisitAction = "approve" | "decline" | "hide";
const ACTIONS: readonly VisitAction[] = ["approve", "decline", "hide"];
const MAX_MS = 60 * 24 * 3600 * 1000;

export function visitLinkExpiry(startsAt: string, endsAt: string | null, now: Date): Date {
  const end = endsAt ? new Date(endsAt).getTime() : new Date(startsAt).getTime() + 2 * 3600 * 1000;
  return new Date(Math.min(end, now.getTime() + MAX_MS));
}

export function signVisitLink(p: { eventId: string; hostId: string; action: VisitAction; expiresAt: Date }, secret: string): Promise<string> {
  return signToken(`${p.eventId}.${p.hostId}.${p.action}.${p.expiresAt.getTime()}`, secret);
}

export async function verifyVisitLink(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ valid: true; eventId: string; hostId: string; action: VisitAction } | { valid: false; reason: "invalid" | "expired" }> {
  const payload = await verifyToken(token, secret);
  const [eventId, hostId, action, expires] = payload?.split(".") ?? [];
  if (!eventId || !hostId || !ACTIONS.includes(action as VisitAction) || !Number.isFinite(Number(expires))) {
    return { valid: false, reason: "invalid" };
  }
  if (Number(expires) <= now.getTime()) return { valid: false, reason: "expired" };
  return { valid: true, eventId, hostId, action: action as VisitAction };
}
```

`src/lib/events/guest-stop-email.ts`. It formats days and times in the taproom's zone with `Intl` (`weekday: "long", month: "long", day: "numeric"`; short form `weekday: "short", month: "short", day: "numeric"`), and reuses `formatTimeRange` from `@/components/profile/EventsModule`. That module has no client-only code, so it's safe here.
```ts
import type { GuestStopNoticeRow } from "@/lib/supabase/types";
import { formatTimeRange } from "@/components/profile/EventsModule";
import { ORG_SHORT_NAME } from "@/lib/email/build-email-content";

/** The taproom's email about Guild members' visits (spec, "Emails"; artboard GV2). Pure. */
export type EmailVisit = GuestStopNoticeRow & { buttons: Array<{ label: string; href: string }> };

export function groupNotices(notes: GuestStopNoticeRow[]): Map<string, GuestStopNoticeRow[]> {
  const byHostEvent = new Map<string, GuestStopNoticeRow[]>();
  for (const note of [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = `${note.host_member_id}|${note.event_id ?? note.id}`;
    byHostEvent.set(key, [...(byHostEvent.get(key) ?? []), note]);
  }
  const out = new Map<string, GuestStopNoticeRow[]>();
  for (const list of byHostEvent.values()) {
    const last = list[list.length - 1];
    const canceled = list.find((x) => x.kind === "canceled");
    const opening = list.find((x) => x.kind === "new" || x.kind === "request");
    const firstChange = list.find((x) => x.kind === "changed");
    const merged: GuestStopNoticeRow = canceled
      ? { ...canceled, kind: "canceled" }
      : opening
        ? { ...last, kind: opening.kind, old_starts_at: null, old_ends_at: null }
        : { ...last, kind: "changed", old_starts_at: firstChange?.old_starts_at ?? null, old_ends_at: firstChange?.old_ends_at ?? null };
    const host = merged.host_member_id;
    out.set(host, [...(out.get(host) ?? []), merged]);
  }
  for (const list of out.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return out;
}

function day(iso: string, tz: string, style: "long" | "short"): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: style, month: style, day: "numeric", timeZone: tz });
}

function when(startsAt: string, endsAt: string | null, allDay: boolean, tz: string): string {
  return `${day(startsAt, tz, "long")} · ${allDay ? "All day" : formatTimeRange(startsAt, endsAt, tz)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function who(v: GuestStopNoticeRow): string {
  return v.title ? `${v.guest_name} — ${v.title}` : v.guest_name;
}

function lines(v: EmailVisit, taproom: string, street: string | null, tz: string): { intro: string; detail: string[]; after: string } {
  const place = street ? `${taproom} · ${street}` : taproom;
  const now = when(v.starts_at, v.ends_at, v.all_day, tz);
  switch (v.kind) {
    case "new":
      return { intro: `${who(v)}, a Guild member, listed a stop at your taproom:`, detail: [now, place], after: "It's on your page now." };
    case "request":
      return { intro: `${who(v)}, a Guild member, would like to be listed at your taproom:`, detail: [now, place], after: "Nothing shows on your page until you approve." };
    case "changed":
      return {
        intro: `${who(v)} changed their stop at your taproom:`,
        detail: [`${v.old_starts_at ? when(v.old_starts_at, v.old_ends_at, v.all_day, tz) : ""} → ${now}`, place],
        after: v.buttons.some((b) => b.label === "Approve") ? "It's still waiting for your approval." : "Your page already shows the new date.",
      };
    case "canceled":
      return { intro: `${who(v)} canceled their stop at your taproom:`, detail: [now, place], after: "It's off your page." };
  }
}

function subjectFor(visits: EmailVisit[], taproom: string, tz: string): string {
  if (visits.length > 1) {
    return visits.every((v) => v.kind === "request")
      ? `${visits.length} visits to approve at ${taproom}`
      : `${visits.length} Guild member visits at ${taproom}`;
  }
  const v = visits[0];
  const short = day(v.starts_at, tz, "short");
  switch (v.kind) {
    case "new":
      return `${v.guest_name} is coming to ${taproom} · ${short}`;
    case "request":
      return `Approve a visit? ${v.guest_name} · ${short}`;
    case "changed":
      return `Changed: ${v.guest_name} moved to ${short}`;
    case "canceled":
      return `Canceled: ${v.guest_name} · ${short}`;
  }
}

export function buildGuestStopEmail(args: {
  taproomName: string;
  street: string | null;
  timezone: string;
  visits: EmailVisit[];
  pageUrl: string;
  eventsUrl: string;
  staging: boolean;
}): { subject: string; html: string; text: string } {
  const { taproomName, street, timezone, visits, pageUrl, eventsUrl } = args;
  const footer = `You get this because you're an owner or editor of ${taproomName} on the ${ORG_SHORT_NAME} site. Choose Show right away or Ask me first on your Events page.`;
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  for (const v of visits) {
    const l = lines(v, taproomName, street, timezone);
    const buttons = [{ label: "See your page", href: pageUrl }, ...v.buttons];
    textParts.push([l.intro, ...l.detail, l.after, ...buttons.map((b) => `${b.label}: ${b.href}`)].join("\n"));
    htmlParts.push(
      `<div style="margin: 0 0 24px;"><p>${escapeHtml(l.intro)}</p><p><strong>${l.detail.map(escapeHtml).join("<br>")}</strong></p><p>${escapeHtml(l.after)}</p><p>${buttons
        .map((b, i) =>
          i === 0
            ? `<a href="${escapeHtml(b.href)}" style="margin-right: 12px;">${escapeHtml(b.label)}</a>`
            : `<a href="${escapeHtml(b.href)}" style="display: inline-block; margin-right: 8px; padding: 10px 18px; background: #BE5A0A; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600;">${escapeHtml(b.label)}</a>`,
        )
        .join("")}</p></div>`,
    );
  }
  const events = `Your Events page: ${eventsUrl}`;
  return {
    subject: `${args.staging ? "[Staging] " : ""}${subjectFor(visits, taproomName, timezone)}`,
    text: [...textParts, events, footer].join("\n\n"),
    html: `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${htmlParts.join("")}<p style="color: #6B6156; font-size: 13px;"><a href="${escapeHtml(eventsUrl)}">Your Events page</a><br>${escapeHtml(footer)}</p></div>`,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/crypto src/lib/events/visit-link-token.test.ts src/lib/events/guest-stop-email.test.ts`
Expected: PASS. If an Intl detail differs (for example, a narrow no-break space before "pm" in some Node versions), fix the formatter, not the test. `formatTimeRange` already lowercases and is used on the profile.

- [ ] **Step 5: Commit**
```bash
git add src/lib/crypto src/lib/events/visit-link-token.ts src/lib/events/visit-link-token.test.ts src/lib/events/guest-stop-email.ts src/lib/events/guest-stop-email.test.ts
git commit -m "feat(email): Guild member visit emails — signed button links, one email per taproom, GV2 text"
```

---

### Task 5: Sending — claim, recipients, staging rules, the cron

**Files:**
- Modify: `src/lib/email/send.ts` (export `sendRawEmail`)
- Create: `src/lib/events/guest-stop-send.ts` (pure: `siteRole`, the per-taproom send plan), `src/lib/events/guest-stop-send.test.ts`
- Create: `src/lib/events/guest-stop-notices.server.ts` (`sendGuestStopNotices()`, cron only)
- Modify: `src/server.ts`, `wrangler.jsonc`, `wrangler.staging.jsonc`

**Interfaces:**
- Consumes: `claim_guest_stop_notices` (Task 1); `groupNotices`, `buildGuestStopEmail`, `signVisitLink`, `visitLinkExpiry` (Task 4).
- Produces:
  - `sendRawEmail(p: { to: string[]; subject: string; html: string; text: string }): Promise<void>`. It throws on a Resend error or a missing `RESEND_API_KEY`.
  - `siteRole(siteOrigin: string | undefined): { origin: string; staging: boolean }`. A missing or unknown origin means the live site, `SITE_URL`.
  - `visitButtons(visit, ctx: { origin; secret; now }): Promise<EmailVisit["buttons"]>`. It gives `new`/`changed` (shown): Hide this visit; `request` (and `changed` while pending): Approve and Decline; `canceled`: none.
  - `sendGuestStopNotices(): Promise<void>`. It never throws.

- [ ] **Step 1: Write failing tests** in `src/lib/events/guest-stop-send.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { siteRole, visitButtons } from "./guest-stop-send";
import { verifyVisitLink } from "./visit-link-token";

const NOW = new Date("2026-10-07T18:00:00Z");
const v = (kind: "new" | "request" | "changed" | "canceled") => ({
  id: "n", host_member_id: "mars", event_id: "e1", kind, guest_name: "T", title: null,
  starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false, old_starts_at: null, old_ends_at: null,
  created_at: "", claimed_at: null, sent_at: null, attempts: 0, last_error: null,
});

describe("siteRole", () => {
  it("staging by its own origin; anything else is the live site", () => {
    expect(siteRole("https://ie-brewers-guild-staging.boblelle77.workers.dev")).toEqual({ origin: "https://ie-brewers-guild-staging.boblelle77.workers.dev", staging: true });
    expect(siteRole("https://iscbrewersguild.org")).toEqual({ origin: "https://iscbrewersguild.org", staging: false });
    expect(siteRole(undefined)).toEqual({ origin: "https://iscbrewersguild.org", staging: false });
  });
});

describe("visitButtons", () => {
  const ctx = { origin: "https://x", secret: "k", now: NOW };
  it("shown: Hide; request: Approve and Decline; canceled: none; changed while pending: Approve and Decline", async () => {
    expect((await visitButtons(v("new"), "shown", ctx)).map((b) => b.label)).toEqual(["Hide this visit"]);
    expect((await visitButtons(v("request"), "pending", ctx)).map((b) => b.label)).toEqual(["Approve", "Decline"]);
    expect(await visitButtons(v("canceled"), "shown", ctx)).toEqual([]);
    expect((await visitButtons(v("changed"), "pending", ctx)).map((b) => b.label)).toEqual(["Approve", "Decline"]);
  });
  it("each button's link is a signed /visit/ link for that action", async () => {
    const [approve] = await visitButtons(v("request"), "pending", ctx);
    const token = approve.href.replace("https://x/visit/", "");
    expect(await verifyVisitLink(token, "k", NOW)).toEqual({ valid: true, eventId: "e1", hostId: "mars", action: "approve" });
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run src/lib/events/guest-stop-send.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/events/guest-stop-send.ts`:
```ts
import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";
import { SITE_URL } from "@/lib/email/build-email-content";
import { signVisitLink, visitLinkExpiry, type VisitAction } from "@/lib/events/visit-link-token";
import type { EmailVisit } from "@/lib/events/guest-stop-email";

const STAGING_ORIGIN = "https://ie-brewers-guild-staging.boblelle77.workers.dev";

/** Which site this Worker is (its SITE_ORIGIN var): staging sends only the Sample test taprooms' mail, to the test inbox. */
export function siteRole(siteOrigin: string | undefined): { origin: string; staging: boolean } {
  return siteOrigin === STAGING_ORIGIN ? { origin: STAGING_ORIGIN, staging: true } : { origin: SITE_URL, staging: false };
}

export async function visitButtons(
  visit: GuestStopNoticeRow,
  status: EventHostStatus,
  ctx: { origin: string; secret: string; now: Date },
): Promise<EmailVisit["buttons"]> {
  if (visit.kind === "canceled" || !visit.event_id) return [];
  const actions: Array<[string, VisitAction]> =
    status === "pending" ? [["Approve", "approve"], ["Decline", "decline"]] : [["Hide this visit", "hide"]];
  const expiresAt = visitLinkExpiry(visit.starts_at, visit.ends_at, ctx.now);
  return Promise.all(
    actions.map(async ([label, action]) => ({
      label,
      href: `${ctx.origin}/visit/${await signVisitLink({ eventId: visit.event_id!, hostId: visit.host_member_id, action, expiresAt }, ctx.secret)}`,
    })),
  );
}
```

`src/lib/email/send.ts`: add, next to `sendTransactionalEmail` and reusing its env read and from-address:
```ts
/** A prebuilt email to several addresses (Guild member visit emails). Throws on a Resend error. */
export async function sendRawEmail(p: { to: string[]; subject: string; html: string; text: string }): Promise<void> {
  const env = await getEmailWorkerEnv();
  if (!env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY in the Worker environment.");
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: TRANSACTIONAL_FROM_ADDRESS, to: p.to, subject: p.subject, html: p.html, text: p.text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend request failed (${response.status} ${response.statusText}): ${body}`);
  }
}
```

`src/lib/events/guest-stop-notices.server.ts` (cron only, service role; never imported by client code):
```ts
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendRawEmail } from "@/lib/email/send";
import { STAGING_GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import { buildGuestStopEmail, groupNotices, type EmailVisit } from "@/lib/events/guest-stop-email";
import { siteRole, visitButtons } from "@/lib/events/guest-stop-send";
import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";

const BATCH = 200;

/**
 * Sends the queued Guild member visit emails (spec, "The send queue"): one
 * per taproom, to its owner and full editors. The live site takes every
 * taproom but the Sample test ones; staging takes only those, and sends to
 * the test inbox. Never throws.
 */
export async function sendGuestStopNotices(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const vars = env as { SITE_ORIGIN?: string; GUEST_STOP_LINK_SECRET?: string };
    if (!vars.GUEST_STOP_LINK_SECRET) {
      console.error("sendGuestStopNotices: GUEST_STOP_LINK_SECRET is not set");
      return;
    }
    const role = siteRole(vars.SITE_ORIGIN);
    const db = await getSupabaseServiceRoleClient();
    const { data, error } = await db.rpc("claim_guest_stop_notices", { p_limit: BATCH, p_sample_only: role.staging });
    if (error) throw error;
    const claimed = (data ?? []) as GuestStopNoticeRow[];
    if (claimed.length === 0) return;
    const now = new Date();

    for (const [hostId, visits] of groupNotices(claimed)) {
      const ids = claimed.filter((c) => c.host_member_id === hostId).map((c) => c.id);
      try {
        const [{ data: host }, { data: people }, { data: links }] = await Promise.all([
          db.from("members").select("slug, business_name, street_address, timezone").eq("id", hostId).maybeSingle(),
          db.from("member_users").select("user_id").eq("member_id", hostId).in("role", ["owner", "editor"]),
          db.from("event_hosts").select("event_id, status").in("event_id", visits.map((v) => v.event_id).filter(Boolean) as string[]),
        ]);
        const statusOf = new Map(((links ?? []) as Array<{ event_id: string; status: EventHostStatus }>).map((l) => [l.event_id, l.status]));
        const emails: string[] = [];
        for (const p of (people ?? []) as Array<{ user_id: string }>) {
          const { data: u } = await db.auth.admin.getUserById(p.user_id);
          if (u?.user?.email) emails.push(u.user.email);
        }
        const to = role.staging ? [STAGING_GUILD_NOTIFICATION_EMAIL] : emails;
        if (!host || to.length === 0) {
          await db.from("guest_stop_notices").update({ sent_at: now.toISOString(), last_error: "no recipient" }).in("id", ids);
          continue;
        }
        const withButtons: EmailVisit[] = await Promise.all(
          visits.map(async (v) => ({
            ...v,
            buttons: await visitButtons(v, statusOf.get(v.event_id ?? "") ?? "shown", { origin: role.origin, secret: vars.GUEST_STOP_LINK_SECRET!, now }),
          })),
        );
        const email = buildGuestStopEmail({
          taproomName: host.business_name as string,
          street: (host.street_address as string | null) ?? null,
          timezone: (host.timezone as string) || "America/Los_Angeles",
          visits: withButtons,
          pageUrl: `${role.origin}/members/${host.slug as string}#events`,
          eventsUrl: `${role.origin}/portal/events`,
          staging: role.staging,
        });
        await sendRawEmail({ to, ...email });
        await db.from("guest_stop_notices").update({ sent_at: now.toISOString(), last_error: null }).in("id", ids);
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        console.error("sendGuestStopNotices: taproom failed", hostId, message);
        for (const id of ids) {
          const row = claimed.find((c) => c.id === id)!;
          await db.from("guest_stop_notices").update({ claimed_at: null, attempts: row.attempts + 1, last_error: message }).eq("id", id);
        }
      }
    }
  } catch (err) {
    console.error("sendGuestStopNotices failed", err);
  }
}
```

Check the portal Events route path with `ls src/routes | grep portal`. If the Events section is `/portal/events` (via `portal._sections`), keep it; otherwise use the real path and record a ruling.

`src/server.ts`, in the `*/15` branch:
```ts
      const { relinkGuestStops } = await import("./lib/events/guest-links.server");
      const { sendGuestStopNotices } = await import("./lib/events/guest-stop-notices.server");
      ctx.waitUntil(
        refreshAllIcsConnections()
          .finally(() => relinkGuestStops())
          .finally(() => sendGuestStopNotices()),
      );
```

`wrangler.jsonc`: add `"vars": { "SITE_ORIGIN": "https://iscbrewersguild.org" }`. `wrangler.staging.jsonc`: add `"vars": { "SITE_ORIGIN": "https://ie-brewers-guild-staging.boblelle77.workers.dev" }`. No `env` blocks (project gotcha).

Also extend `src/lib/events/guest-links-hooks.test.ts`'s cron case to require `sendGuestStopNotices` in `src/server.ts`.

- [ ] **Step 4: Run** `npx vitest run src/lib/events src/lib/email`, `npx tsc --noEmit 2>&1 | grep -c "error TS"`, `npm run build`.
Expected: PASS; `1`; the build succeeds. Then `grep -rl "claim_guest_stop_notices" dist/client` → no output (service-role sender not in the client bundle).

- [ ] **Step 5: Commit**
```bash
git add src/lib/email/send.ts src/lib/events/guest-stop-send.ts src/lib/events/guest-stop-send.test.ts src/lib/events/guest-stop-notices.server.ts src/lib/events/guest-links-hooks.test.ts src/server.ts wrangler.jsonc wrangler.staging.jsonc
git commit -m "feat(email): send queued Guild member visit emails every 15 minutes (live site: real taprooms; staging: Sample ones to the test inbox)"
```

---

### Task 6: The email buttons' page, `/visit/$token`

**Files:**
- Create: `src/lib/events/visit-link.ts` (pure: the page's state and the update it makes), `src/lib/events/visit-link.test.ts`
- Create: `src/lib/events/visit-link.server.ts` (`checkVisitLink`, `actOnVisitLink`)
- Create: `src/routes/visit.$token.tsx`, `src/components/site/VisitLinkPage.tsx`, `src/components/site/VisitLinkPage.test.ts`
- Modify: `src/routes/__root.tsx` (`BARE_ROUTE_PREFIXES` gains `"/visit"`), `vite.config.ts` (allow `visit-link.server.ts`)

**Interfaces:**
- Consumes: `verifyVisitLink` (Task 4); `event_hosts`.
- Produces:
  - `type VisitView = { state: "invalid" | "gone" } | { state: "ready" | "answered"; action: VisitAction; status: EventHostStatus; guestName: string; title: string | null; startsAt: string; endsAt: string | null; allDay: boolean; taproomName: string; timezone: string }`
  - `visitView(args: { action: VisitAction; link: { status; host_member_id } | null; hostId: string; event: { starts_at; ends_at; overlay_starts_at; overlay_status; title; all_day } | null; guestName; taproomName; timezone; now }): VisitView`
  - `statusFor(action: VisitAction): EventHostStatus` (approve→shown, decline→declined, hide→hidden)
  - `checkVisitLink({ token })` (GET), `actOnVisitLink({ token })` (POST) returning `VisitView`

**The rules:**
- **gone:** no link, the link now belongs to another taproom, the event is missing, or the visit is over.
- **answered:** the current status already equals `statusFor(action)`; or the action is approve/decline and the status is no longer `pending`; or the action is hide and the status is `hidden` or `declined`.
- **ready:** everything else.

- [ ] **Step 1: Write failing tests**

`src/lib/events/visit-link.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { statusFor, visitView } from "./visit-link";

const NOW = new Date("2026-10-07T18:00:00Z");
const base = {
  hostId: "mars", guestName: "Rolling Smoke BBQ", taproomName: "Bob's Brewery", timezone: "America/Los_Angeles", now: NOW,
  event: { starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", overlay_starts_at: null, overlay_status: null, title: null, all_day: false },
};
describe("visitView", () => {
  it("a waiting visit: ready to approve", () => {
    expect(visitView({ ...base, action: "approve", link: { status: "pending", host_member_id: "mars" } }).state).toBe("ready");
  });
  it("already answered on the Events page", () => {
    expect(visitView({ ...base, action: "approve", link: { status: "shown", host_member_id: "mars" } }).state).toBe("answered");
    expect(visitView({ ...base, action: "decline", link: { status: "hidden", host_member_id: "mars" } }).state).toBe("answered");
    expect(visitView({ ...base, action: "hide", link: { status: "declined", host_member_id: "mars" } }).state).toBe("answered");
  });
  it("hide a shown visit: ready", () => {
    expect(visitView({ ...base, action: "hide", link: { status: "shown", host_member_id: "mars" } }).state).toBe("ready");
  });
  it("gone: no link, another taproom, deleted, or over", () => {
    expect(visitView({ ...base, action: "approve", link: null }).state).toBe("gone");
    expect(visitView({ ...base, action: "approve", link: { status: "pending", host_member_id: "sample" } }).state).toBe("gone");
    expect(visitView({ ...base, action: "approve", event: null, link: { status: "pending", host_member_id: "mars" } }).state).toBe("gone");
    expect(visitView({ ...base, action: "approve", now: new Date("2026-10-10T00:00:00Z"), link: { status: "pending", host_member_id: "mars" } }).state).toBe("gone");
  });
  it("statusFor", () => {
    expect([statusFor("approve"), statusFor("decline"), statusFor("hide")]).toEqual(["shown", "declined", "hidden"]);
  });
});
```

`src/components/site/VisitLinkPage.test.ts` renders the presentational `VisitLinkCard({ view, done, busy, error, onConfirm })`:
```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisitLinkCard } from "./VisitLinkPage";

const ready = {
  state: "ready" as const, action: "approve" as const, status: "pending" as const, guestName: "Rolling Smoke BBQ", title: null,
  startsAt: "2026-10-03T00:00:00Z", endsAt: "2026-10-03T04:00:00Z", allDay: false, taproomName: "Bob's Brewery", timezone: "America/Los_Angeles",
};
const render = (o: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(VisitLinkCard, { view: ready, done: false, busy: false, error: null, onConfirm: () => {}, ...o } as never));

describe("VisitLinkCard", () => {
  it("ready: the visit and one button; nothing done yet", () => {
    const html = render({});
    expect(html).toContain("Rolling Smoke BBQ");
    expect(html).toContain("Friday, October 2");
    expect(html).toContain("Bob&#x27;s Brewery");
    expect(html).toContain(">Approve this visit<");
    expect(html).toContain("Nothing shows on your page until you approve.");
  });
  it("done: what happened and the Events page link", () => {
    const html = render({ done: true });
    expect(html).toContain("Approved. It&#x27;s on your page now.");
    expect(html).toContain("Changed your mind? Your Events page has every visit.");
    expect(html).toContain('href="/portal/events"');
  });
  it("decline and hide buttons", () => {
    expect(render({ view: { ...ready, action: "decline" } })).toContain(">Decline this visit<");
    expect(render({ view: { ...ready, action: "hide", status: "shown" } })).toContain(">Hide it from my page<");
  });
  it("answered and gone", () => {
    expect(render({ view: { ...ready, state: "answered", status: "shown" } })).toContain("This visit is already on your page.");
    expect(render({ view: { state: "gone" } })).toContain("This visit is no longer at your taproom.");
    expect(render({ view: { state: "invalid" } })).toContain("This link isn");
  });
});
```

- [ ] **Step 2: Run to verify they fail.** Run: `npx vitest run src/lib/events/visit-link.test.ts src/components/site/VisitLinkPage.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/events/visit-link.ts`:
```ts
import type { EventHostStatus } from "@/lib/supabase/types";
import type { VisitAction } from "@/lib/events/visit-link-token";

/** What the email button's page shows (spec, "The email buttons"). Pure. */
export type VisitDetails = {
  action: VisitAction;
  status: EventHostStatus;
  guestName: string;
  title: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  taproomName: string;
  timezone: string;
};
export type VisitView = { state: "invalid" | "gone" } | ({ state: "ready" | "answered" } & VisitDetails);

export function statusFor(action: VisitAction): EventHostStatus {
  return action === "approve" ? "shown" : action === "decline" ? "declined" : "hidden";
}

export function visitView(args: {
  action: VisitAction;
  hostId: string;
  link: { status: EventHostStatus; host_member_id: string } | null;
  event: { starts_at: string; ends_at: string | null; overlay_starts_at: string | null; overlay_status: string | null; title: string | null; all_day: boolean } | null;
  guestName: string;
  taproomName: string;
  timezone: string;
  now: Date;
}): VisitView {
  const { link, event } = args;
  if (!link || link.host_member_id !== args.hostId || !event) return { state: "gone" };
  const rescheduled = event.overlay_status === "rescheduled" && Boolean(event.overlay_starts_at);
  const startsAt = rescheduled ? (event.overlay_starts_at as string) : event.starts_at;
  const endsAt = rescheduled ? null : event.ends_at;
  const end = event.all_day ? new Date(startsAt).getTime() + 24 * 3600 * 1000 : endsAt ? new Date(endsAt).getTime() : new Date(startsAt).getTime() + 2 * 3600 * 1000;
  if (end <= args.now.getTime()) return { state: "gone" };
  const answered =
    link.status === statusFor(args.action) ||
    ((args.action === "approve" || args.action === "decline") && link.status !== "pending") ||
    (args.action === "hide" && (link.status === "hidden" || link.status === "declined"));
  return {
    state: answered ? "answered" : "ready",
    action: args.action,
    status: link.status,
    guestName: args.guestName,
    title: event.title?.trim() || null,
    startsAt,
    endsAt,
    allDay: event.all_day,
    taproomName: args.taproomName,
    timezone: args.timezone,
  };
}
```

`src/lib/events/visit-link.server.ts`:
```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { verifyVisitLink } from "@/lib/events/visit-link-token";
import { statusFor, visitView, type VisitView } from "@/lib/events/visit-link";
import type { EventHostStatus } from "@/lib/supabase/types";

/**
 * The email buttons' page (spec, "The email buttons"). Opening the page
 * only reads (checkVisitLink); the change happens only from its button
 * (actOnVisitLink), so an email scanner opening the link changes nothing.
 * Service role: nobody is signed in; the signed token is the permission.
 */
async function readSecret(): Promise<string | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { GUEST_STOP_LINK_SECRET?: string }).GUEST_STOP_LINK_SECRET;
}

async function load(token: string): Promise<{ view: VisitView; eventId?: string; hostId?: string }> {
  const secret = await readSecret();
  if (!secret) return { view: { state: "invalid" } };
  const v = await verifyVisitLink(token, secret);
  if (!v.valid) return { view: { state: v.reason === "expired" ? "gone" : "invalid" } };
  const db = await getSupabaseServiceRoleClient();
  const [{ data: link }, { data: event }, { data: host }] = await Promise.all([
    db.from("event_hosts").select("status, host_member_id, guest_name").eq("event_id", v.eventId).maybeSingle(),
    db.from("events").select("starts_at, ends_at, overlay_starts_at, overlay_status, title, all_day").eq("id", v.eventId).maybeSingle(),
    db.from("members").select("business_name, timezone").eq("id", v.hostId).maybeSingle(),
  ]);
  const view = visitView({
    action: v.action,
    hostId: v.hostId,
    link: link ? { status: link.status as EventHostStatus, host_member_id: link.host_member_id as string } : null,
    event: event as never,
    guestName: (link?.guest_name as string | null) ?? "A Guild member",
    taproomName: (host?.business_name as string | undefined) ?? "your taproom",
    timezone: (host?.timezone as string | undefined) || "America/Los_Angeles",
    now: new Date(),
  });
  return { view, eventId: v.eventId, hostId: v.hostId };
}

export const checkVisitLink = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => (await load(data.token)).view);

export const actOnVisitLink = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<VisitView> => {
    const { view, eventId, hostId } = await load(data.token);
    if (view.state !== "ready" || !eventId || !hostId) return view;
    const status = statusFor(view.action);
    const db = await getSupabaseServiceRoleClient();
    const { data: updated, error } = await db
      .from("event_hosts")
      .update({ status, status_set_by_user_id: null, updated_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("host_member_id", hostId)
      .select("event_id");
    if (error) throw new Error("That didn't save. Please try again.");
    if (!updated?.length) return { state: "gone" };
    return { ...view, state: "answered", status };
  });
```

`src/components/site/VisitLinkPage.tsx`:
- It exports `VisitLinkCard` (presentational) and `VisitLinkPage({ token, initial })` (state: `view`, `done`, `busy`, `error`; the button calls `actOnVisitLink`, sets `view` to the result and `done=true`).
- **Look:** like `routes/auth.confirm.tsx`. A dark page, the "IE BREWERS GUILD" brand row, and one light card (`bg-[#F9F6F0] rounded-[22px] p-[28px_18px]`).
- **Heading:** "A Guild member's visit".
- **Visit block:** the guest's name (+ " — title"); the day and time via the `when()` format (`Friday, October 2 · 5:00 – 9:00 pm`, using `dateParts`/`formatTimeRange`, or `toLocaleDateString` with `weekday/month long`); the taproom's name.
- **Ready:** the explanation line ("Nothing shows on your page until you approve." for approve/decline; "It's on your page now. Hiding takes it off your page, your food week and the homepage." for hide), then the button labeled "Approve this visit" / "Decline this visit" / "Hide it from my page".
- **Done:** "Approved. It's on your page now." / "Declined. It won't show on your page." / "Hidden. It's off your page.", chosen by the action.
- **Answered (not done):** by status: shown → "This visit is already on your page."; hidden → "This visit is already hidden from your page."; declined → "You already declined this visit.".
- **Below every state but invalid:** "Changed your mind? Your Events page has every visit." with `<a href="/portal/events">Your Events page</a>`.
- **Gone:** "This visit is no longer at your taproom."
- **Invalid:** "This link isn't valid. Open your Events page to see every visit."
- **Error:** `role="alert"` text.

`src/routes/visit.$token.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { checkVisitLink } from "@/lib/events/visit-link.server";
import { VisitLinkPage } from "@/components/site/VisitLinkPage";

/** A Guild member visit email's button (spec, "The email buttons"): read on open, change only on the button. */
export const Route = createFileRoute("/visit/$token")({
  loader: ({ params }) => checkVisitLink({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "A Guild member's visit — ISC Brewers Guild" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: function VisitRoute() {
    const { token } = Route.useParams();
    return <VisitLinkPage token={token} initial={Route.useLoaderData()} />;
  },
});
```

Then:
- **`__root.tsx`:** add `"/visit"` to `BARE_ROUTE_PREFIXES`.
- **`vite.config.ts`:** add `"src/lib/events/visit-link.server.ts"` to `excludeFiles`, with a comment: `checkVisitLink`/`actOnVisitLink` are called from `routes/visit.$token.tsx` and `VisitLinkPage`.
- **Regenerate the route tree** by running `npm run build` (TanStack's plugin writes `routeTree.gen.ts`).

- [ ] **Step 4: Run** `npx vitest run src/lib/events/visit-link.test.ts src/components/site/VisitLinkPage.test.ts`, then `npm run test`, `npx tsc --noEmit 2>&1 | grep -c "error TS"`, `npm run build`, and the RPC check.
Expected: PASS; `1`; the build succeeds; missing 0.

- [ ] **Step 5: Commit**
```bash
git add src/lib/events/visit-link.ts src/lib/events/visit-link.test.ts src/lib/events/visit-link.server.ts src/routes/visit.\$token.tsx src/components/site/VisitLinkPage.tsx src/components/site/VisitLinkPage.test.ts src/routes/__root.tsx vite.config.ts src/routeTree.gen.ts
git commit -m "feat(email): the visit page behind Approve, Decline and Hide — reads on open, acts only on its button"
```

---

### Task 7: The taproom's controls — the setting, pending and declined rows

**Files:**
- Modify: `src/lib/events/guest-stops.server.ts` (`listGuestStops` returns `mode` and `canChangeMode`; `setGuestStopStatus` accepts `declined`; new `setGuestStopsMode`)
- Modify: `src/components/admin/GuestStopsBox.tsx` (the setting; row states), `src/components/admin/GuestStopsBox.test.ts`
- Modify: `src/components/admin/FoodCalendarSection.tsx` (pending rows get Approve/Decline through the shared rows)
- Modify: `src/lib/guild/audit-log-coverage.test.ts` (per-function: `setGuestStopsMode`)

**Interfaces:**
- Consumes: `set_guest_stops_mode`, widened `set_event_host_status` (Task 1).
- Produces:
  - `listGuestStops` returns `{ street; stops; mode: GuestStopsMode; canChangeMode: boolean }`;
  - `setGuestStopStatus({ memberId, eventId, status: "shown" | "hidden" | "declined" })`;
  - `setGuestStopsMode({ memberId, mode }) → { ok: true }`;
  - `GuestStopRows({ stops, timezone, onSetStatus })` with `onSetStatus(row, status)`;
  - `GuestStopsList({ stops, timezone, street, mode, canChangeMode, onSetStatus, onSetMode, error })`.

- [ ] **Step 1: Failing tests.** Replace `GuestStopsBox.test.ts`'s render helper props with `{ stops, timezone, street, mode: "show", canChangeMode: true, onSetStatus: () => {}, onSetMode: () => {} }`, and keep its 4 cases. Add:

```ts
  it("a waiting visit: 'Waiting for approval' with Approve and Decline", () => {
    const html = render([row({ status: "pending" })]);
    expect(html).toContain("Waiting for approval");
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Decline<");
  });
  it("a declined visit: 'Declined' with Show", () => {
    const html = render([row({ status: "declined" })]);
    expect(html).toContain("Declined");
    expect(html).toContain(">Show<");
  });
  it("the setting: both choices, the current one checked; read-only without permission", () => {
    const html = render([]);
    expect(html).toContain("Show them on my page right away");
    expect(html).toContain("Ask me first");
    expect(html).toMatch(/value="show"[^>]*checked/);
    const ro = renderToStaticMarkup(createElement(GuestStopsList, { stops: [], timezone: "America/Los_Angeles", street: null, mode: "ask", canChangeMode: false, onSetStatus: () => {}, onSetMode: () => {} }));
    expect(ro).toMatch(/value="ask"[^>]*checked/);
    expect(ro).toContain("disabled");
    expect(ro).toContain("Only the owner or a full editor can change this.");
  });
```

In `audit-log-coverage.test.ts`, add `["src/lib/events/guest-stops.server.ts", "setGuestStopsMode"]` to the per-function list.

- [ ] **Step 2: Run to verify they fail.** Run: `npx vitest run src/components/admin/GuestStopsBox.test.ts src/lib/guild/audit-log-coverage.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

**`guest-stops.server.ts`:**
- **`listGuestStops`:** in the same `Promise.all`, read `members.select("street_address, guest_stops_mode")` and `supabase.rpc("is_member_full_editor", { target_member_id: data.memberId })`. Return `mode` (`"ask"` or `"show"`) and `canChangeMode: rpc.data === true`.
- **`setGuestStopStatus`'s validator:** accept `"shown" | "hidden" | "declined"`.
- **New:**
```ts
export const setGuestStopsMode = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; mode: GuestStopsMode }) => {
    if (data.mode !== "show" && data.mode !== "ask") throw new Error("Unknown setting.");
    return data;
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Please sign in again.");
    const { error } = await supabase.rpc("set_guest_stops_mode", { p_member_id: data.memberId, p_mode: data.mode });
    if (error) throw new Error("That didn't save — only the owner or a full editor can change this.");
    await recordAuditLogIfImpersonating({ memberId: data.memberId, tableName: "members", rowId: data.memberId, action: "update" });
    return { ok: true as const };
  });
```

**`GuestStopsBox.tsx`:**
- **`useGuestStops`:** keeps `mode`/`canChangeMode` state, exposes `setStatus(row, status)` (optimistic, rolled back on error) and `setMode(mode)` (optimistic; after success, reload the list, since switching to show turns pending into shown).
- **`GuestStopRows`:** renders by status:
  - `shown` → "On your page" + **Hide** (→ `hidden`);
  - `hidden` → faded, "Hidden from your page" + **Show** (→ `shown`);
  - `pending` → "Waiting for approval" + **Approve** (→ `shown`) and **Decline** (→ `declined`);
  - `declined` → faded, "Declined" + **Show** (→ `shown`).
- **`GuestStopsList`:** adds, under the intro, a radio group (fieldset, legend "When a Guild member lists a stop here"):
  - `<input type="radio" name="guest-stops-mode" value="show">` "Show them on my page right away";
  - `value="ask"` "Ask me first";
  - `checked` by `mode`, `disabled` without `canChangeMode`, with the note "Only the owner or a full editor can change this." when disabled.
- **The footnote** gains: "With Ask me first, a new visit waits here (and in your email) until you approve it."

**`FoodCalendarSection.tsx`:** pass `onSetStatus={guestStops.setStatus}` (the rows now handle pending).

- [ ] **Step 4: Run** `npm run test`, `npx tsc --noEmit 2>&1 | grep -c "error TS"`, `npm run build`, and the RPC check.
Expected: pass; `1`; the build succeeds; missing 0.

- [ ] **Step 5: Commit**
```bash
git add src/lib/events/guest-stops.server.ts src/components/admin/GuestStopsBox.tsx src/components/admin/GuestStopsBox.test.ts src/components/admin/FoodCalendarSection.tsx src/lib/guild/audit-log-coverage.test.ts
git commit -m "feat(admin): Show right away or Ask me first; Approve, Decline and Waiting for approval on the Events and Food pages"
```

---

### Task 8: The Mobile member's page links only shown visits

**Files:**
- Modify: `src/lib/events/guest-info.ts` (`loadShownHostsForGuest`; remove `loadTaproomHosts`)
- Modify: `src/lib/events/guest-display.ts` (`attachHosts` replaces `withHosts`), `src/lib/events/guest-display.test.ts`
- Modify: `src/lib/members/member-profile.server.ts`
- Test: `src/lib/events/guest-reads.test.ts` (append)

**Interfaces:**
- Produces:
  - `loadShownHostsForGuest(supabase, guestMemberId, now): Promise<Map<string, { name: string; slug: string }>>`. It's keyed by event id: the shown links of this guest's upcoming events, with their taproom's name and slug, in one date-bounded query.
  - `attachHosts<T extends EventRow>(events: T[], hosts: Map<string, { name; slug }>): Array<T & { host?: { name; slug } }>`

- [ ] **Step 1: Failing tests.** In `guest-display.test.ts`, replace the `withHosts` describe with:
```ts
describe("attachHosts (a Mobile member's own stops)", () => {
  it("only stops with a shown link get the taproom", () => {
    const out = attachHosts([ev({ id: "a" }), ev({ id: "b" })], new Map([["a", { name: "Mars Brewing Co.", slug: "mars" }]]));
    expect(out[0].host).toEqual({ name: "Mars Brewing Co.", slug: "mars" });
    expect(out[1].host).toBeUndefined();
  });
});
```
Append to `guest-reads.test.ts`:
```ts
describe("a Mobile member's shown links", () => {
  it("one bounded query: shown links of this member's upcoming events, with the taproom", async () => {
    const { client, calls } = fakeSupabase({
      event_hosts: [{ event_id: "e1", events: { member_id: "truck" }, host: { slug: "mars", business_name: "Mars Brewing Co." } }],
    });
    const map = await loadShownHostsForGuest(client, "truck", NOW);
    expect(map.get("e1")).toEqual({ name: "Mars Brewing Co.", slug: "mars" });
    const ops = opsOf(calls, "event_hosts");
    expect(ops).toContainEqual(["eq", ["status", "shown"]]);
    expect(ops).toContainEqual(["eq", ["events.member_id", "truck"]]);
    expectUpcomingWindow(ops, "events");
  });
});
```
(Import `loadShownHostsForGuest` at the top.)

- [ ] **Step 2: Run to verify they fail.** Run: `npx vitest run src/lib/events/guest-display.test.ts src/lib/events/guest-reads.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

`guest-info.ts`:
```ts
/** A Mobile member's own stops that a Guild taproom shows: their page links only these (Part 2). */
export async function loadShownHostsForGuest(
  supabase: SupabaseClient,
  guestMemberId: string,
  now: Date,
): Promise<Map<string, { name: string; slug: string }>> {
  const { data, error } = await supabase
    .from("event_hosts")
    .select("event_id, events!inner(member_id), host:members!event_hosts_host_member_id_fkey(slug, business_name)")
    .eq("status", "shown")
    .eq("events.member_id", guestMemberId)
    .or(upcomingStopsFilter(now), { referencedTable: "events" });
  if (error) throw error;
  const out = new Map<string, { name: string; slug: string }>();
  for (const row of (data ?? []) as unknown as Array<{ event_id: string; host: { slug: string; business_name: string } | Array<{ slug: string; business_name: string }> | null }>) {
    const host = Array.isArray(row.host) ? row.host[0] : row.host;
    if (host) out.set(row.event_id, { name: host.business_name, slug: host.slug });
  }
  return out;
}
```

Delete `loadTaproomHosts`.

In `guest-display.ts`, replace `withHosts` with:
```ts
export function attachHosts<T extends EventRow>(events: T[], hosts: Map<string, { name: string; slug: string }>): Array<T & { host?: { name: string; slug: string } }> {
  if (hosts.size === 0) return events;
  return events.map((event) => {
    const host = hosts.get(event.id);
    return host ? { ...event, host } : event;
  });
}
```

Remove the now-unused `matchHost`/`HostCandidate` import.

In `member-profile.server.ts`, the mobile branch becomes `loadShownHostsForGuest(supabase, member.id, args.now).catch(() => new Map())`, and the events line becomes `attachHosts(..., taproomHosts)`.

**Check the embed** against the real database once with a read-only probe. The FK name `event_hosts_host_member_id_fkey` is Postgres's default; confirm it with `select conname from pg_constraint where conrelid = 'public.event_hosts'::regclass;` through `npx supabase db query --linked`. If it differs, use the real name and record a ruling.

- [ ] **Step 4: Run** `npm run test`, `npx tsc --noEmit 2>&1 | grep -c "error TS"`, `npm run build`. Expected: pass; `1`; success.

- [ ] **Step 5: Commit**
```bash
git add src/lib/events/guest-info.ts src/lib/events/guest-display.ts src/lib/events/guest-display.test.ts src/lib/events/guest-reads.test.ts src/lib/members/member-profile.server.ts
git commit -m "feat(profile): a Mobile member's stop links to the taproom only while the taproom shows it"
```

---

### Task 9: The secret, artboards, docs, and the hand check

**Files:**
- Modify: `docs/design/artboards/GuildVendorEmails.dc.html` (GV2), `docs/design/artboards/GuildVendorFood.dc.html` (GV1), the live main canvas (read first, publish only the changed files)
- Modify: `docs/member-profiles.md` (the Part 1 section gains Part 2; the Transactional email table gains a row), `docs/design/README.md` (the GV1 and GV2 rows)

- [ ] **Step 1: The secret.** Give the owner step-by-step Cloudflare instructions for both Workers (`ie-brewers-guild` and `ie-brewers-guild-staging`): Settings → Variables and Secrets → Add → type **Secret**, name `GUEST_STOP_LINK_SECRET`, and a long random value. Generate one per Worker locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, and tell the owner to run that themselves and paste the output into Cloudflare, never into chat. Without it, the sender logs "GUEST_STOP_LINK_SECRET is not set" and sends nothing, and the visit page reads "This link isn't valid".

- [ ] **Step 2: Artboards.** Update them to match the spec:
  - **GV2:**
    - the setting's place is "your Events page", not the Food page;
    - recipients are "the taproom's owner and editors";
    - the footer copy is the spec's;
    - a fourth email, "Canceled: …";
    - a small board of the `/visit` page in its ready and done states.
  - **GV1:** the box shows:
    - the setting's two radios;
    - a "Waiting for approval" row with Approve / Decline;
    - a "Declined" row with Show.

  Edit the repo copies, then read the live canvas, merge, and publish only the changed files (standing rule).

- [ ] **Step 3: Docs.**
  - **`docs/member-profiles.md`:**
    - extend "Guild Mobile members at taprooms" with a "Part 2" list: the setting, the statuses, the emails and batching, the `/visit` page, staging's Sample-only test mail, and the `GUEST_STOP_LINK_SECRET` and `SITE_ORIGIN` settings;
    - add a row to the Transactional email table: "Guild member lists, changes or cancels a visit at a taproom | the taproom's owner and full editors | one email per taproom per 15 minutes, with Hide, or Approve / Decline when Ask me first is on".
  - **`docs/design/README.md`:** GV1 and GV2 rows say built, with the components.

- [ ] **Step 4: Push and check by hand.** Push to `staging` and wait for the deploy (`npx wrangler deployments list --name ie-brewers-guild-staging`). **Ask the owner** before publishing the Samples. Then run the spec's hand check:
  1. Sample Brewing turns on Ask me first.
  2. Sample Taco Truck adds a visit there.
  3. The approval email arrives at the test inbox.
  4. Approve from the email's page.
  5. Change the time: "Changed" arrives.
  6. Cancel: "Canceled" arrives.
  7. Switch to Show right away and add another visit: "is coming" arrives, with Hide.

  Then clean up: delete the test visits and return the Samples to the owner's chosen status.

- [ ] **Step 5: Commit and push** the docs.

---

## Self-review notes

- **Spec coverage:**

  | Spec section | Task |
  |---|---|
  | The setting, its permissions, switching to show | 1, 7 |
  | Statuses and labels | 1, 7 |
  | The linker's status by mode, a move, a same-host change | 2 |
  | The member's page links only shown | 8 |
  | What sends an email (shown/pending, upcoming) | 2 (notes), 1 (trigger) |
  | The email table, subjects, summary, footer | 4 |
  | The queue: notes, snapshot, claim, retries, no recipient | 1, 3, 5 |
  | Staging vs live | 1 (claim filter), 5 |
  | The button page and token | 4, 6 |
  | The Food page list with Approve/Decline | 7 |
  | Testing list | 1–8 |
  | Hand check | 9 |

- **Rulings already taken here** (beyond the spec):
  - **A stop that comes back** after a cancel gets a fresh "new"/"request" note. The spec only said the flag clears.
  - **Notes written for a hidden or declined link:** none, including on a move.
  - **The site's identity** comes from a new `SITE_ORIGIN` var in each wrangler config, because a cron has no request to read the host from.
