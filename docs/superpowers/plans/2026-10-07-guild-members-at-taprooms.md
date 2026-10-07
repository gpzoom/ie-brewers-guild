# Guild Mobile Members at Taprooms (Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Guild Mobile member's stop at a Guild producer's taproom counts as one of the taproom's events:
- it shows in the taproom's Upcoming events, and in its Food this week for food members;
- it's on the homepage as the taproom's card;
- it links both ways;
- the taproom can Hide or Show it.

**Architecture:**
- **The link table.** A new `event_hosts` table stores "this stop is at this taproom" plus `shown`/`hidden`. Only the service role writes rows. A SECURITY DEFINER function lets the host's people (and Guild admins) flip `shown`/`hidden`.
- **The linker.** A pure decision function, reusing the Members map's matching (`hostFor` in `mobile-stops.ts`), says which rows to upsert or delete. A server wrapper runs it after a Mobile member's saves, after their calendar sync, and in the 15-minute cron.
- **What reads the links:**
  - the taproom's profile (events and food week);
  - the homepage carousel;
  - the Events-page box.
- **The member's own page** links back by live matching, so a hidden link still points to the taproom.

**Tech Stack:** TanStack Start (React 19), Cloudflare Workers cron, Supabase Postgres + RLS (pgTAP), Vitest (node env, `src/**/*.test.ts`; components via `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md`. Artboards: GV1 (Events page box), GV3 (both profiles), GV4 (homepage card), in `docs/design/artboards/GuildVendor*.dc.html`.

## Global Constraints

- Work on `staging` only. Never merge to `main` without the owner's "go".
- The database is shared with production. **Before `npx supabase db push`, stop and ask the owner.**
- Hosts are **published producers only**. Guests are **published Mobile members' events** (`kind = 'event'`).
- Linking covers only stops that **end in the future, up to 60 days ahead**.
- A food guest is one whose **first category** (by `sort_order`) is `food-truck` or `pop-up-food-vendor`.
- Copy, US spelling, from the spec and artboards:
  - "GUILD MEMBER"
  - "with *Name*"
  - "Guild taproom →"
  - "at *Taproom* →"
  - "Guild members at your taproom"
  - "On your page" / "Hidden from your page"
  - "Hide" / "Show"
  - "from their schedule"
  - "No Guild members have listed a stop here yet."
  - "with a Guild member"
  - "See their events →"
- Every Guild-admin change through Edit as them is audited (`recordAuditLogIfImpersonating`).
- Tests: `npm run test`, `npm run test:db`, `npm run build`. `npx tsc --noEmit` has exactly 1 known error (`survey.tsx`).

## Review Focus

1. **A stop moved from one taproom to another.** The old taproom's Hide must not carry over: it's shown at the new one. If the stop moves back to the first taproom, it's shown again too, because the row was replaced. (Test in Task 3.)
2. **A canceled or hidden stop.** It must not appear on the taproom's events, food week or homepage, but its link row stays, so un-canceling restores it. (Tests in Tasks 5 and 7.)
3. **A taproom with no food calendar and no kitchen, but a Guild food truck this week.** The food week must still appear, showing the truck that day. (Test in Task 5.)
4. **The taproom's own food calendar lists "Sample Taco Truck Co." on the same day as the Guild stop.** It shows once, as the linked Guild entry. (Test in Task 5.)
5. **The linker running on both Workers at once.** Nothing is doubled (the primary key is `event_id`) and a hide is never reset. (Test in Task 3, "same host keeps status".)

---

### Task 1: The `event_hosts` table, its RLS and `set_event_host_status`

**Files:**
- Create: `supabase/migrations/20261007100000_event_hosts.sql`
- Create: `supabase/tests/event_hosts.test.sql`
- Modify: `src/lib/supabase/types.ts` (add `EventHostRow`, `EventHostStatus`)

**Interfaces:**
- Produces:
  - the table `public.event_hosts(event_id uuid pk, host_member_id uuid, status text, status_set_by_user_id uuid, created_at, updated_at)`
  - `public.set_event_host_status(p_event_id uuid, p_status text) returns void`
  - the TS types `EventHostStatus = "shown" | "hidden"` and `EventHostRow`

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/event_hosts.test.sql`. The fixtures: m1 is a published producer owned by f0..01 (with f0..02 as its editor and f0..03 as its Photos & events editor), m4 is a published mobile member, f0..04 is a Guild admin, and f0..06 is a stranger.
```sql
-- Guild Mobile members at taprooms (20261007100000_event_hosts.sql): a stop
-- linked to the taproom it's at. Only the service role writes rows; the
-- host's people and Guild admins flip shown/hidden through
-- set_event_host_status. Visitors read shown rows only.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(10);

insert into _tap (line) select has_table('public', 'event_hosts', 'event_hosts exists');

insert into public.events (id, member_id, source, kind, title, starts_at, venue_name)
values
  ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'Tacos', now() + interval '1 day', 'PgTap Brewing'),
  ('f3000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event', 'More tacos', now() + interval '2 days', 'PgTap Brewing');
insert into public.event_hosts (event_id, host_member_id, status) values
  ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'shown'),
  ('f3000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000001', 'hidden');

set local role anon;
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts), 1, 'a visitor reads only the shown link');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts), 2, 'the host''s Photos & events editor reads both');
insert into _tap (line) select lives_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'hidden') $q$,
  'the host''s editor can hide a stop');
insert into _tap (line) select is(
  (select status from public.event_hosts where event_id = 'f3000000-0000-4000-8000-000000000011'), 'hidden',
  'it is hidden');
insert into _tap (line) select throws_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'pending') $q$,
  '22023', null, 'an unknown status is refused');
insert into _tap (line) select throws_ok(
  $q$ insert into public.event_hosts (event_id, host_member_id) values ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000002') $q$,
  '42501', null, 'a member can''t write link rows');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  (select count(*)::int from public.event_hosts where status = 'hidden'), 0, 'a stranger reads no hidden link');
insert into _tap (line) select throws_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'shown') $q$,
  '42501', null, 'a stranger can''t show or hide');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.set_event_host_status('f3000000-0000-4000-8000-000000000011', 'shown') $q$,
  'a Guild admin can show it again');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
```

- [ ] **Step 2: Write the migration**

`supabase/migrations/20261007100000_event_hosts.sql`:
```sql
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

create policy "event_hosts: public reads shown links of published hosts"
  on public.event_hosts for select
  using (
    status = 'shown'
    and exists (select 1 from public.members m where m.id = host_member_id and m.status = 'published')
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
```

- [ ] **Step 3: Ask the owner, push, run the database tests**

Run: `npx supabase db push --dry-run --linked`
Expected: only `20261007100000_event_hosts.sql`.

**STOP.** Ask the owner: "One database change for Part 1: a new table linking a Mobile member's stop to the taproom it's at, plus who can hide it. It only adds; the live site is unaffected. OK to apply it to the shared database?" After a yes:

Run: `npx supabase db push --linked --yes`, then `npm run test:db`
Expected: every file passes, including `event_hosts.test.sql` (10/10).

- [ ] **Step 4: Add the types**

In `src/lib/supabase/types.ts`, after `EventRow`:
```ts
/** Guild Mobile members at taprooms (20261007100000_event_hosts.sql). Part 2 adds pending/declined. */
export type EventHostStatus = "shown" | "hidden";

export type EventHostRow = {
  event_id: string;
  host_member_id: string;
  status: EventHostStatus;
  status_set_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007100000_event_hosts.sql supabase/tests/event_hosts.test.sql src/lib/supabase/types.ts
git commit -m "feat(db): event_hosts — a Mobile member's stop linked to the taproom it's at, with Hide/Show"
```

---

### Task 2: One matching rule for hosts (no coordinates needed)

**Files:**
- Modify: `src/lib/members/mobile-stops.ts`
- Test: `src/lib/members/mobile-stops.test.ts` (append)

**Interfaces:**
- Consumes: `StopEvent`, `normalizeBusinessName`, `HostLocation` (unchanged).
- Produces:
  - `type HostCandidate = { id: string; name: string; slug: string; city: string; street: string | null }`
  - `matchHost<T extends Pick<HostCandidate, "name" | "city" | "street">>(stop: Pick<StopEvent, "venue_name" | "address" | "city">, hosts: T[]): T | null`

  This is the rule `hostFor` used. `placeStop` now calls `matchHost`; its behavior is unchanged.

- [ ] **Step 1: Append failing tests**
```ts
import { matchHost } from "./mobile-stops"; // merge into the top import

describe("matchHost (the one rule for which taproom a stop is at)", () => {
  const hosts = [
    { id: "a", name: "Mars Brewing Co.", slug: "mars", city: "Rancho Cucamonga", street: "9728 6th St" },
    { id: "b", name: "Sample Brewing Co.", slug: "s-riv", city: "Riverside", street: "3750 Main Street" },
    { id: "c", name: "Sample Brewing Co.", slug: "s-ont", city: "Ontario", street: "100 Euclid Ave" },
  ];
  it("by Google's name for the venue", () => {
    expect(matchHost({ venue_name: "Mars Brewing Company", address: null, city: null }, hosts)?.id).toBe("a");
  });
  it("by the picked address", () => {
    expect(matchHost({ venue_name: "Somewhere", address: "9728 6th St, Rancho Cucamonga, CA 91730, USA", city: null }, hosts)?.id).toBe("a");
  });
  it("several locations: the one in the stop's city, else none", () => {
    expect(matchHost({ venue_name: "Sample Brewing Co.", address: null, city: "Ontario" }, hosts)?.id).toBe("c");
    expect(matchHost({ venue_name: "Sample Brewing Co.", address: null, city: "Corona" }, hosts)).toBeNull();
  });
  it("no venue and no address: none", () => {
    expect(matchHost({ venue_name: null, address: null, city: "Riverside" }, hosts)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail** (`matchHost` isn't exported)

Run: `npx vitest run src/lib/members/mobile-stops.test.ts`

- [ ] **Step 3: Replace `hostFor` with an exported generic `matchHost`, and have `placeStop` use it**
```ts
export type HostCandidate = { id: string; name: string; slug: string; city: string; street: string | null };

/** Which taproom a stop is at: by venue name, else by street address; several locations -> the one in the stop's city. */
export function matchHost<T extends { name: string; city: string; street: string | null }>(
  e: Pick<StopEvent, "venue_name" | "address" | "city">,
  hosts: T[],
): T | null {
  const venue = clean(e.venue_name);
  const address = clean(e.address).toLowerCase();
  const byName = venue ? hosts.filter((h) => normalizeBusinessName(h.name) === normalizeBusinessName(venue)) : [];
  const byStreet = address ? hosts.filter((h) => h.street && address.startsWith(h.street.trim().toLowerCase())) : [];
  const candidates = byName.length ? byName : byStreet;
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const city = clean(e.city).toLowerCase();
    return candidates.find((h) => city && h.city.trim().toLowerCase() === city) ?? null;
  }
  return null;
}
```
Delete the private `hostFor`. In `placeStop`, replace `const host = hostFor(e, hosts);` with `const host = matchHost(e, hosts);`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/members`
Expected: PASS, including every existing `placeStop` and `summarizeStops` test.

- [ ] **Step 5: Commit**
```bash
git add src/lib/members/mobile-stops.ts src/lib/members/mobile-stops.test.ts
git commit -m "refactor(members): matchHost — one rule for which taproom a stop is at"
```

---

### Task 3: The linker's decision (pure)

**Files:**
- Create: `src/lib/events/guest-links.ts`, `src/lib/events/guest-links.test.ts`

**Interfaces:**
- Consumes: `matchHost`, `HostCandidate` (Task 2); `stopStart` (mobile-stops); `EventHostStatus` (Task 1).
- Produces:
  - `GUEST_LINK_DAYS = 60`
  - `type GuestStop = { id: string; member_id: string; venue_name: string | null; address: string | null; city: string | null; starts_at: string; ends_at: string | null; all_day: boolean; overlay_status: string | null; overlay_starts_at: string | null }`
  - `type ExistingLink = { event_id: string; host_member_id: string; status: EventHostStatus }`
  - `decideGuestLinks(args: { stops: GuestStop[]; hosts: HostCandidate[]; existing: ExistingLink[]; now: Date }): { upserts: Array<{ event_id: string; host_member_id: string; status: "shown" }>; deletes: string[] }`

  Only the stops passed in are decided. Existing rows for stops not passed in are left alone (a per-member run passes only that member's stops). Past or too-far stops are skipped: they're neither linked nor unlinked.

- [ ] **Step 1: Write the failing tests**

`src/lib/events/guest-links.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { decideGuestLinks, type GuestStop } from "./guest-links";

const NOW = new Date("2026-10-07T18:00:00Z");
const hosts = [
  { id: "mars", name: "Mars Brewing Co.", slug: "mars", city: "Rancho Cucamonga", street: "9728 6th St" },
  { id: "sample", name: "Sample Brewing Co.", slug: "sample", city: "Riverside", street: "3750 Main Street" },
];
const stop = (o: Partial<GuestStop>): GuestStop => ({
  id: "e1", member_id: "truck", venue_name: "Mars Brewing Co.", address: null, city: null,
  starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  overlay_status: null, overlay_starts_at: null, ...o,
});

describe("decideGuestLinks", () => {
  it("a new stop at a taproom: link it, shown", () => {
    expect(decideGuestLinks({ stops: [stop({})], hosts, existing: [], now: NOW })).toEqual({
      upserts: [{ event_id: "e1", host_member_id: "mars", status: "shown" }], deletes: [],
    });
  });

  it("same taproom as before: nothing to do (a hide is kept; both Workers running agree)", () => {
    const r = decideGuestLinks({ stops: [stop({})], hosts, existing: [{ event_id: "e1", host_member_id: "mars", status: "hidden" }], now: NOW });
    expect(r).toEqual({ upserts: [], deletes: [] });
  });

  it("moved to another taproom: relinked and shown there (the old hide doesn't follow)", () => {
    const r = decideGuestLinks({
      stops: [stop({ venue_name: "Sample Brewing Co." })], hosts,
      existing: [{ event_id: "e1", host_member_id: "mars", status: "hidden" }], now: NOW,
    });
    expect(r.upserts).toEqual([{ event_id: "e1", host_member_id: "sample", status: "shown" }]);
  });

  it("no longer at a taproom: unlinked", () => {
    const r = decideGuestLinks({
      stops: [stop({ venue_name: "Downtown farmers market" })], hosts,
      existing: [{ event_id: "e1", host_member_id: "mars", status: "shown" }], now: NOW,
    });
    expect(r).toEqual({ upserts: [], deletes: ["e1"] });
  });

  it("canceled stays linked (places that show it skip canceled ones)", () => {
    const r = decideGuestLinks({ stops: [stop({ overlay_status: "canceled" })], hosts, existing: [], now: NOW });
    expect(r.upserts).toHaveLength(1);
  });

  it("past stops and stops more than 60 days out are left alone", () => {
    const past = stop({ id: "old", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-01T03:00:00Z" });
    const far = stop({ id: "far", starts_at: "2026-12-20T00:00:00Z", ends_at: null });
    const r = decideGuestLinks({
      stops: [past, far], hosts,
      existing: [{ event_id: "old", host_member_id: "sample", status: "shown" }], now: NOW,
    });
    expect(r).toEqual({ upserts: [], deletes: [] });
  });

  it("a stop with no end counts as on for 2 hours", () => {
    const justStarted = stop({ starts_at: "2026-10-07T17:00:00Z", ends_at: null });
    expect(decideGuestLinks({ stops: [justStarted], hosts, existing: [], now: NOW }).upserts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/events/guest-links.test.ts`
Expected: FAIL, because the module doesn't exist yet.

- [ ] **Step 3: Write `guest-links.ts`**
```ts
import { matchHost, stopStart, type HostCandidate } from "@/lib/members/mobile-stops";
import type { EventHostStatus } from "@/lib/supabase/types";

/**
 * Which Mobile members' stops are at which Guild taproom
 * (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md).
 * Pure: the server wrapper (guest-links.server.ts) loads the inputs and
 * writes the result with the service role. Same matching as the Members
 * map (matchHost). A hide is kept while the stop stays at that taproom;
 * a move to another taproom starts shown there.
 */
export const GUEST_LINK_DAYS = 60;
const DEFAULT_LENGTH_MS = 2 * 3600 * 1000;

export type GuestStop = {
  id: string;
  member_id: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  overlay_status: string | null;
  overlay_starts_at: string | null;
};

export type ExistingLink = { event_id: string; host_member_id: string; status: EventHostStatus };

function inWindow(s: GuestStop, now: Date): boolean {
  const start = new Date(stopStart({ ...s, overlay_status: s.overlay_status as never } as never)).getTime();
  const end = s.all_day
    ? start + 24 * 3600 * 1000
    : s.ends_at && s.overlay_status !== "rescheduled"
      ? Math.max(new Date(s.ends_at).getTime(), start)
      : start + DEFAULT_LENGTH_MS;
  return end > now.getTime() && start <= now.getTime() + GUEST_LINK_DAYS * 24 * 3600 * 1000;
}

export function decideGuestLinks(args: {
  stops: GuestStop[];
  hosts: HostCandidate[];
  existing: ExistingLink[];
  now: Date;
}): { upserts: Array<{ event_id: string; host_member_id: string; status: "shown" }>; deletes: string[] } {
  const existing = new Map(args.existing.map((l) => [l.event_id, l]));
  const upserts: Array<{ event_id: string; host_member_id: string; status: "shown" }> = [];
  const deletes: string[] = [];
  for (const s of args.stops) {
    if (!inWindow(s, args.now)) continue;
    const host = matchHost(s, args.hosts);
    const before = existing.get(s.id);
    if (!host) {
      if (before) deletes.push(s.id);
      continue;
    }
    if (before && before.host_member_id === host.id) continue;
    upserts.push({ event_id: s.id, host_member_id: host.id, status: "shown" });
  }
  return { upserts, deletes };
}
```
If `stopStart`'s parameter type won't accept `GuestStop`, add a small local `startOf(s)` instead: `s.overlay_status === "rescheduled" && s.overlay_starts_at ? s.overlay_starts_at : s.starts_at`. That's the same rule. Ledger a ruling either way.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/events/guest-links.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**
```bash
git add src/lib/events/guest-links.ts src/lib/events/guest-links.test.ts
git commit -m "feat(events): the linker's decision — which Mobile member stops are at which taproom"
```

---

### Task 4: Run the linker after saves, after sync and in the cron

**Files:**
- Create: `src/lib/events/guest-links.server.ts`
- Modify: `src/lib/events/events.server.ts` (`createEvent`, `updateEvent`, `deleteEvent`, `setEventOverlay`, `clearEventOverlay`, `toggleEventHidden`)
- Modify: `src/lib/events/calendar-connection.server.ts` (`syncOneIcsConnection`, after a successful sync)
- Modify: `src/server.ts` (the `*/15` branch)
- Create: `src/lib/events/guest-links-hooks.test.ts`

**Interfaces:**
- Consumes: `decideGuestLinks`, `GuestStop`, `ExistingLink` (Task 3); `HostCandidate` (Task 2).
- Produces:
  - `relinkGuestStops(scope: { memberId?: string }): Promise<void>`. It never throws. With a `memberId`, it relinks only when that member is a published Mobile member, and does nothing otherwise.

- [ ] **Step 1: Write the failing hook test (source-level, like the audit coverage test)**

`src/lib/events/guest-links-hooks.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Every way a stop changes reruns the linker for that member, so a
// taproom's page is never stale for long (the cron is the safety net).
describe("the linker runs after every stop change", () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
  it.each(["createEvent", "updateEvent", "deleteEvent", "setEventOverlay", "clearEventOverlay", "toggleEventHidden"])(
    "events.server.ts: %s",
    (fn) => {
      const s = src("src/lib/events/events.server.ts");
      const start = s.indexOf(`export const ${fn}`);
      expect(start).toBeGreaterThan(-1);
      const next = s.indexOf("\nexport ", start + 1);
      expect(s.slice(start, next === -1 ? undefined : next)).toContain("relinkGuestStops");
    },
  );
  it("calendar sync", () => {
    expect(src("src/lib/events/calendar-connection.server.ts")).toContain("relinkGuestStops");
  });
  it("the 15-minute cron", () => {
    expect(src("src/server.ts")).toContain("relinkGuestStops");
  });
});
```
Before writing it, check the real export names in `events.server.ts` (`grep -n "^export const" src/lib/events/events.server.ts`), and use exactly those mutation names.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/events/guest-links-hooks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `guest-links.server.ts`**
```ts
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { decideGuestLinks, type ExistingLink, type GuestStop } from "@/lib/events/guest-links";
import type { HostCandidate } from "@/lib/members/mobile-stops";

const STOP_COLUMNS = "id, member_id, venue_name, address, city, starts_at, ends_at, all_day, overlay_status, overlay_starts_at";

/**
 * Relinks Mobile members' upcoming stops to the Guild taprooms they're at
 * (guest-links.ts decides). Service role: links are written only here.
 * Never throws -- a save or sync that succeeded must not fail because of it.
 */
export async function relinkGuestStops(scope: { memberId?: string } = {}): Promise<void> {
  try {
    const db = await getSupabaseServiceRoleClient();
    let mobileQuery = db.from("members").select("id").eq("status", "published").eq("member_type", "mobile");
    if (scope.memberId) mobileQuery = mobileQuery.eq("id", scope.memberId);
    const { data: mobiles, error: mErr } = await mobileQuery;
    if (mErr) throw mErr;
    const mobileIds = (mobiles ?? []).map((m) => m.id as string);
    if (mobileIds.length === 0) return;

    const [{ data: hostRows, error: hErr }, { data: stopRows, error: sErr }] = await Promise.all([
      db.from("members").select("id, slug, business_name, city, street_address").eq("status", "published").eq("member_type", "producer"),
      db.from("events").select(STOP_COLUMNS).in("member_id", mobileIds).eq("kind", "event"),
    ]);
    if (hErr) throw hErr;
    if (sErr) throw sErr;
    const stops = (stopRows ?? []) as GuestStop[];
    const hosts: HostCandidate[] = (hostRows ?? []).map((h) => ({
      id: h.id as string,
      slug: h.slug as string,
      name: h.business_name as string,
      city: (h.city as string) ?? "",
      street: (h.street_address as string | null) ?? null,
    }));
    const ids = stops.map((s) => s.id);
    const { data: existingRows, error: eErr } = ids.length
      ? await db.from("event_hosts").select("event_id, host_member_id, status").in("event_id", ids)
      : { data: [], error: null };
    if (eErr) throw eErr;

    const { upserts, deletes } = decideGuestLinks({
      stops,
      hosts,
      existing: (existingRows ?? []) as ExistingLink[],
      now: new Date(),
    });
    if (upserts.length) {
      const { error } = await db
        .from("event_hosts")
        .upsert(upserts.map((u) => ({ ...u, status_set_by_user_id: null, updated_at: new Date().toISOString() })), { onConflict: "event_id" });
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await db.from("event_hosts").delete().in("event_id", deletes);
      if (error) throw error;
    }
  } catch (err) {
    console.error("relinkGuestStops failed", err);
  }
}
```

- [ ] **Step 4: Hook it in**
  - **`events.server.ts`:** in each mutation listed in Step 1, after the success path and before `return`, add `await relinkGuestStops({ memberId })`. The `memberId` is the event's member: use the row the handler already has (`created.member_id`, `updated[0].member_id`, `deleted[0].member_id`, and so on). Where a handler doesn't select `member_id`, add it to its `.select(...)`. Import `relinkGuestStops` from `@/lib/events/guest-links.server`.
  - **`calendar-connection.server.ts`:** at the end of a successful `syncOneIcsConnection` (after the upsert and removal of synced rows), add `await relinkGuestStops({ memberId: connection.member_id });`.
  - **`src/server.ts`:** in the `*/15` branch, add:
```ts
      // Guild Mobile members at taprooms: relink every Mobile member's upcoming stops.
      const { relinkGuestStops } = await import("./lib/events/guest-links.server");
      ctx.waitUntil(relinkGuestStops());
```

- [ ] **Step 5: Run the tests, type-check and build**

Run: `npx vitest run src/lib/events`, then `npx tsc --noEmit 2>&1 | grep -c "error TS"`, then `npm run build`
Expected: PASS; `1`; the build succeeds.

- [ ] **Step 6: Commit**
```bash
git add src/lib/events/guest-links.server.ts src/lib/events/guest-links-hooks.test.ts src/lib/events/events.server.ts src/lib/events/calendar-connection.server.ts src/server.ts
git commit -m "feat(events): relink Mobile members' stops after saves, after sync and every 15 minutes"
```

---

### Task 5: The taproom's profile — guest stops in Upcoming events and Food this week

**Files:**
- Create: `src/lib/events/guest-display.ts`, `src/lib/events/guest-display.test.ts`
- Modify:
  - `src/lib/events/food-week.ts`: `FoodVendor` gains `guest?: GuestInfo`; `buildFoodWeek` takes `guestSlots`; `showsFoodWeek` takes `hasGuestFood`;
  - `src/lib/members/profile-object.ts`: events and `foodSlots` include guests;
  - `src/lib/members/member-profile.server.ts`: loads the shown links and the guests;
  - `src/components/profile/EventsModule.tsx`: renders the GUILD MEMBER mark, the guest link and the "with" line;
  - `src/components/profile/FoodCalendarModule.tsx`: renders the guest vendor link and mark;
  - `src/components/profile/MemberProfileTemplate.tsx`: passes `hasGuestFood`.
- Test: `src/lib/events/food-week.test.ts` (append), `src/components/profile/EventsModule.test.ts` (create, if there isn't one)

**Interfaces:**
- Consumes: `normalizeBusinessName` (mobile-stops); `mobileTagFor`, `MobileCategory` (mobile-category).
- Produces:
  - `type GuestInfo = { name: string; slug: string; tag: string; food: boolean }`
  - `type ProfileEvent = EventRow & { guest?: GuestInfo; host?: { name: string; slug: string } }`
  - `isFoodCategory(categories: MobileCategory[]): boolean`. True when the first category by `sort_order` is `food-truck` or `pop-up-food-vendor`.
  - `guestEventsForHost(rows: { event: EventRow; guest: GuestInfo }[]): ProfileEvent[]`. It drops canceled, postponed and hidden stops and keeps rescheduled ones.
  - `dedupeFoodSlots(own: EventRow[], guests: ProfileEvent[], timezone: string): { own: EventRow[]; guests: ProfileEvent[] }`. It drops an own food slot when a guest on the same local date has the same normalized name.

- [ ] **Step 1: Write the failing tests**

`src/lib/events/guest-display.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/supabase/types";
import { dedupeFoodSlots, guestEventsForHost, isFoodCategory } from "./guest-display";

const ev = (o: Partial<EventRow>): EventRow => ({
  id: "e", member_id: "m", calendar_connection_id: null, source: "manual", kind: "event", external_event_id: null,
  title: null, description: null, starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  venue_name: "Mars Brewing Co.", city: null, address: null, overlay_status: null, overlay_starts_at: null,
  overlay_note: null, overlay_set_at: null, is_hidden: false, ...o,
});
const truck = { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true };

describe("isFoodCategory", () => {
  it("first category decides", () => {
    expect(isFoodCategory([{ name: "Food Truck", slug: "food-truck", sort_order: 1 }])).toBe(true);
    expect(isFoodCategory([{ name: "Pop-up Food Vendor", slug: "pop-up-food-vendor", sort_order: 1 }])).toBe(true);
    expect(isFoodCategory([{ name: "Entertainment", slug: "entertainment", sort_order: 0 }, { name: "Food Truck", slug: "food-truck", sort_order: 1 }])).toBe(false);
    expect(isFoodCategory([])).toBe(false);
  });
});

describe("guestEventsForHost", () => {
  it("keeps live stops, drops canceled, postponed and hidden ones", () => {
    const out = guestEventsForHost([
      { event: ev({ id: "a" }), guest: truck },
      { event: ev({ id: "b", overlay_status: "canceled" }), guest: truck },
      { event: ev({ id: "c", overlay_status: "postponed" }), guest: truck },
      { event: ev({ id: "d", is_hidden: true }), guest: truck },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a"]);
    expect(out[0].guest?.slug).toBe("taco");
  });
});

describe("dedupeFoodSlots", () => {
  it("the taproom's own entry for the same vendor on the same day gives way to the Guild entry", () => {
    const own = [ev({ id: "own", kind: "food", title: "Sample Taco Truck Co.", starts_at: "2026-10-09T01:00:00Z" }), ev({ id: "other", kind: "food", title: "Pizza Pied Piper" })];
    const guests = [{ ...ev({ id: "g" }), guest: truck }];
    const r = dedupeFoodSlots(own, guests, "America/Los_Angeles");
    expect(r.own.map((e) => e.id)).toEqual(["other"]);
    expect(r.guests.map((e) => e.id)).toEqual(["g"]);
  });
});
```
Append to `src/lib/events/food-week.test.ts`:
```ts
describe("Guild food vendors in the food week", () => {
  it("a guest food stop fills its day; closed days stay closed", () => {
    // Use the file's existing helpers/fixtures for now, timezone and hours: a guest slot on an open day
    // makes that day status "vendors" with a vendor whose guest.slug is set; a guest slot on a closed day leaves "closed".
  });
  it("showsFoodWeek: a producer with a Guild food stop this week shows the week even with no calendar or kitchen", () => {
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: false, hasKitchen: false, hasGuestFood: true })).toBe(true);
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: false, hasKitchen: false, hasGuestFood: false })).toBe(false);
  });
});
```
Write out the first `it` concretely, using the existing `buildFoodWeek` test fixtures in that file (same `now`, `timezone` and `hours` builders). Assert:
- `days[i].status === "vendors"` and `days[i].vendors[0].guest?.slug === "taco"` for the guest's date;
- `days[j].status === "closed"` for a closed date that has a guest stop.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/events/guest-display.test.ts src/lib/events/food-week.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `guest-display.ts`**
```ts
import type { EventRow } from "@/lib/supabase/types";
import type { MobileCategory } from "@/lib/members/mobile-category";
import { normalizeBusinessName } from "@/lib/members/mobile-stops";
import { getZonedNow } from "@/lib/hours/open-now";

/** How a Guild Mobile member's stop shows on the taproom's (and its own) profile. Pure. */
export type GuestInfo = { name: string; slug: string; tag: string; food: boolean };
export type ProfileEvent = EventRow & { guest?: GuestInfo; host?: { name: string; slug: string } };

const FOOD_SLUGS = new Set(["food-truck", "pop-up-food-vendor"]);

export function isFoodCategory(categories: MobileCategory[]): boolean {
  const first = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0];
  return Boolean(first && FOOD_SLUGS.has(first.slug));
}

export function guestEventsForHost(rows: { event: EventRow; guest: GuestInfo }[]): ProfileEvent[] {
  return rows
    .filter(({ event }) => !event.is_hidden && event.overlay_status !== "canceled" && event.overlay_status !== "postponed")
    .map(({ event, guest }) => ({ ...event, guest }));
}

function localDate(iso: string, tz: string): string {
  return getZonedNow(new Date(iso), tz).date;
}

export function dedupeFoodSlots(
  own: EventRow[],
  guests: ProfileEvent[],
  timezone: string,
): { own: EventRow[]; guests: ProfileEvent[] } {
  const guestKeys = new Set(
    guests.filter((g) => g.guest).map((g) => `${localDate(g.starts_at, timezone)}|${normalizeBusinessName(g.guest!.name)}`),
  );
  return {
    own: own.filter((o) => !guestKeys.has(`${localDate(o.starts_at, timezone)}|${normalizeBusinessName(o.title ?? "")}`)),
    guests,
  };
}
```

- [ ] **Step 4: Food week support**

In `food-week.ts`:
- `FoodVendor` gains `guest?: GuestInfo` (import the type).
- `buildFoodWeek` params gain `guestSlots?: ProfileEvent[]`. Each guest slot becomes a vendor `{ id, title: guest.name, startsAt, endsAt, allDay, description: null, guest }` on its local date. It goes through the same `byDate` map, which the `kind !== "food"` filter would otherwise drop, so add the guest slots after the own-slot loop.
- `showsFoodWeek` gains `hasGuestFood?: boolean`: `memberType === "producer" && (hasFoodCalendar || hasKitchen || hasGuestFood === true)`.

- [ ] **Step 5: Profile loader and object**

In `member-profile.server.ts`, for a **producer**:
1. Read the shown links: `supabase.from("event_hosts").select("event_id").eq("host_member_id", member.id)`. The anon client only sees shown links of a published host, which is what visitors get.
2. Read those events: `supabase.from("events").select("*").in("id", ids)`. RLS already limits them to published members' unhidden events.
3. Read their members: `supabase.from("members").select("id, slug, business_name, member_type").in("id", guestMemberIds).eq("status", "published")`.
4. Read their categories: `member_categories` plus `categories`, as `members-v2.server.ts` does.

Build `{ event, guest: { name, slug, tag: mobileTagFor(cats), food: isFoodCategory(cats) } }` and pass `guestEvents: guestEventsForHost(rows)` into `buildProfileObject`.

In `profile-object.ts`:
- `events` becomes `upcomingOrCanceledEvents([...own events, ...guestEvents], now)`, sorted by effective start. The type changes to `ProfileEvent[]`.
- `foodSlots`: run `dedupeFoodSlots(ownFoodSlots, guestEvents.filter((g) => g.guest?.food), member.timezone)`, then pass `own` as `foodSlots` and add a new field, `guestFoodSlots`.
- Add `hasGuestFood: guestFoodSlots.length > 0`.

In `MemberProfileTemplate.tsx`, pass `hasGuestFood: data.hasGuestFood` to `showsFoodWeek`, and `guestSlots={data.guestFoodSlots}` to `FoodCalendarModule`, which passes it on to `buildFoodWeek`.

- [ ] **Step 6: Render**

**`EventsModule.tsx`**, for a row with `event.guest`:
- **The title:** `event.title` when set, else `event.guest.name` as a `<Link to="/members/$slug" params={{ slug: event.guest.slug }}>` (underlined).
- **Next to the title:** the GUILD MEMBER pill, `rounded-full bg-[#F5E2D0] px-2 text-[9px] font-semibold tracking-[0.08em] text-[#7A4413]`, reading "GUILD MEMBER".
- **The detail line:** the time, then
  - "with *Guest name*" (linked) when the event has a title;
  - otherwise the lowercased tag ("food truck").
- The "Synced from…" header label ignores guest rows.

**`FoodCalendarModule.tsx`**, for a vendor with `guest`: the title is a link to `/members/${guest.slug}` with the same pill.

Add `src/components/profile/EventsModule.test.ts` (renderToStaticMarkup, mocking `@tanstack/react-router`'s `Link` as in `MemberCardV2.test.ts`) with two cases:
- a guest event without a title renders the guest name linked to `/members/taco`, "GUILD MEMBER" and "food truck";
- with the title "Karaoke Night", it renders "Karaoke Night" and "with" followed by the linked guest name.

- [ ] **Step 7: Run tests, type-check and build**

Run: `npm run test`, then `npx tsc --noEmit 2>&1 | grep -c "error TS"`, then `npm run build`
Expected: all pass; `1`; the build succeeds.

- [ ] **Step 8: Commit**
```bash
git add src/lib/events src/lib/members src/components/profile
git commit -m "feat(profile): Guild Mobile members' stops show in the taproom's Upcoming events and, for food members, its Food this week"
```

---

### Task 6: The Mobile member's own stops link to the taproom

**Files:**
- Modify: `src/lib/members/member-profile.server.ts` (for a **mobile** member)
- Modify: `src/components/profile/EventsModule.tsx`
- Test: `src/components/profile/EventsModule.test.ts` (append)

**Interfaces:**
- Consumes: `matchHost` (Task 2); `ProfileEvent` (Task 5).
- Produces: a mobile member's `ProfileEvent.host = { name, slug }` when the stop is at a published producer.

This uses live matching, so it shows whatever the taproom chose (spec: "This shows whatever the taproom's Hide/Show choice").

- [ ] **Step 1: Append failing render tests**
```ts
it("a mobile member's stop at a Guild taproom links to it", () => {
  // venue_name "Mars Brewing Co.", no title, host { name: "Mars Brewing Co.", slug: "mars" }
  // -> contains "Mars Brewing Co." and "Guild taproom" and href="/members/mars"
});
it("with its own title: 'at Mars Brewing Co. →'", () => {
  // title "Karaoke Night", host as above -> contains "Karaoke Night" and "at Mars Brewing Co." and href="/members/mars"
});
```
Write both concretely, with the same render helper as Task 5.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**
- **Loader:** for a **mobile** member, read published producers (`id, slug, business_name, city, street_address`) and set `event.host` for each event where `matchHost(event, hosts)` returns one.
- **`EventsModule`:**
  - when `event.host` is set and there's no title: after the venue title, a link `Guild taproom →` to `/members/${host.slug}` (`text-xs font-semibold text-brand`);
  - with a title: `at {host.name} →`, linked, after the title.

- [ ] **Step 4: Run tests**, then **Step 5: Commit**
```bash
git commit -am "feat(profile): a Mobile member's stop at a Guild taproom links to the taproom"
```

---

### Task 7: The homepage carousel — once, as the taproom's event

**Files:**
- Modify: `src/lib/home/member-events.ts` (`HomeEventCard.guest?`, `selectCarouselEvents` gains `hostsByEventId`)
- Modify: `src/lib/home/homepage.server.ts` (loads shown links and hosts)
- Modify: `src/components/home/MemberEventsCarousel.tsx` (renders the "with a Guild member" line)
- Test: `src/lib/home/member-events.test.ts` (append)

**Interfaces:**
- Produces:
  - `HomeEventCard.guest?: { name: string; tag: string }`
  - `selectCarouselEvents(rows, members, now, options?, hostsByEventId?: Map<string, { hostMemberId: string; guest: { name: string; tag: string } }>)`

- [ ] **Step 1: Append failing tests**
```ts
describe("Guild members at taprooms on the homepage", () => {
  it("a linked stop is one card under the taproom, with the guest named", () => {
    // rows: one event e1 of member "truck"; members: truck and mars; hostsByEventId: e1 -> { hostMemberId: "mars", guest: { name: "Sample Taco Truck", tag: "FOOD TRUCK" } }
    // -> exactly one card, card.member.id === "mars", card.guest.name === "Sample Taco Truck", card.title === "Sample Taco Truck" (no title on the event)
  });
  it("no link (or hidden): the guest's own card, as today", () => {
    // same row without hostsByEventId -> card.member.id === "truck", no guest
  });
  it("the host counts for the one-per-member rotation", () => {
    // mars has its own event e2 at the same time as e1 -> mars's two cards take rounds 1 and 2, not both round 1
  });
});
```
Write each concretely, with the file's existing `members` and `rows` fixtures and the `now` it uses.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**
- **`selectCarouselEvents`:** when `hostsByEventId.get(row.id)` exists and the host is in `members`, use the host as the card's member, set `guest`, and set `title = row.title ?? guest.name`. Everything else is unchanged; the rotation already groups cards by the card's member.
- **`homepage.server.ts`:**
  1. After loading the event rows, read `event_hosts.select("event_id, host_member_id").in("event_id", rowIds)`. The anon client sees shown links of published hosts only.
  2. Add the host ids to the member query.
  3. Look up each guest's name (the event's own member, already loaded) and tag. Read the categories with the same two queries as `members-v2.server.ts`.
  4. Build the map and pass it in.
- **`MemberEventsCarousel.tsx`:** when `card.guest` is set, under the title render: `with a Guild member`, the GUILD MEMBER pill and the tag pill (teal, `bg-[#DCEDEC] text-[#17605F]`). The place line reads "At the taproom · *city*".

- [ ] **Step 4: Run tests**, then **Step 5: Commit**
```bash
git commit -am "feat(home): a Guild member's stop at a taproom is one homepage card, as the taproom's event"
```

---

### Task 8: The taproom's controls — the Events-page box and the Food preview's Hide

**Files:**
- Create: `src/lib/events/guest-stops.server.ts` (`listGuestStops`, `setGuestStopStatus`)
- Create: `src/components/admin/GuestStopsBox.tsx`, `src/components/admin/GuestStopsBox.test.ts`
- Modify: `src/routes/admin.events.tsx` and `src/components/portal/PortalSectionView.tsx` (render the box after `EventsEditor`, producers only)
- Modify: `src/components/admin/FoodCalendarSection.tsx` (Guild vendors in the preview, with Hide)
- Modify: `vite.config.ts` (allow `guest-stops.server.ts`)
- Modify: `src/lib/guild/audit-log-coverage.test.ts` (per-function: `setGuestStopStatus`)

**Interfaces:**
- Produces:
  - `listGuestStops({ memberId })` returns `Array<{ eventId: string; guestName: string; guestSlug: string; tag: string; title: string | null; startsAt: string; endsAt: string | null; allDay: boolean; status: "shown" | "hidden" }>`. It reads with the session client (the host's people see all rows), oldest first, upcoming only.
  - `setGuestStopStatus({ memberId, eventId, status })` returns `{ ok: true }`. It calls the rpc `set_event_host_status`, then `recordAuditLogIfImpersonating({ memberId, tableName: "event_hosts", rowId: eventId, action: "update" })`.
  - `GuestStopsBox({ memberId, timezone, street })`

- [ ] **Step 1: Write the failing tests**
  - **`GuestStopsBox.test.ts`:** renderToStaticMarkup of the box's presentational part. Export `GuestStopsList({ stops, timezone, street, onToggle })` and test that:
    - the heading "Guild members at your taproom" and the street are present;
    - a shown row has "On your page" and "Hide";
    - a hidden row has "Hidden from your page" and "Show";
    - an empty list shows "No Guild members have listed a stop here yet.";
    - the guest name links to `/members/<slug>`.
  - **In `audit-log-coverage.test.ts`:** add `["src/lib/events/guest-stops.server.ts", "setGuestStopStatus"]` to the per-function list.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Implement the server functions.** Wrap each step in try/catch for a clear error message. Each function checks the caller is signed in.
  - **`listGuestStops`:**
    1. `supabase.from("event_hosts").select("event_id, status").eq("host_member_id", memberId)`
    2. The events by id, which must be in the future.
    3. The guests' members and categories, as in Task 7.
    4. Map to the row type and sort by start.
  - **`setGuestStopStatus`:** the rpc call, then the audit row.

  Add the file to `vite.config.ts`'s `excludeFiles`, with a comment like its neighbors': it's called from the box, a client component.

- [ ] **Step 4: Implement `GuestStopsBox`** (GV1). It loads with `listGuestStops` on mount and renders `GuestStopsList`.
  - **Look:** the orange 2px border card, the intro text from the spec, and rows like the Events editor's (date column, name link, the GUILD MEMBER and tag pills, the title, "*time* · from their schedule").
  - **Each row:** "On your page" with **Hide**, or, faded, "Hidden from your page" with **Show**.
  - **The footnote:** from the spec.

  Toggling calls `setGuestStopStatus` optimistically and rolls back on error, showing the message. Render it in `admin.events.tsx` and the portal events case, only when the member type is `producer`. The admin route can read it via `useMemberEditing()`, and the portal via `shell.memberType`.

- [ ] **Step 5: Food page preview.** In `FoodCalendarSection.tsx`, load `listGuestStops` as well, and add the food guests' upcoming stops in the next 7 days to the preview's `buildFoodWeek({ guestSlots })`. Under the preview, list those Guild vendors with the same Hide/Show buttons. A guest's food flag comes from its tag: FOOD TRUCK or POP-UP FOOD VENDOR. So also return `food: boolean` from `listGuestStops`, computed with `isFoodCategory`.

- [ ] **Step 6: Run tests, type-check, build and the server-function check**

Run: `npm run test`, `npx tsc --noEmit 2>&1 | grep -c "error TS"`, `npm run build`, and the RPC check (every client server-fn id is in `dist/server`).
Expected: pass; `1`; the build succeeds; `missing 0`.

- [ ] **Step 7: Commit**
```bash
git commit -am "feat(admin): Guild members at your taproom — Hide/Show on the Events page and in the Food preview"
```

---

### Task 9: By hand on staging, and docs

**Files:**
- Modify: `docs/member-profiles.md` (a short "Guild Mobile members at taprooms (Part 1)" section)
- Modify: `docs/design/README.md` (GV1, GV3 and GV4 rows: built)

- [ ] **Step 1: Push and check by hand.** Push to `staging` and wait for the deploy. **Ask the owner** before publishing Sample Taco Truck. Then, with Sample Brewing Co. as the taproom:
  1. **As Sample Taco Truck,** in Events, add a stop today or tomorrow and pick "Sample Brewing Co." from the suggestions (or type it).
  2. **Within a few seconds,** it should show on:
     - Sample Brewing's profile: Upcoming events with GUILD MEMBER, and Food this week for that day;
     - the homepage card, in Sample Brewing's colors, "with a Guild member";
     - the truck's own profile: "Guild taproom →".
  3. **As Sample Brewing** (Edit as them): the Events page box lists the stop. **Hide** removes it from the profile, food week and homepage; the truck's page still shows it. **Show** brings it back.
  4. **Move** the stop's venue to somewhere else: it leaves Sample Brewing.
  5. **Clean up:** delete the test stop, set Sample Taco Truck back to its previous status, and revoke the test sessions.
- [ ] **Step 2: Docs.**
  - **`docs/member-profiles.md`:** add a section summarizing the spec: hosts are producers; any Mobile member counts; it shows as a taproom event, in the food week for food members and on the homepage once; Hide/Show; Part 2 is next.
  - **`docs/design/README.md`:** GV1, GV3 and GV4 rows, pointing to the components.
- [ ] **Step 3: Commit and push.**

---

## Self-review notes

- **Spec coverage:**

  | Spec requirement | Task |
  |---|---|
  | Hosts and guests, the 60-day window | 3, 4 |
  | Matching | 2 |
  | The table and RLS | 1 |
  | The function and audit | 1, 8 |
  | The linker: three triggers, keeps hide, resets on move | 3, 4 |
  | Canceled keeps its row | 3 (decision), 5, 7 (display) |
  | The taproom's events and food week, dedupe, closed days | 5 |
  | Guest-profile link | 6 |
  | Homepage | 7 |
  | Map unchanged | none needed |
  | Controls: Events box and Food preview | 8 |
  | Testing list | 1–8 |
  | Hand check | 9 |

- **One known design point:** the guest profile's taproom link uses live matching, not the table, so a hidden link still shows there. Visitors can't read hidden rows, and the spec wants the member's page unaffected by Hide.
