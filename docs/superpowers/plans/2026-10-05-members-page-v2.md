# Members Page v2 (/members-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trial Members page at `/members-2` on staging: a list beside the map on desktop (B2, one card per member), a list/map phone layout with a Filters panel, search, type filter, Near me, hover highlighting, and today's-stop pins for mobile members with an icon from their category.

**Architecture:** The page reuses the existing directory data (`buildDirectoryMembers`, one card per business), adding mobile members' categories and their stops for the next 14 days. All the rules live in small pure modules with unit tests:
- picking today's stop;
- placing its pin;
- the card text;
- search, filter and order;
- pin icons;
- when the map moves.

The React pieces stay thin. A new 15-minute cron step looks up map coordinates for mobile members' upcoming stops and stores them in three new `events` columns. The route returns 404 on the production hostname, so a later staging→main merge can't expose it by accident.

**Tech Stack:** TanStack Start (React 19, file routes), Cloudflare Workers (cron), Supabase Postgres + RLS (pgTAP tests), Google Maps via `@vis.gl/react-google-maps` (legacy `Marker` with SVG icons), Tailwind, Vitest (node environment, `src/**/*.test.ts` only; components are tested with `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-05-members-page-v2-design.md`. Artboards B1–B6: `docs/design/artboards/MembersV2*.dc.html`. The owner chose **B2**.

## Global Constraints

- All work goes on the `staging` branch. Never merge to `main` or touch production without the owner's explicit "go".
- The Supabase database is shared by staging and production. **Before `npx supabase db push`, stop and ask the owner** (Task 1).
- `/members-2` is `noindex, nofollow` and not linked from the menu. **It returns 404 on `iscbrewersguild.org` and `www.iscbrewersguild.org`.**
- The current `/members` page must not change in behavior or looks.
- US spelling. Copy is the artboards' own: "Search members…", "Near me", "All member types", "A–Z", "Nearest", "Filters", "Show N members", "Clear", "Profile →", "+ N more locations", "N locations", "No stop today. Next: …", "No stops scheduled", "Schedule", "Directions", "Website".
- Times are Pacific (`America/Los_Angeles`).
- Mobile pin icons come only from the member's first category, by `sort_order`:
  - `food-truck` → truck;
  - `pop-up-food-vendor` → tent;
  - `entertainment` → microphone;
  - anything else, or no category → star.

  **No calendar tags.**
- A visitor's location never leaves the browser.
- The geocoding key is the existing Worker secret `GOOGLE_GEOCODING_API_KEY`. Never print or commit keys.
- Tests: `npm run test` (Vitest), `npm run test:db` (pgTAP), `npm run build`. `npx tsc --noEmit` has exactly 2 known errors (MembersMap, survey); don't add any.

## Review Focus

1. **A stop whose address was edited after it was looked up.** Its old coordinates must not be used. The pin shows only when `geocoded_address` equals the current `address`; otherwise there's no pin until the cron looks it up again. Task 3 has the test.
2. **The Pacific-day boundary.**
   - A stop at 11:30 pm Pacific is "today" even though it's tomorrow in UTC.
   - A stop that ended earlier today doesn't show as today's stop.
   - Task 2 has the tests.
3. **A host business with several locations.** "Sample Brewing Co." with locations in two cities: the truck pin goes beside the location in the stop's city, and to none if no city matches. Task 3 has the test.
4. **Search with odd input.** Mixed case, accents ("Cafe" matches "Café"), and spaces before or after. Task 5 has the tests.
5. **The production hostname.** `/members-2` must 404 on `iscbrewersguild.org` and `www.`, and work on `*.workers.dev` and `localhost`. Task 7 has the test.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261005100000_event_coordinates.sql` (create) | `events.latitude`, `events.longitude`, `events.geocoded_address` |
| `supabase/tests/event_coordinates.test.sql` (create) | Columns exist; visitors can read them; visitors can't write |
| `src/lib/members/mobile-category.ts` (create) | Category → pin icon and card tag |
| `src/lib/members/mobile-stops.ts` (create) | Today's stop, next stop, compact times, pin placement, card summary, which stops need a lookup |
| `src/lib/members/directory-filters.ts` (create) | Search, type filter, distance, Near-me order, location split |
| `src/lib/members/members-v2-gate.ts` (create) | Is `/members-2` allowed on this host? |
| `src/lib/members/members-v2.ts` (create) | Builds v2 cards and pins from directory cards + categories + stops |
| `src/lib/members/members-v2.server.ts` (create) | `getMembersV2Data` server function: loads everything with the anon client |
| `src/lib/members/directory.server.ts` (modify) | Extract `loadDirectory(supabase)` so `/members` and `/members-2` share the reads |
| `src/lib/members/directory.ts` (modify) | `DirectoryLocation` gains `street` (additive) |
| `src/lib/events/stop-geocode.ts` (create) | `geocodeStops(deps)`: the lookup loop, testable with fakes |
| `src/lib/events/stop-geocode-cron.server.ts` (create) | Wires `geocodeStops` to Supabase and the key |
| `src/server.ts` (modify) | Run the stop lookup on the `*/15` cron |
| `src/lib/maps/pin-icons.ts` (create) | SVG data URLs for location pins, highlighted pins, the labeled pin, mobile pins |
| `src/lib/maps/pan-decision.ts` (create) | Whether to leave the map, pan or fit |
| `src/components/site/members-v2/*.tsx` (create) | Map, card, toolbar, filters sheet, phone carousel, Near-me hook, page |
| `src/routes/members-2.tsx` (create) | Route: gate, loader, `noindex`, page |
| `docs/member-profiles.md`, `docs/design/README.md` (modify) | Record what was built |

---

### Task 1: Event coordinates (database)

**Files:**
- Create: `supabase/migrations/20261005100000_event_coordinates.sql`
- Create: `supabase/tests/event_coordinates.test.sql`
- Modify: `src/lib/supabase/types.ts` (`EventRow`)

**Interfaces:**
- Produces: `events.latitude numeric(9,6) null`, `events.longitude numeric(9,6) null`, `events.geocoded_address text null`. `EventRow` gains `latitude?: number | string | null; longitude?: number | string | null; geocoded_address?: string | null`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/event_coordinates.test.sql`:
```sql
-- Map coordinates for mobile members' stops (20261005100000_event_coordinates.sql):
-- three nullable columns the public can read with the event, and nobody
-- but the service role (the cron) is expected to fill.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(6);

insert into _tap (line) select has_column('public', 'events', 'latitude', 'events.latitude exists');
insert into _tap (line) select has_column('public', 'events', 'longitude', 'events.longitude exists');
insert into _tap (line) select has_column('public', 'events', 'geocoded_address', 'events.geocoded_address exists');

-- m4 (pgtap-m4) is a published mobile member.
insert into public.events (id, member_id, source, kind, title, starts_at, address, latitude, longitude, geocoded_address)
values ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'manual', 'event',
        'Tacos at the brewery', now() + interval '2 hours', '3900 Main St, Riverside, CA',
        33.98, -117.37, '3900 Main St, Riverside, CA');

set local role anon;
insert into _tap (line) select is(
  (select latitude::text from public.events where id = 'f3000000-0000-4000-8000-000000000001'),
  '33.980000', 'a visitor can read a published member''s stop coordinates');

update public.events set latitude = 0 where id = 'f3000000-0000-4000-8000-000000000001';
reset role;
insert into _tap (line) select is(
  (select latitude::text from public.events where id = 'f3000000-0000-4000-8000-000000000001'),
  '33.980000', 'a visitor can''t change them');

insert into _tap (line) select is(
  (select geocoded_address from public.events where id = 'f3000000-0000-4000-8000-000000000001'),
  '3900 Main St, Riverside, CA', 'geocoded_address is stored as given');

select * from finish();
rollback;
```
Before writing it, check how the other tests in `supabase/tests/` end (the `_tap` table, `finish()`, `rollback`), and copy that exact ending if it differs from the above.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: `event_coordinates.test.sql` fails with `column "latitude" does not exist`. Every other file passes.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261005100000_event_coordinates.sql`:
```sql
-- Members page v2 (docs/superpowers/specs/2026-10-05-members-page-v2-design.md):
-- a mobile member's stop gets map coordinates, looked up from its address by
-- the 15-minute cron (src/lib/events/stop-geocode-cron.server.ts).
-- geocoded_address is the address the coordinates belong to: when a member
-- edits the address, the page stops using the old coordinates (they no
-- longer match) until the cron looks the new one up.
alter table public.events
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add column geocoded_address text;

comment on column public.events.latitude is 'Map latitude of the stop, looked up from geocoded_address by the cron.';
comment on column public.events.longitude is 'Map longitude of the stop, looked up from geocoded_address by the cron.';
comment on column public.events.geocoded_address is 'The address latitude/longitude were looked up for; null = never looked up.';
```
`events` uses table-level grants and RLS: no column grant needed. The test proves visitors can read and can't write.

- [ ] **Step 4: Run the database tests**

Run: `npm run test:db`
Expected: every file passes, including `event_coordinates.test.sql` (6/6).

- [ ] **Step 5: Update `EventRow`**

In `src/lib/supabase/types.ts`, inside `export type EventRow = {`, after `is_hidden: boolean;`, add:
```ts
  /** Members page v2 (20261005100000_event_coordinates.sql): the stop's map position, looked up by the cron. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** The address latitude/longitude belong to; coordinates count only while it equals `address`. */
  geocoded_address?: string | null;
```

- [ ] **Step 6: Ask the owner, then push**

Run: `npx supabase db push --dry-run --linked`
Expected: lists only `20261005100000_event_coordinates.sql`.

**STOP.** Tell the owner: "One database change is ready: three empty columns added to events, for stop map positions. It adds columns only, so the live site is unaffected. OK to apply it to the shared database?" Wait for a yes, then:

Run: `npx supabase db push --linked`
Expected: `Applying migration 20261005100000_event_coordinates.sql... Finished`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261005100000_event_coordinates.sql supabase/tests/event_coordinates.test.sql src/lib/supabase/types.ts
git commit -m "feat(db): map coordinates on events for mobile members' stops"
```

---

### Task 2: Mobile categories and today's stop (pure)

**Files:**
- Create: `src/lib/members/mobile-category.ts`, `src/lib/members/mobile-category.test.ts`
- Create: `src/lib/members/mobile-stops.ts`, `src/lib/members/mobile-stops.test.ts`

**Interfaces:**
- Consumes: `getZonedNow(instant: Date, timeZone: string): { date: string; weekday: number; minutes: number }` from `@/lib/hours/open-now`.
- Produces:
  - `type MobileIcon = "truck" | "tent" | "mic" | "star"`
  - `type MobileCategory = { name: string; slug: string; sort_order: number }`
  - `mobileIconFor(categories: MobileCategory[]): MobileIcon`
  - `mobileTagFor(categories: MobileCategory[]): string`
  - `STOP_TIMEZONE = "America/Los_Angeles"`
  - `STOP_EVENT_COLUMNS: string`
  - `type StopEvent = { id: string; member_id: string; title: string | null; venue_name: string | null; city: string | null; address: string | null; starts_at: string; ends_at: string | null; all_day: boolean; overlay_status: "postponed" | "rescheduled" | "canceled" | null; overlay_starts_at: string | null; is_hidden: boolean; latitude: number | string | null; longitude: number | string | null; geocoded_address: string | null }`
  - `stopStart(e: StopEvent): string`
  - `pickTodaysStop(events: StopEvent[], now: Date): StopEvent | null`
  - `pickNextStop(events: StopEvent[], now: Date, days?: number): StopEvent | null`
  - `formatStopTime(e: StopEvent): string`, for example "5–9 pm", "5:30–9 pm", "11 am–2 pm", "6 pm", "All day"
  - `formatStopDay(e: StopEvent): string`, for example "Fri"

- [ ] **Step 1: Write the failing tests**

`src/lib/members/mobile-category.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mobileIconFor, mobileTagFor, type MobileCategory } from "./mobile-category";

const truck: MobileCategory = { name: "Food Truck", slug: "food-truck", sort_order: 2 };
const popup: MobileCategory = { name: "Pop-up Food Vendor", slug: "pop-up-food-vendor", sort_order: 3 };
const ent: MobileCategory = { name: "Entertainment", slug: "entertainment", sort_order: 1 };
const other: MobileCategory = { name: "Face Painting", slug: "face-painting", sort_order: 0 };

describe("mobile pin icon and tag (from the first category by sort_order)", () => {
  it.each([
    [[truck], "truck", "FOOD TRUCK"],
    [[popup], "tent", "POP-UP FOOD VENDOR"],
    [[ent], "mic", "ENTERTAINMENT"],
  ] as const)("%j -> %s / %s", (cats, icon, tag) => {
    expect(mobileIconFor([...cats])).toBe(icon);
    expect(mobileTagFor([...cats])).toBe(tag);
  });

  it("several categories: the first by sort_order decides", () => {
    expect(mobileIconFor([truck, ent])).toBe("mic");
    expect(mobileTagFor([truck, ent])).toBe("ENTERTAINMENT");
  });

  it("an unknown category gets the star but keeps its own name as the tag", () => {
    expect(mobileIconFor([other, truck])).toBe("star");
    expect(mobileTagFor([other, truck])).toBe("FACE PAINTING");
  });

  it("no category: star and MOBILE", () => {
    expect(mobileIconFor([])).toBe("star");
    expect(mobileTagFor([])).toBe("MOBILE");
  });
});
```

`src/lib/members/mobile-stops.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatStopDay, formatStopTime, pickNextStop, pickTodaysStop, type StopEvent } from "./mobile-stops";

function stop(overrides: Partial<StopEvent>): StopEvent {
  return {
    id: "e1",
    member_id: "m1",
    title: "Tacos",
    venue_name: null,
    city: "Riverside",
    address: null,
    starts_at: "2026-10-05T00:00:00Z",
    ends_at: null,
    all_day: false,
    overlay_status: null,
    overlay_starts_at: null,
    is_hidden: false,
    latitude: null,
    longitude: null,
    geocoded_address: null,
    ...overrides,
  };
}

// Monday 5 October 2026, 3:00 pm Pacific (PDT, UTC-7) = 22:00 UTC.
const NOW = new Date("2026-10-05T22:00:00Z");

describe("pickTodaysStop", () => {
  it("picks the stop happening now over a later one today", () => {
    const now = stop({ id: "now", starts_at: "2026-10-05T21:00:00Z", ends_at: "2026-10-05T23:00:00Z" });
    const later = stop({ id: "later", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" });
    expect(pickTodaysStop([later, now], NOW)?.id).toBe("now");
  });

  it("with nothing on now, picks the next one today", () => {
    const later = stop({ id: "later", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" });
    expect(pickTodaysStop([later], NOW)?.id).toBe("later");
  });

  it("11:30 pm Pacific is still today (tomorrow in UTC)", () => {
    const late = stop({ id: "late", starts_at: "2026-10-06T06:30:00Z" });
    expect(pickTodaysStop([late], NOW)?.id).toBe("late");
  });

  it("a stop that ended earlier today is not today's stop", () => {
    const done = stop({ id: "done", starts_at: "2026-10-05T16:00:00Z", ends_at: "2026-10-05T19:00:00Z" });
    expect(pickTodaysStop([done], NOW)).toBeNull();
  });

  it("a stop with no end counts as on for 2 hours", () => {
    const open = stop({ id: "open", starts_at: "2026-10-05T20:30:00Z" });
    expect(pickTodaysStop([open], NOW)?.id).toBe("open");
    const over = stop({ id: "over", starts_at: "2026-10-05T19:30:00Z" });
    expect(pickTodaysStop([over], NOW)).toBeNull();
  });

  it("an all-day stop today is on all day", () => {
    const allDay = stop({ id: "allday", starts_at: "2026-10-05T07:00:00Z", all_day: true });
    expect(pickTodaysStop([allDay], NOW)?.id).toBe("allday");
  });

  it("skips hidden, canceled and postponed stops", () => {
    const base = { starts_at: "2026-10-05T21:00:00Z", ends_at: "2026-10-05T23:00:00Z" };
    expect(pickTodaysStop([stop({ ...base, is_hidden: true })], NOW)).toBeNull();
    expect(pickTodaysStop([stop({ ...base, overlay_status: "canceled" })], NOW)).toBeNull();
    expect(pickTodaysStop([stop({ ...base, overlay_status: "postponed" })], NOW)).toBeNull();
  });

  it("a stop rescheduled onto today counts by its new time", () => {
    const moved = stop({
      id: "moved",
      starts_at: "2026-10-01T21:00:00Z",
      overlay_status: "rescheduled",
      overlay_starts_at: "2026-10-06T01:00:00Z",
    });
    expect(pickTodaysStop([moved], NOW)?.id).toBe("moved");
  });
});

describe("pickNextStop", () => {
  it("is the first live stop after today, within 14 days", () => {
    const fri = stop({ id: "fri", starts_at: "2026-10-10T00:00:00Z" });
    const wed = stop({ id: "wed", starts_at: "2026-10-07T19:00:00Z" });
    const far = stop({ id: "far", starts_at: "2026-10-25T19:00:00Z" });
    const todayLater = stop({ id: "today", starts_at: "2026-10-06T01:00:00Z" });
    expect(pickNextStop([far, fri, wed, todayLater], NOW)?.id).toBe("wed");
    expect(pickNextStop([far], NOW)).toBeNull();
  });
});

describe("formatStopTime / formatStopDay", () => {
  it.each([
    ["2026-10-06T00:00:00Z", "2026-10-06T04:00:00Z", false, "5–9 pm"],
    ["2026-10-06T00:30:00Z", "2026-10-06T04:00:00Z", false, "5:30–9 pm"],
    ["2026-10-05T18:00:00Z", "2026-10-05T21:00:00Z", false, "11 am–2 pm"],
    ["2026-10-06T01:00:00Z", null, false, "6 pm"],
    ["2026-10-05T07:00:00Z", null, true, "All day"],
  ])("%s–%s all-day=%s -> %s", (starts_at, ends_at, all_day, text) => {
    expect(formatStopTime(stop({ starts_at, ends_at, all_day }))).toBe(text);
  });

  it("day is the short Pacific weekday", () => {
    expect(formatStopDay(stop({ starts_at: "2026-10-10T00:00:00Z" }))).toBe("Fri");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/members/mobile-category.test.ts src/lib/members/mobile-stops.test.ts`
Expected: both FAIL with "Cannot find module './mobile-category'" / "'./mobile-stops'".

- [ ] **Step 3: Write `mobile-category.ts`**

```ts
/**
 * A mobile member's pin icon and card tag come from their FIRST category,
 * in the Guild Categories page's order (owner, 2026-10-05; spec "The mobile
 * pin and card"). A fixed list in code -- a new category shows the star
 * until it's given its own icon here. Never from calendar tags.
 */
export type MobileIcon = "truck" | "tent" | "mic" | "star";

export type MobileCategory = { name: string; slug: string; sort_order: number };

const ICON_BY_SLUG: Readonly<Record<string, MobileIcon>> = {
  "food-truck": "truck",
  "pop-up-food-vendor": "tent",
  entertainment: "mic",
};

function first(categories: MobileCategory[]): MobileCategory | null {
  return (
    [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0] ?? null
  );
}

export function mobileIconFor(categories: MobileCategory[]): MobileIcon {
  const category = first(categories);
  return (category && ICON_BY_SLUG[category.slug]) || "star";
}

export function mobileTagFor(categories: MobileCategory[]): string {
  return first(categories)?.name.trim().toUpperCase() || "MOBILE";
}
```

- [ ] **Step 4: Write `mobile-stops.ts` (this task's part)**

```ts
import { getZonedNow } from "@/lib/hours/open-now";

/**
 * A mobile member's stops (their events) on the Members page v2
 * (spec "Mobile members: today's stop"). Pure: the server loads the rows
 * and passes `now`.
 */
export const STOP_TIMEZONE = "America/Los_Angeles";

export const STOP_EVENT_COLUMNS =
  "id, member_id, title, venue_name, city, address, starts_at, ends_at, all_day, overlay_status, overlay_starts_at, is_hidden, latitude, longitude, geocoded_address";

export type StopEvent = {
  id: string;
  member_id: string;
  title: string | null;
  venue_name: string | null;
  city: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  overlay_status: "postponed" | "rescheduled" | "canceled" | null;
  overlay_starts_at: string | null;
  is_hidden: boolean;
  latitude: number | string | null;
  longitude: number | string | null;
  geocoded_address: string | null;
};

const DEFAULT_LENGTH_MS = 2 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function pacificDate(instant: Date): string {
  return getZonedNow(instant, STOP_TIMEZONE).date;
}

/** A rescheduled stop counts by its new start time. */
export function stopStart(e: StopEvent): string {
  return e.overlay_status === "rescheduled" && e.overlay_starts_at ? e.overlay_starts_at : e.starts_at;
}

function stopEnd(e: StopEvent): number {
  const start = new Date(stopStart(e)).getTime();
  if (e.all_day) return start + DAY_MS;
  if (e.ends_at && e.overlay_status !== "rescheduled") {
    const end = new Date(e.ends_at).getTime();
    if (end > start) return end;
  }
  return start + DEFAULT_LENGTH_MS;
}

function isLive(e: StopEvent): boolean {
  return !e.is_hidden && e.overlay_status !== "canceled" && e.overlay_status !== "postponed";
}

function byStart(a: StopEvent, b: StopEvent): number {
  return stopStart(a).localeCompare(stopStart(b));
}

export function pickTodaysStop(events: StopEvent[], now: Date): StopEvent | null {
  const today = pacificDate(now);
  const t = now.getTime();
  const todays = events
    .filter(isLive)
    .filter((e) => pacificDate(new Date(stopStart(e))) === today)
    .sort(byStart);
  const happening = todays.find((e) => new Date(stopStart(e)).getTime() <= t && t < stopEnd(e));
  if (happening) return happening;
  return todays.find((e) => new Date(stopStart(e)).getTime() > t) ?? null;
}

export function pickNextStop(events: StopEvent[], now: Date, days = 14): StopEvent | null {
  const today = pacificDate(now);
  const limit = now.getTime() + days * DAY_MS;
  return (
    events
      .filter(isLive)
      .filter((e) => pacificDate(new Date(stopStart(e))) > today && new Date(stopStart(e)).getTime() <= limit)
      .sort(byStart)[0] ?? null
  );
}

function hourText(instant: Date): { text: string; period: "am" | "pm" } {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: STOP_TIMEZONE,
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = (parts.find((p) => p.type === "dayPeriod")?.value ?? "PM").toLowerCase() as "am" | "pm";
  return { text: minute === "00" ? hour : `${hour}:${minute}`, period };
}

/** "5–9 pm", "5:30–9 pm", "11 am–2 pm", "6 pm", "All day". */
export function formatStopTime(e: StopEvent): string {
  if (e.all_day) return "All day";
  const start = hourText(new Date(stopStart(e)));
  const hasEnd = Boolean(e.ends_at) && e.overlay_status !== "rescheduled";
  if (!hasEnd) return `${start.text} ${start.period}`;
  const end = hourText(new Date(e.ends_at as string));
  return start.period === end.period
    ? `${start.text}–${end.text} ${end.period}`
    : `${start.text} ${start.period}–${end.text} ${end.period}`;
}

/** "Fri". */
export function formatStopDay(e: StopEvent): string {
  return new Date(stopStart(e)).toLocaleDateString("en-US", { weekday: "short", timeZone: STOP_TIMEZONE });
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/members/mobile-category.test.ts src/lib/members/mobile-stops.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/lib/members/mobile-category.ts src/lib/members/mobile-category.test.ts src/lib/members/mobile-stops.ts src/lib/members/mobile-stops.test.ts
git commit -m "feat(members-v2): mobile category icons and today's stop"
```

---

### Task 3: Stop pin placement, card summary, and which stops need a lookup (pure)

**Files:**
- Modify: `src/lib/members/mobile-stops.ts`
- Test: `src/lib/members/mobile-stops.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `StopEvent`, `pickTodaysStop`, `pickNextStop`, `formatStopTime`, `formatStopDay`.
- Produces:
  - `type HostLocation = { name: string; slug: string; city: string; street: string | null; lat: number; lng: number }`
  - `type StopPlacement = { kind: "member"; host: HostLocation; lat: number; lng: number } | { kind: "address"; lat: number; lng: number } | { kind: "none" }`
  - `MOBILE_PIN_OFFSET_LNG = 0.0009`
  - `normalizeBusinessName(name: string): string`
  - `placeStop(stop: StopEvent, hosts: HostLocation[]): StopPlacement`
  - `type StopSummary = { state: "at-member"; hostName: string; time: string } | { state: "at-address"; venue: string; address: string; time: string } | { state: "in-city"; place: string | null; time: string } | { state: "next"; day: string; city: string | null } | { state: "none" }`
  - `summarizeStops(events: StopEvent[], hosts: HostLocation[], now: Date): { summary: StopSummary; placement: StopPlacement }`
  - `needsStopGeocode(e: StopEvent, now: Date, hours?: number): boolean`
  - `stopCoordinates(e: StopEvent): { lat: number; lng: number } | null`

- [ ] **Step 1: Append the failing tests**

Append to `src/lib/members/mobile-stops.test.ts` (and merge the new names into the existing top import from `./mobile-stops`):
```ts
import {
  needsStopGeocode,
  normalizeBusinessName,
  placeStop,
  stopCoordinates,
  summarizeStops,
  MOBILE_PIN_OFFSET_LNG,
  type HostLocation,
} from "./mobile-stops";

const HOSTS: HostLocation[] = [
  { name: "All Points Brewing Co.", slug: "all-points", city: "Riverside", street: "2023 Chicago Ave Unit B8", lat: 33.977, lng: -117.353 },
  { name: "Sample Brewing Co.", slug: "sample-riv", city: "Riverside", street: "3750 Main Street", lat: 33.98, lng: -117.375 },
  { name: "Sample Brewing Co.", slug: "sample-ont", city: "Ontario", street: "100 Euclid Ave", lat: 34.06, lng: -117.65 },
];
const today = { starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" };

describe("normalizeBusinessName", () => {
  it("ignores case, spaces, punctuation and a trailing Co. / Company", () => {
    expect(normalizeBusinessName("  All Points Brewing Co. ")).toBe("all points brewing");
    expect(normalizeBusinessName("ALL POINTS BREWING COMPANY")).toBe("all points brewing");
    expect(normalizeBusinessName("All  Points Brewing")).toBe("all points brewing");
  });
});

describe("placeStop", () => {
  it("rule 1: at a Guild member by venue name -> beside that member's pin", () => {
    const p = placeStop(stop({ ...today, venue_name: "All Points Brewing Company" }), HOSTS);
    expect(p).toEqual({ kind: "member", host: HOSTS[0], lat: 33.977, lng: -117.353 + MOBILE_PIN_OFFSET_LNG });
  });

  it("rule 1: by street address", () => {
    const p = placeStop(stop({ ...today, address: "2023 Chicago Ave Unit B8, Riverside, CA 92507" }), HOSTS);
    expect(p.kind).toBe("member");
  });

  it("rule 1: a business with several locations uses the one in the stop's city", () => {
    const p = placeStop(stop({ ...today, venue_name: "Sample Brewing Co.", city: "Ontario" }), HOSTS);
    expect(p.kind === "member" && p.host.slug).toBe("sample-ont");
  });

  it("rule 1: several locations and no city match -> rule doesn't apply", () => {
    const p = placeStop(stop({ ...today, venue_name: "Sample Brewing Co.", city: "Corona" }), HOSTS);
    expect(p.kind).toBe("none");
  });

  it("rule 2: coordinates looked up for the current address", () => {
    const addr = "3900 Main St, Riverside, CA";
    const p = placeStop(stop({ ...today, address: addr, latitude: 33.98, longitude: -117.37, geocoded_address: addr }), HOSTS);
    expect(p).toEqual({ kind: "address", lat: 33.98, lng: -117.37 });
  });

  it("rule 2: coordinates for an OLD address are not used", () => {
    const p = placeStop(
      stop({ ...today, address: "500 New St, Riverside, CA", latitude: 33.98, longitude: -117.37, geocoded_address: "3900 Main St, Riverside, CA" }),
      HOSTS,
    );
    expect(p.kind).toBe("none");
  });

  it("rule 3: city only -> no pin", () => {
    expect(placeStop(stop({ ...today, city: "Corona" }), HOSTS).kind).toBe("none");
  });
});

describe("summarizeStops", () => {
  it("today at a Guild member", () => {
    const r = summarizeStops([stop({ ...today, venue_name: "All Points Brewing Co." })], HOSTS, NOW);
    expect(r.summary).toEqual({ state: "at-member", hostName: "All Points Brewing Co.", time: "5–9 pm" });
    expect(r.placement.kind).toBe("member");
  });

  it("today at a street address", () => {
    const addr = "3900 Main St, Riverside";
    const r = summarizeStops(
      [stop({ ...today, venue_name: "Riverside Food Truck Night", address: addr, latitude: 33.98, longitude: -117.37, geocoded_address: addr })],
      HOSTS,
      NOW,
    );
    expect(r.summary).toEqual({ state: "at-address", venue: "Riverside Food Truck Night", address: addr, time: "5–9 pm" });
  });

  it("today, city only", () => {
    const r = summarizeStops([stop({ ...today, city: "Corona" })], HOSTS, NOW);
    expect(r.summary).toEqual({ state: "in-city", place: "Corona", time: "5–9 pm" });
    expect(r.placement.kind).toBe("none");
  });

  it("no stop today -> next stop", () => {
    const r = summarizeStops([stop({ starts_at: "2026-10-10T00:00:00Z", city: "Riverside" })], HOSTS, NOW);
    expect(r.summary).toEqual({ state: "next", day: "Fri", city: "Riverside" });
  });

  it("nothing in 14 days -> none", () => {
    expect(summarizeStops([], HOSTS, NOW).summary).toEqual({ state: "none" });
  });
});

describe("needsStopGeocode / stopCoordinates", () => {
  const soon = "2026-10-06T01:00:00Z";
  it("a street address in the next 48 hours, never looked up -> yes", () => {
    expect(needsStopGeocode(stop({ starts_at: soon, address: "3900 Main St, Riverside, CA" }), NOW)).toBe(true);
  });
  it("already looked up for this address -> no; address changed -> yes", () => {
    const addr = "3900 Main St, Riverside, CA";
    expect(needsStopGeocode(stop({ starts_at: soon, address: addr, geocoded_address: addr }), NOW)).toBe(false);
    expect(needsStopGeocode(stop({ starts_at: soon, address: "1 New St, Riverside", geocoded_address: addr }), NOW)).toBe(true);
  });
  it("no street number, past, or more than 48 hours out -> no", () => {
    expect(needsStopGeocode(stop({ starts_at: soon, address: "Riverside, CA" }), NOW)).toBe(false);
    expect(needsStopGeocode(stop({ starts_at: "2026-10-04T01:00:00Z", address: "3900 Main St" }), NOW)).toBe(false);
    expect(needsStopGeocode(stop({ starts_at: "2026-10-09T01:00:00Z", address: "3900 Main St" }), NOW)).toBe(false);
  });
  it("stopCoordinates only while geocoded_address matches", () => {
    const addr = "3900 Main St";
    expect(stopCoordinates(stop({ address: addr, geocoded_address: addr, latitude: "33.98", longitude: "-117.37" }))).toEqual({ lat: 33.98, lng: -117.37 });
    expect(stopCoordinates(stop({ address: "x", geocoded_address: addr, latitude: 1, longitude: 1 }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/members/mobile-stops.test.ts`
Expected: FAIL. `placeStop` / `summarizeStops` / … are not exported.

- [ ] **Step 3: Append the implementation to `mobile-stops.ts`**

```ts
export type HostLocation = { name: string; slug: string; city: string; street: string | null; lat: number; lng: number };

export type StopPlacement =
  | { kind: "member"; host: HostLocation; lat: number; lng: number }
  | { kind: "address"; lat: number; lng: number }
  | { kind: "none" };

/** The mobile pin sits this far east of the host's pin (~80 m) so both show. */
export const MOBILE_PIN_OFFSET_LNG = 0.0009;

export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(co|company)$/, "")
    .trim();
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The stop's own coordinates -- only while they belong to its current address. */
export function stopCoordinates(e: StopEvent): { lat: number; lng: number } | null {
  if (!clean(e.address) || clean(e.geocoded_address) !== clean(e.address)) return null;
  const lat = toNumber(e.latitude);
  const lng = toNumber(e.longitude);
  return lat === null || lng === null ? null : { lat, lng };
}

function hostFor(e: StopEvent, hosts: HostLocation[]): HostLocation | null {
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

export function placeStop(e: StopEvent, hosts: HostLocation[]): StopPlacement {
  const host = hostFor(e, hosts);
  if (host) return { kind: "member", host, lat: host.lat, lng: host.lng + MOBILE_PIN_OFFSET_LNG };
  const own = stopCoordinates(e);
  if (own) return { kind: "address", ...own };
  return { kind: "none" };
}

export type StopSummary =
  | { state: "at-member"; hostName: string; time: string }
  | { state: "at-address"; venue: string; address: string; time: string }
  | { state: "in-city"; place: string | null; time: string }
  | { state: "next"; day: string; city: string | null }
  | { state: "none" };

export function summarizeStops(
  events: StopEvent[],
  hosts: HostLocation[],
  now: Date,
): { summary: StopSummary; placement: StopPlacement } {
  const todays = pickTodaysStop(events, now);
  if (todays) {
    const placement = placeStop(todays, hosts);
    const time = formatStopTime(todays);
    if (placement.kind === "member") return { summary: { state: "at-member", hostName: placement.host.name, time }, placement };
    if (placement.kind === "address") {
      return {
        summary: {
          state: "at-address",
          venue: clean(todays.venue_name) || clean(todays.title) || clean(todays.address),
          address: clean(todays.address),
          time,
        },
        placement,
      };
    }
    return { summary: { state: "in-city", place: clean(todays.city) || clean(todays.venue_name) || null, time }, placement };
  }
  const next = pickNextStop(events, now);
  if (next) return { summary: { state: "next", day: formatStopDay(next), city: clean(next.city) || null }, placement: { kind: "none" } };
  return { summary: { state: "none" }, placement: { kind: "none" } };
}

const LOOKUP_WINDOW_HOURS = 48;

/** The cron looks a stop up when it has a street address (a number in it), starts within 48 hours, and isn't looked up for this address yet. */
export function needsStopGeocode(e: StopEvent, now: Date, hours = LOOKUP_WINDOW_HOURS): boolean {
  const address = clean(e.address);
  if (!address || !/\d/.test(address)) return false;
  if (clean(e.geocoded_address) === address) return false;
  const start = new Date(stopStart(e)).getTime();
  return start >= now.getTime() - DEFAULT_LENGTH_MS && start <= now.getTime() + hours * 3600 * 1000;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/members/mobile-stops.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/members/mobile-stops.ts src/lib/members/mobile-stops.test.ts
git commit -m "feat(members-v2): where a mobile member's stop goes on the map, and its card line"
```

---

### Task 4: Stop lookup on the 15-minute cron

**Files:**
- Create: `src/lib/events/stop-geocode.ts`, `src/lib/events/stop-geocode.test.ts`
- Create: `src/lib/events/stop-geocode-cron.server.ts`
- Modify: `src/server.ts` (the `*/15` branch)

**Interfaces:**
- Consumes: `StopEvent`, `needsStopGeocode` (Task 3); `geocodeAddress`, `GeocodeResult` from `@/lib/geo/geocode`; `STOP_EVENT_COLUMNS` (Task 2).
- Produces:
  - `geocodeStops(deps: { loadStops: () => Promise<StopEvent[]>; geocode: (address: string) => Promise<{ lat: number; lng: number } | null>; save: (id: string, patch: { latitude: number | null; longitude: number | null; geocoded_address: string }) => Promise<void>; now: Date; limit?: number }): Promise<{ looked: number; saved: number }>`
  - `geocodeUpcomingMobileStops(): Promise<void>` (server-only)

- [ ] **Step 1: Write the failing test**

`src/lib/events/stop-geocode.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { StopEvent } from "@/lib/members/mobile-stops";
import { geocodeStops } from "./stop-geocode";

const NOW = new Date("2026-10-05T22:00:00Z");
function stop(id: string, overrides: Partial<StopEvent> = {}): StopEvent {
  return {
    id, member_id: "m1", title: null, venue_name: null, city: "Riverside",
    address: `${id} Main St, Riverside, CA`, starts_at: "2026-10-06T01:00:00Z", ends_at: null,
    all_day: false, overlay_status: null, overlay_starts_at: null, is_hidden: false,
    latitude: null, longitude: null, geocoded_address: null, ...overrides,
  };
}

describe("geocodeStops", () => {
  it("looks up only stops that need it, and saves coordinates with the address", async () => {
    const save = vi.fn(async () => {});
    const geocode = vi.fn(async () => ({ lat: 33.9, lng: -117.3 }));
    const done = stop("2", { geocoded_address: "2 Main St, Riverside, CA" });
    const r = await geocodeStops({ loadStops: async () => [stop("1"), done], geocode, save, now: NOW });
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("1", { latitude: 33.9, longitude: -117.3, geocoded_address: "1 Main St, Riverside, CA" });
    expect(r).toEqual({ looked: 1, saved: 1 });
  });

  it("stops at the limit (20 by default)", async () => {
    const stops = Array.from({ length: 25 }, (_, i) => stop(String(i + 1)));
    const geocode = vi.fn(async () => ({ lat: 1, lng: 1 }));
    const r = await geocodeStops({ loadStops: async () => stops, geocode, save: async () => {}, now: NOW });
    expect(geocode).toHaveBeenCalledTimes(20);
    expect(r.looked).toBe(20);
  });

  it("nothing found: saves the address with no coordinates, so it isn't retried every run", async () => {
    const save = vi.fn(async () => {});
    await geocodeStops({ loadStops: async () => [stop("1")], geocode: async () => null, save, now: NOW });
    expect(save).toHaveBeenCalledWith("1", { latitude: null, longitude: null, geocoded_address: "1 Main St, Riverside, CA" });
  });

  it("a lookup that throws is skipped (retried next run) and the rest continue", async () => {
    const save = vi.fn(async () => {});
    const geocode = vi.fn(async (a: string) => {
      if (a.startsWith("1 ")) throw new Error("OVER_QUERY_LIMIT");
      return { lat: 2, lng: 2 };
    });
    const r = await geocodeStops({ loadStops: async () => [stop("1"), stop("2")], geocode, save, now: NOW });
    expect(save).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ looked: 2, saved: 1 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/events/stop-geocode.test.ts`
Expected: FAIL with "Cannot find module './stop-geocode'".

- [ ] **Step 3: Write `stop-geocode.ts`**

```ts
import { needsStopGeocode, type StopEvent } from "@/lib/members/mobile-stops";

/**
 * Looks up map coordinates for mobile members' upcoming stops (Members page
 * v2). The I/O comes in as deps so this is unit tested; the cron wires the
 * real Supabase client and Google key (stop-geocode-cron.server.ts).
 * Never throws: a failed lookup is logged and retried on the next run.
 */
export async function geocodeStops(deps: {
  loadStops: () => Promise<StopEvent[]>;
  geocode: (address: string) => Promise<{ lat: number; lng: number } | null>;
  save: (id: string, patch: { latitude: number | null; longitude: number | null; geocoded_address: string }) => Promise<void>;
  now: Date;
  limit?: number;
}): Promise<{ looked: number; saved: number }> {
  const limit = deps.limit ?? 20;
  let stops: StopEvent[];
  try {
    stops = await deps.loadStops();
  } catch (err) {
    console.error("geocodeStops: couldn't load stops", err);
    return { looked: 0, saved: 0 };
  }
  const due = stops.filter((s) => needsStopGeocode(s, deps.now)).slice(0, limit);
  let saved = 0;
  for (const s of due) {
    const address = (s.address ?? "").trim();
    try {
      const found = await deps.geocode(address);
      await deps.save(s.id, { latitude: found?.lat ?? null, longitude: found?.lng ?? null, geocoded_address: address });
      saved += 1;
    } catch (err) {
      console.error(`geocodeStops: lookup failed for event ${s.id}`, err);
    }
  }
  return { looked: due.length, saved };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/events/stop-geocode.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Write the cron wiring `stop-geocode-cron.server.ts`**

```ts
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geo/geocode";
import { STOP_EVENT_COLUMNS, type StopEvent } from "@/lib/members/mobile-stops";
import { geocodeStops } from "@/lib/events/stop-geocode";

/**
 * The 15-minute cron's stop lookup (Members page v2). Service-role client:
 * no user session, and it writes only latitude/longitude/geocoded_address
 * on published mobile members' events in the next 48 hours. Both Workers
 * (staging and production share the database) run it; a stop already
 * looked up for its address is skipped, so the worst case is one duplicate
 * lookup when both run at the same moment.
 */
export async function geocodeUpcomingMobileStops(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const apiKey = (env as { GOOGLE_GEOCODING_API_KEY?: string }).GOOGLE_GEOCODING_API_KEY?.trim();
    if (!apiKey) return;
    const supabase = await getSupabaseServiceRoleClient();
    const now = new Date();
    await geocodeStops({
      now,
      loadStops: async () => {
        const { data: members, error } = await supabase
          .from("members")
          .select("id")
          .eq("status", "published")
          .eq("member_type", "mobile");
        if (error) throw error;
        const ids = (members ?? []).map((m) => m.id as string);
        if (ids.length === 0) return [];
        const from = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
        const to = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
        const { data, error: eventsError } = await supabase
          .from("events")
          .select(STOP_EVENT_COLUMNS)
          .in("member_id", ids)
          .eq("kind", "event")
          .or(`and(starts_at.gte.${from},starts_at.lte.${to}),and(overlay_starts_at.gte.${from},overlay_starts_at.lte.${to})`);
        if (eventsError) throw eventsError;
        return (data ?? []) as unknown as StopEvent[];
      },
      geocode: async (address) => {
        const r = await geocodeAddress({ address, apiKey });
        return r ? { lat: r.lat, lng: r.lng } : null;
      },
      save: async (id, patch) => {
        const { error } = await supabase.from("events").update(patch).eq("id", id);
        if (error) throw error;
      },
    });
  } catch (err) {
    console.error("geocodeUpcomingMobileStops failed", err);
  }
}
```

- [ ] **Step 6: Run it on the cron**

In `src/server.ts`, change the `*/15` branch to:
```ts
    if (controller.cron === "*/15 * * * *") {
      const { refreshAllIcsConnections } = await import("./lib/events/ics-refresh-cron.server");
      ctx.waitUntil(refreshAllIcsConnections());
      // Members page v2: map positions for mobile members' upcoming stops.
      const { geocodeUpcomingMobileStops } = await import("./lib/events/stop-geocode-cron.server");
      ctx.waitUntil(geocodeUpcomingMobileStops());
    } else if (controller.cron === "0 13 * * *") {
```

- [ ] **Step 7: Run the suite and build**

Run: `npm run test` then `npm run build`
Expected: all tests pass; the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/events/stop-geocode.ts src/lib/events/stop-geocode.test.ts src/lib/events/stop-geocode-cron.server.ts src/server.ts
git commit -m "feat(members-v2): the 15-minute cron looks up map positions for mobile members' upcoming stops"
```

---

### Task 5: Search, filter, Near me and location split (pure)

**Files:**
- Create: `src/lib/members/directory-filters.ts`, `src/lib/members/directory-filters.test.ts`

**Interfaces:**
- Consumes: `MemberType` from `@/lib/supabase/types`.
- Produces:
  - `type FilterableCard = { name: string; memberType: MemberType; locations: Array<{ city: string; lat: number | null; lng: number | null }> }`
  - `type LatLng = { lat: number; lng: number }`
  - `normalizeForSearch(s: string): string`
  - `matchesSearch(card: FilterableCard, query: string): boolean`
  - `filterCards<T extends FilterableCard>(cards: T[], opts: { query: string; type?: MemberType }): T[]`
  - `distanceMiles(a: LatLng, b: LatLng): number`
  - `nearestDistance(points: LatLng[], origin: LatLng): number | null`
  - `orderByDistance<T>(cards: T[], origin: LatLng, pointsOf: (card: T) => LatLng[], nameOf: (card: T) => string): T[]`
  - `formatMiles(miles: number): string`, for example "1.2 mi"
  - `splitLocations<T>(locations: T[], shown?: number): { shown: T[]; hidden: T[] }`

- [ ] **Step 1: Write the failing tests**

`src/lib/members/directory-filters.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  distanceMiles,
  filterCards,
  formatMiles,
  matchesSearch,
  nearestDistance,
  orderByDistance,
  splitLocations,
  type FilterableCard,
} from "./directory-filters";

const card = (name: string, memberType: FilterableCard["memberType"], cities: string[], pins: Array<[number, number] | null> = []): FilterableCard => ({
  name,
  memberType,
  locations: cities.map((city, i) => ({ city, lat: pins[i]?.[0] ?? null, lng: pins[i]?.[1] ?? null })),
});

const ALL = [
  card("Hangar 24 Brewing Co.", "producer", ["Irvine", "Redlands", "Riverside"]),
  card("Café Cerveza", "producer", ["Ontario"]),
  card("Sample Taco Truck", "mobile", ["Riverside"]),
  card("Sample Supply Co.", "allied", ["Ontario"]),
];

describe("search", () => {
  it("matches the business name or any of its cities, ignoring case, accents and outer spaces", () => {
    expect(matchesSearch(ALL[0], "  HANGAR ")).toBe(true);
    expect(matchesSearch(ALL[0], "redlands")).toBe(true);
    expect(matchesSearch(ALL[1], "cafe")).toBe(true);
    expect(matchesSearch(ALL[1], "corona")).toBe(false);
  });
  it("an empty search matches everything", () => {
    expect(filterCards(ALL, { query: "   " })).toHaveLength(4);
  });
});

describe("type filter", () => {
  it("keeps only that type; none = all types", () => {
    expect(filterCards(ALL, { query: "", type: "mobile" }).map((c) => c.name)).toEqual(["Sample Taco Truck"]);
    expect(filterCards(ALL, { query: "ontario", type: "allied" }).map((c) => c.name)).toEqual(["Sample Supply Co."]);
  });
});

describe("distance and Near me", () => {
  const riverside = { lat: 33.9806, lng: -117.3755 };
  it("distanceMiles: Riverside to Ontario is about 16 miles", () => {
    expect(distanceMiles(riverside, { lat: 34.0633, lng: -117.6509 })).toBeGreaterThan(15);
    expect(distanceMiles(riverside, { lat: 34.0633, lng: -117.6509 })).toBeLessThan(18);
  });
  it("formatMiles has one decimal", () => {
    expect(formatMiles(1.234)).toBe("1.2 mi");
    expect(formatMiles(11.66)).toBe("11.7 mi");
  });
  it("orders by nearest location; members with no pin go last, A–Z", () => {
    type C = { name: string; pts: Array<{ lat: number; lng: number }> };
    const cards: C[] = [
      { name: "Zeta (no pin)", pts: [] },
      { name: "Far", pts: [{ lat: 34.06, lng: -117.65 }] },
      { name: "Alpha (no pin)", pts: [] },
      { name: "Near", pts: [{ lat: 34.5, lng: -117.3 }, { lat: 33.98, lng: -117.37 }] },
    ];
    const ordered = orderByDistance(cards, riverside, (c) => c.pts, (c) => c.name).map((c) => c.name);
    expect(ordered).toEqual(["Near", "Far", "Alpha (no pin)", "Zeta (no pin)"]);
    expect(nearestDistance([], riverside)).toBeNull();
  });
});

describe("splitLocations", () => {
  it("shows two, hides the rest; two or fewer shows all", () => {
    expect(splitLocations([1, 2, 3, 4])).toEqual({ shown: [1, 2], hidden: [3, 4] });
    expect(splitLocations([1, 2])).toEqual({ shown: [1, 2], hidden: [] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/members/directory-filters.test.ts`
Expected: FAIL with "Cannot find module './directory-filters'".

- [ ] **Step 3: Write `directory-filters.ts`**

```ts
import type { MemberType } from "@/lib/supabase/types";

/** Search, filter and Near-me order for the Members page v2 list (spec "Search, filter and order"). Pure. */
export type FilterableCard = {
  name: string;
  memberType: MemberType;
  locations: Array<{ city: string; lat: number | null; lng: number | null }>;
};

export type LatLng = { lat: number; lng: number };

export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesSearch(card: FilterableCard, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return [card.name, ...card.locations.map((l) => l.city)].some((text) => normalizeForSearch(text).includes(q));
}

export function filterCards<T extends FilterableCard>(cards: T[], opts: { query: string; type?: MemberType }): T[] {
  return cards.filter((c) => (!opts.type || c.memberType === opts.type) && matchesSearch(c, opts.query));
}

const EARTH_RADIUS_MILES = 3958.8;

export function distanceMiles(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export function nearestDistance(points: LatLng[], origin: LatLng): number | null {
  if (points.length === 0) return null;
  return Math.min(...points.map((p) => distanceMiles(origin, p)));
}

export function orderByDistance<T>(
  cards: T[],
  origin: LatLng,
  pointsOf: (card: T) => LatLng[],
  nameOf: (card: T) => string,
): T[] {
  return [...cards]
    .map((card) => ({ card, d: nearestDistance(pointsOf(card), origin) }))
    .sort((a, b) => {
      if (a.d === null && b.d === null) return nameOf(a.card).localeCompare(nameOf(b.card));
      if (a.d === null) return 1;
      if (b.d === null) return -1;
      return a.d - b.d;
    })
    .map((x) => x.card);
}

export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

export function splitLocations<T>(locations: T[], shown = 2): { shown: T[]; hidden: T[] } {
  return { shown: locations.slice(0, shown), hidden: locations.slice(shown) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/members/directory-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/members/directory-filters.ts src/lib/members/directory-filters.test.ts
git commit -m "feat(members-v2): search, type filter, Near-me order and the location split"
```

---

### Task 6: Pin icons and when the map moves (pure)

**Files:**
- Create: `src/lib/maps/pin-icons.ts`, `src/lib/maps/pin-icons.test.ts`
- Create: `src/lib/maps/pan-decision.ts`, `src/lib/maps/pan-decision.test.ts`

**Interfaces:**
- Consumes: `MobileIcon` (Task 2).
- Produces:
  - `type PinLook = "normal" | "member" | "focused"`
  - `locationPinSvg(look: PinLook, label?: string): { url: string; width: number; height: number; anchorX: number; anchorY: number }`
  - `mobilePinSvg(icon: MobileIcon, look: PinLook, label?: string): { url, width, height, anchorX, anchorY }` (same shape)
  - `type PanDecision = { kind: "none" } | { kind: "pan"; to: { lat: number; lng: number } } | { kind: "fit"; points: Array<{ lat: number; lng: number }> }`
  - `panDecision(targets: Array<{ lat: number; lng: number }>, inView: (p: { lat: number; lng: number }) => boolean): PanDecision`

- [ ] **Step 1: Write the failing tests**

`src/lib/maps/pan-decision.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { panDecision } from "./pan-decision";

const a = { lat: 1, lng: 1 };
const b = { lat: 2, lng: 2 };

describe("panDecision (spec: the map only moves when it has to)", () => {
  it("nothing highlighted, or everything in view -> don't move", () => {
    expect(panDecision([], () => false)).toEqual({ kind: "none" });
    expect(panDecision([a, b], () => true)).toEqual({ kind: "none" });
  });
  it("one pin off-screen -> pan to it", () => {
    expect(panDecision([a], () => false)).toEqual({ kind: "pan", to: a });
  });
  it("several pins, some off-screen -> fit them all", () => {
    expect(panDecision([a, b], (p) => p === a)).toEqual({ kind: "fit", points: [a, b] });
  });
});
```

`src/lib/maps/pin-icons.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { locationPinSvg, mobilePinSvg } from "./pin-icons";

function svgOf(url: string): string {
  return decodeURIComponent(url.replace("data:image/svg+xml;charset=UTF-8,", ""));
}

describe("pin icons", () => {
  it("location pins: red normally, orange when highlighted, bigger when focused", () => {
    expect(svgOf(locationPinSvg("normal").url)).toContain("#D93A2B");
    expect(svgOf(locationPinSvg("member").url)).toContain("#E8913A");
    expect(locationPinSvg("focused").height).toBeGreaterThan(locationPinSvg("member").height);
    expect(locationPinSvg("member").height).toBeGreaterThan(locationPinSvg("normal").height);
  });
  it("the focused pin carries its label, escaped", () => {
    const svg = svgOf(locationPinSvg("focused", "HANGAR 24 & CO · REDLANDS").url);
    expect(svg).toContain("HANGAR 24 &amp; CO · REDLANDS");
  });
  it("the anchor is the pin's tip (bottom center of the pin)", () => {
    const p = locationPinSvg("normal");
    expect(p.anchorY).toBe(p.height);
  });
  it.each(["truck", "tent", "mic", "star"] as const)("mobile pin %s is a teal circle with its own icon", (icon) => {
    const svg = svgOf(mobilePinSvg(icon, "normal").url);
    expect(svg).toContain("#17605F");
    expect(svg).toContain(`data-icon="${icon}"`);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/maps`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write `pan-decision.ts`**

```ts
export type LatLngLiteral = { lat: number; lng: number };
export type PanDecision = { kind: "none" } | { kind: "pan"; to: LatLngLiteral } | { kind: "fit"; points: LatLngLiteral[] };

/** Spec "Map behavior": move only when a highlighted pin is off-screen; never move back. */
export function panDecision(targets: LatLngLiteral[], inView: (p: LatLngLiteral) => boolean): PanDecision {
  if (targets.length === 0 || targets.every(inView)) return { kind: "none" };
  if (targets.length === 1) return { kind: "pan", to: targets[0] };
  return { kind: "fit", points: targets };
}
```

- [ ] **Step 4: Write `pin-icons.ts`**

```ts
import type { MobileIcon } from "@/lib/members/mobile-category";

/**
 * Map pins as SVG data URLs for google.maps.Marker icons (artboards B2,
 * B5, B6). Red location pins; orange when their member is highlighted;
 * bigger with an orange name label when focused. Mobile members: a teal
 * circle with their category's icon.
 */
export type PinLook = "normal" | "member" | "focused";
export type PinIcon = { url: string; width: number; height: number; anchorX: number; anchorY: number };

const RED = "#D93A2B";
const ORANGE = "#E8913A";
const TEAL = "#17605F";
const LABEL_H = 26;
const LABEL_GAP = 6;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function withLabel(body: string, bodyW: number, bodyH: number, label: string | undefined): PinIcon {
  if (!label) {
    return { url: toUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${bodyW}" height="${bodyH}" viewBox="0 0 ${bodyW} ${bodyH}">${body}</svg>`), width: bodyW, height: bodyH, anchorX: bodyW / 2, anchorY: bodyH };
  }
  const labelW = Math.round(16 + label.length * 7.4);
  const w = Math.max(bodyW, labelW);
  const h = LABEL_H + LABEL_GAP + bodyH;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="${(w - labelW) / 2}" y="0" width="${labelW}" height="${LABEL_H}" rx="6" fill="${ORANGE}"/>` +
    `<text x="${w / 2}" y="17.5" text-anchor="middle" font-family="Chivo, Arial, sans-serif" font-size="12" font-weight="700" fill="#171410">${esc(label)}</text>` +
    `<g transform="translate(${(w - bodyW) / 2},${LABEL_H + LABEL_GAP})">${body}</g></svg>`;
  return { url: toUrl(svg), width: w, height: h, anchorX: w / 2, anchorY: h };
}

const SCALE: Record<PinLook, number> = { normal: 1, member: 1.25, focused: 1.45 };

export function locationPinSvg(look: PinLook, label?: string): PinIcon {
  const s = SCALE[look];
  const w = Math.round(24 * s);
  const h = Math.round(34 * s);
  const fill = look === "normal" ? RED : ORANGE;
  const body =
    `<g transform="scale(${s})"><path d="M12 33 C9 24 1 20 1 12 A11 11 0 0 1 23 12 C23 20 15 24 12 33Z" fill="${fill}" stroke="#FFFFFF" stroke-width="1.5"/>` +
    `<circle cx="12" cy="12" r="4" fill="#FFFFFF"/></g>`;
  return withLabel(body, w, h, look === "focused" ? label : undefined);
}

const GLYPHS: Record<MobileIcon, string> = {
  truck: '<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  tent: '<path d="M3 20L12 4l9 16zM12 4v16M8.5 20l3.5-6 3.5 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};

export function mobilePinSvg(icon: MobileIcon, look: PinLook, label?: string): PinIcon {
  const s = SCALE[look];
  const d = Math.round(32 * s);
  const stroke = look === "normal" ? "#FFFFFF" : ORANGE;
  const body =
    `<g transform="scale(${s})"><circle cx="16" cy="16" r="14.5" fill="${TEAL}" stroke="${stroke}" stroke-width="2.5"/>` +
    `<g data-icon="${icon}" transform="translate(7,7) scale(0.75)" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[icon]}</g></g>`;
  const pin = withLabel(body, d, d, look === "focused" ? label : undefined);
  // A circle's "tip" is its center-bottom, like the location pins.
  return pin;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/maps`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/maps
git commit -m "feat(members-v2): map pin icons and the pan-only-when-off-screen rule"
```

---

### Task 7: v2 cards, server data and the production gate

**Files:**
- Modify: `src/lib/members/directory.ts` (add `street` to `DirectoryLocation`; set it in `toLocation`)
- Modify: `src/lib/members/directory.test.ts` (one assertion for `street`)
- Modify: `src/lib/members/directory.server.ts` (extract `loadDirectory`)
- Create: `src/lib/members/members-v2-gate.ts`, `src/lib/members/members-v2-gate.test.ts`
- Create: `src/lib/members/members-v2.ts`, `src/lib/members/members-v2.test.ts`
- Create: `src/lib/members/members-v2.server.ts`

**Interfaces:**
- Consumes: `DirectoryMember`, `DirectoryMemberRow`, `buildDirectoryMembers`; Task 2–3's `MobileCategory`, `mobileIconFor`, `mobileTagFor`, `StopEvent`, `summarizeStops`, `HostLocation`, `StopSummary`, `StopPlacement`, `STOP_EVENT_COLUMNS`.
- Produces:
  - `DirectoryLocation.street: string | null` (additive)
  - `loadDirectory(supabase): Promise<{ rows: DirectoryMemberRow[]; members: DirectoryMember[] }>`
  - `isMembersV2Host(url: string): boolean`
  - `type V2Card = DirectoryMember & { key: string; tag: string | null; mobileIcon: MobileIcon | null; stop: StopSummary | null; stopPin: { lat: number; lng: number } | null }`
  - `type V2Pin = { key: string; cardKey: string; slug: string; name: string; city: string; address: string; lat: number; lng: number; kind: "location" | "mobile"; icon: MobileIcon | null; website: string | null; stopLine: string | null }`
  - `buildV2(args: { members: DirectoryMember[]; rows: DirectoryMemberRow[]; categoriesByMemberId: Map<string, MobileCategory[]>; stopsByMemberId: Map<string, StopEvent[]>; now: Date }): { cards: V2Card[]; pins: V2Pin[] }`
  - `getMembersV2Data` server function returning `{ enabled: false } | { enabled: true; cards: V2Card[]; pins: V2Pin[] }`

- [ ] **Step 1: Write the failing tests**

`src/lib/members/members-v2-gate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isMembersV2Host } from "./members-v2-gate";

describe("isMembersV2Host (/members-2 never shows on the live site)", () => {
  it.each([
    ["https://iscbrewersguild.org/members-2", false],
    ["https://www.iscbrewersguild.org/members-2", false],
    ["https://ISCBrewersGuild.org/members-2", false],
    ["https://ie-brewers-guild-staging.boblelle77.workers.dev/members-2", true],
    ["http://localhost:5199/members-2", true],
    ["not a url", false],
  ])("%s -> %s", (url, allowed) => {
    expect(isMembersV2Host(url)).toBe(allowed);
  });
});
```

`src/lib/members/members-v2.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildDirectoryMembers, type DirectoryMemberRow } from "./directory";
import { buildV2 } from "./members-v2";
import type { StopEvent } from "./mobile-stops";

function row(o: Partial<DirectoryMemberRow>): DirectoryMemberRow {
  return {
    id: "p1", slug: "all-points", member_type: "producer", business_name: "All Points Brewing Co.",
    city: "Riverside", state: "CA", street_address: "2023 Chicago Ave Unit B8", postal_code: "92507",
    latitude: 33.977, longitude: -117.353, logo_asset_id: null, ...o,
  };
}
const NOW = new Date("2026-10-05T22:00:00Z");
const rows = [
  row({}),
  row({ id: "t1", slug: "taco", member_type: "mobile", business_name: "Sample Taco Truck", street_address: null, latitude: null, longitude: null }),
];
const members = buildDirectoryMembers({ rows, links: [], logoUrls: new Map() });
const truckStop: StopEvent = {
  id: "e1", member_id: "t1", title: null, venue_name: "All Points Brewing Co.", city: "Riverside", address: null,
  starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z", all_day: false, overlay_status: null,
  overlay_starts_at: null, is_hidden: false, latitude: null, longitude: null, geocoded_address: null,
};

describe("buildV2", () => {
  const v2 = buildV2({
    members,
    rows,
    categoriesByMemberId: new Map([["t1", [{ name: "Food Truck", slug: "food-truck", sort_order: 1 }]]]),
    stopsByMemberId: new Map([["t1", [truckStop]]]),
    now: NOW,
  });

  it("producers: no tag, no stop; one location pin each", () => {
    const ap = v2.cards.find((c) => c.name === "All Points Brewing Co.")!;
    expect(ap.tag).toBeNull();
    expect(ap.stop).toBeNull();
    expect(v2.pins.filter((p) => p.cardKey === ap.key && p.kind === "location")).toHaveLength(1);
  });

  it("a mobile member: category tag and icon, today's stop, and a mobile pin beside the host", () => {
    const truck = v2.cards.find((c) => c.name === "Sample Taco Truck")!;
    expect(truck.tag).toBe("FOOD TRUCK");
    expect(truck.mobileIcon).toBe("truck");
    expect(truck.stop).toEqual({ state: "at-member", hostName: "All Points Brewing Co.", time: "5–9 pm" });
    const pin = v2.pins.find((p) => p.cardKey === truck.key)!;
    expect(pin.kind).toBe("mobile");
    expect(pin.icon).toBe("truck");
    expect(pin.lng).toBeGreaterThan(-117.353);
    expect(pin.stopLine).toBe("Today 5–9 pm at All Points Brewing Co.");
  });

  it("an Allied Member is tagged ALLIED", () => {
    const allied = buildDirectoryMembers({ rows: [row({ id: "a1", slug: "supply", member_type: "allied", business_name: "Sample Supply Co." })], links: [], logoUrls: new Map() });
    const r = buildV2({ members: allied, rows: [row({ id: "a1", slug: "supply", member_type: "allied", business_name: "Sample Supply Co." })], categoriesByMemberId: new Map(), stopsByMemberId: new Map(), now: NOW });
    expect(r.cards[0].tag).toBe("ALLIED");
  });
});
```

In `src/lib/members/directory.test.ts`, add inside the existing `describe` for `buildDirectoryMembers` (or a new `it`):
```ts
it("each location carries its street address (Members page v2 rows)", () => {
  const [card] = buildDirectoryMembers({ rows: [row({})], links: [], logoUrls: new Map() });
  expect(card.locations[0].street).toBe("2060 Chicago Ave STE A17");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/members/members-v2-gate.test.ts src/lib/members/members-v2.test.ts src/lib/members/directory.test.ts`
Expected: FAIL (missing modules; `street` undefined).

- [ ] **Step 3: Add `street` to `DirectoryLocation`**

In `src/lib/members/directory.ts`, in `export type DirectoryLocation = {`, after `city: string;` add:
```ts
  /** The street address alone (Members page v2's location rows); null for a mobile member. */
  street: string | null;
```
And in `toLocation`, add `street: nonEmpty(row.street_address),` after `city: row.city,`.

- [ ] **Step 4: Write `members-v2-gate.ts`**

```ts
/**
 * /members-2 is a staging trial (spec "Goal"): it 404s on the live site's
 * hostnames, so merging staging into main can't put it in front of the
 * public. Remove this gate only when the owner decides v2 replaces /members.
 */
const PRODUCTION_HOSTS = new Set(["iscbrewersguild.org", "www.iscbrewersguild.org"]);

export function isMembersV2Host(url: string): boolean {
  try {
    return !PRODUCTION_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Write `members-v2.ts`**

```ts
import type { DirectoryMember, DirectoryMemberRow } from "@/lib/members/directory";
import { mobileIconFor, mobileTagFor, type MobileCategory, type MobileIcon } from "@/lib/members/mobile-category";
import { summarizeStops, type HostLocation, type StopEvent, type StopSummary } from "@/lib/members/mobile-stops";

/** Members page v2's cards and pins (spec; artboards B2-B6). Pure: the server function loads the inputs. */
export type V2Card = DirectoryMember & {
  /** Stable key: the business name (cards are one per business). */
  key: string;
  /** ALLIED, a mobile member's first category (or MOBILE), or null for producers. */
  tag: string | null;
  mobileIcon: MobileIcon | null;
  stop: StopSummary | null;
  stopPin: { lat: number; lng: number } | null;
};

export type V2Pin = {
  key: string;
  cardKey: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  kind: "location" | "mobile";
  icon: MobileIcon | null;
  website: string | null;
  /** The pop-up's line for a mobile pin: "Today 5–9 pm at All Points Brewing Co." */
  stopLine: string | null;
};

function hostsFrom(members: DirectoryMember[]): HostLocation[] {
  return members
    .filter((m) => m.memberType !== "mobile")
    .flatMap((m) =>
      m.locations.flatMap((l) =>
        l.lat !== null && l.lng !== null ? [{ name: m.name, slug: l.slug, city: l.city, street: l.street, lat: l.lat, lng: l.lng }] : [],
      ),
    );
}

function stopLineFor(summary: StopSummary): string | null {
  if (summary.state === "at-member") return `Today ${summary.time} at ${summary.hostName}`;
  if (summary.state === "at-address") return `Today ${summary.time} at ${summary.venue}`;
  return null;
}

export function buildV2(args: {
  members: DirectoryMember[];
  rows: DirectoryMemberRow[];
  categoriesByMemberId: Map<string, MobileCategory[]>;
  stopsByMemberId: Map<string, StopEvent[]>;
  now: Date;
}): { cards: V2Card[]; pins: V2Pin[] } {
  const idBySlug = new Map(args.rows.map((r) => [r.slug, r.id]));
  const hosts = hostsFrom(args.members);
  const cards: V2Card[] = [];
  const pins: V2Pin[] = [];

  for (const m of args.members) {
    const key = m.name;
    if (m.memberType === "mobile") {
      const memberId = idBySlug.get(m.locations[0]?.slug ?? "") ?? "";
      const categories = args.categoriesByMemberId.get(memberId) ?? [];
      const { summary, placement } = summarizeStops(args.stopsByMemberId.get(memberId) ?? [], hosts, args.now);
      const stopPin = placement.kind === "none" ? null : { lat: placement.lat, lng: placement.lng };
      const icon = mobileIconFor(categories);
      cards.push({ ...m, key, tag: mobileTagFor(categories), mobileIcon: icon, stop: summary, stopPin });
      if (stopPin) {
        pins.push({
          key: `${key}::stop`,
          cardKey: key,
          slug: m.locations[0]?.slug ?? "",
          name: m.name,
          city: m.locations[0]?.city ?? "",
          address: summary.state === "at-address" ? summary.address : "",
          lat: stopPin.lat,
          lng: stopPin.lng,
          kind: "mobile",
          icon,
          website: m.website,
          stopLine: stopLineFor(summary),
        });
      }
      continue;
    }
    cards.push({ ...m, key, tag: m.memberType === "allied" ? "ALLIED" : null, mobileIcon: null, stop: null, stopPin: null });
    for (const l of m.locations) {
      if (l.lat === null || l.lng === null) continue;
      pins.push({
        key: `${key}::${l.slug}`,
        cardKey: key,
        slug: l.slug,
        name: m.name,
        city: l.city,
        address: l.address,
        lat: l.lat,
        lng: l.lng,
        kind: "location",
        icon: null,
        website: m.website,
        stopLine: null,
      });
    }
  }
  return { cards, pins };
}
```

- [ ] **Step 6: Extract `loadDirectory` in `directory.server.ts`**

Move the body of `getDirectoryMembers`'s handler into an exported plain function, so both routes share it. The handler becomes a one-line call:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared by /members (getDirectoryMembers) and /members-2 (getMembersV2Data). */
export async function loadDirectory(
  supabase: SupabaseClient,
): Promise<{ rows: DirectoryMemberRow[]; members: DirectoryMember[] }> {
  // ...the existing body, unchanged, except:
  //   `if (rows.length === 0) return [];`  ->  `if (rows.length === 0) return { rows, members: [] };`
  //   `return buildDirectoryMembers({...})` ->  `return { rows, members: buildDirectoryMembers({...}) };`
}

export const getDirectoryMembers = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryMember[]> => (await loadDirectory(await getSupabaseServerClient())).members,
);
```

- [ ] **Step 7: Write `members-v2.server.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadDirectory } from "@/lib/members/directory.server";
import { isMembersV2Host } from "@/lib/members/members-v2-gate";
import { buildV2, type V2Card, type V2Pin } from "@/lib/members/members-v2";
import { STOP_EVENT_COLUMNS, type StopEvent } from "@/lib/members/mobile-stops";
import type { MobileCategory } from "@/lib/members/mobile-category";

/**
 * Everything /members-2 shows, read with the ANON client (the public view;
 * RLS keeps it to published members and their unhidden events). Mobile
 * members' stops: from a day back (stops still on) to 15 days out.
 */
export const getMembersV2Data = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ enabled: false } | { enabled: true; cards: V2Card[]; pins: V2Pin[] }> => {
    if (!isMembersV2Host(getRequest().url)) return { enabled: false };
    const supabase = await getSupabaseServerClient();
    const { rows, members } = await loadDirectory(supabase);
    const mobileIds = rows.filter((r) => r.member_type === "mobile").map((r) => r.id);
    const now = new Date();

    const categoriesByMemberId = new Map<string, MobileCategory[]>();
    const stopsByMemberId = new Map<string, StopEvent[]>();
    if (mobileIds.length) {
      const from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      const to = new Date(now.getTime() + 15 * 24 * 3600 * 1000).toISOString();
      const [links, categories, events] = await Promise.all([
        supabase.from("member_categories").select("member_id, category_id").in("member_id", mobileIds),
        supabase.from("categories").select("id, name, slug, sort_order").eq("member_type", "mobile"),
        supabase
          .from("events")
          .select(STOP_EVENT_COLUMNS)
          .in("member_id", mobileIds)
          .eq("kind", "event")
          .or(`and(starts_at.gte.${from},starts_at.lt.${to}),and(overlay_starts_at.gte.${from},overlay_starts_at.lt.${to})`),
      ]);
      const byId = new Map(
        ((categories.data ?? []) as Array<MobileCategory & { id: string }>).map((c) => [c.id, c]),
      );
      for (const link of (links.data ?? []) as Array<{ member_id: string; category_id: string }>) {
        const category = byId.get(link.category_id);
        if (!category) continue;
        const list = categoriesByMemberId.get(link.member_id) ?? [];
        list.push({ name: category.name, slug: category.slug, sort_order: category.sort_order });
        categoriesByMemberId.set(link.member_id, list);
      }
      for (const e of (events.data ?? []) as unknown as StopEvent[]) {
        const list = stopsByMemberId.get(e.member_id) ?? [];
        list.push(e);
        stopsByMemberId.set(e.member_id, list);
      }
    }

    return { enabled: true, ...buildV2({ members, rows, categoriesByMemberId, stopsByMemberId, now }) };
  },
);
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/lib/members`
Expected: PASS, including the existing `directory.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/members
git commit -m "feat(members-v2): v2 cards and pins, the server data function, and the production gate"
```

---

### Task 8: The member card (B2 / B6)

**Files:**
- Create: `src/components/site/members-v2/MemberCardV2.tsx`
- Create: `src/components/site/members-v2/MemberCardV2.test.ts`

**Interfaces:**
- Consumes: `V2Card` (Task 7), `splitLocations`, `formatMiles`, `distanceMiles`, `LatLng` (Task 5), `directionsUrl` (directory.ts), `DirectorySearch`.
- Produces:
  - `MemberCardV2(props: { card: V2Card; linkSearch: DirectorySearch; origin: LatLng | null; highlighted: boolean; focusedSlug: string | null; onHoverCard: (key: string | null) => void; onHoverLocation: (slug: string | null) => void; compact?: boolean })`
  - `stopLineText(card: V2Card): string | null`, for example "Today at All Points Brewing Co. · 5–9 pm"

- [ ] **Step 1: Write the failing test**

`src/components/site/members-v2/MemberCardV2.test.ts`:
```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className }: { children: unknown; to: string; params?: { slug: string }; className?: string }) =>
    createElement("a", { href: to.replace("$slug", params?.slug ?? ""), className }, children as never),
}));

const { MemberCardV2, stopLineText } = await import("./MemberCardV2");
import type { V2Card } from "@/lib/members/members-v2";

function card(o: Partial<V2Card>): V2Card {
  return {
    key: "Hangar 24 Brewing Co.", name: "Hangar 24 Brewing Co.", memberType: "producer", website: "https://hangar24.example",
    logo: null, tag: null, mobileIcon: null, stop: null, stopPin: null,
    locations: [
      { slug: "h24-irvine", city: "Irvine", street: "17877 Von Karman Ave", address: "17877 Von Karman Ave, Irvine, CA", lat: 33.69, lng: -117.85 },
      { slug: "h24-redlands", city: "Redlands", street: "1710 Sessums Dr", address: "1710 Sessums Dr, Redlands, CA", lat: 34.06, lng: -117.2 },
      { slug: "h24-riverside", city: "Riverside", street: "5225 Canyon Crest Dr", address: "5225 Canyon Crest Dr, Riverside, CA", lat: 33.95, lng: -117.33 },
    ],
    ...o,
  };
}
const render = (c: V2Card) =>
  renderToStaticMarkup(createElement(MemberCardV2, { card: c, linkSearch: {}, origin: null, highlighted: false, focusedSlug: null, onHoverCard: () => {}, onHoverLocation: () => {} }));

describe("MemberCardV2", () => {
  it("several locations: 'N locations', two rows, '+ 1 more location', Website and Profile once", () => {
    const html = render(card({}));
    expect(html).toContain("3 locations");
    expect(html).toContain("Irvine");
    expect(html).toContain("Redlands");
    expect(html).toContain("+ 1 more location");
    expect(html.match(/Profile/g)).toHaveLength(1);
    expect(html).toContain('href="/members/h24-irvine"');
  });

  it("one location: address line with Directions, Website and Profile →", () => {
    const html = render(card({ locations: [card({}).locations[0]] }));
    expect(html).not.toContain("locations");
    expect(html).toContain("17877 Von Karman Ave, Irvine");
    expect(html).toContain("Directions");
    expect(html).toContain("Profile");
  });

  it.each([
    [{ state: "at-member", hostName: "All Points Brewing Co.", time: "5–9 pm" }, "Today at All Points Brewing Co. · 5–9 pm"],
    [{ state: "at-address", venue: "Riverside Food Truck Night", address: "3900 Main St", time: "4–10 pm" }, "Today at Riverside Food Truck Night · 4–10 pm"],
    [{ state: "in-city", place: "Corona", time: "6–9 pm" }, "Today in Corona · 6–9 pm"],
    [{ state: "next", day: "Fri", city: "Riverside" }, "No stop today. Next: Fri · Riverside"],
    [{ state: "none" }, "No stops scheduled"],
  ] as const)("mobile stop line %j", (stop, text) => {
    expect(stopLineText(card({ memberType: "mobile", tag: "FOOD TRUCK", mobileIcon: "truck", stop: { ...stop } as V2Card["stop"] }))).toBe(text);
  });

  it("a mobile card with no pin today shows Schedule instead of Directions", () => {
    const html = render(card({ memberType: "mobile", tag: "ENTERTAINMENT", mobileIcon: "mic", stop: { state: "in-city", place: "Corona", time: "6–9 pm" }, locations: [{ slug: "k", city: "Riverside", street: null, address: "Riverside, CA", lat: null, lng: null }] }));
    expect(html).toContain("ENTERTAINMENT");
    expect(html).toContain("Schedule");
    expect(html).not.toContain("Directions");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/site/members-v2/MemberCardV2.test.ts`
Expected: FAIL with "Cannot find module './MemberCardV2'".

- [ ] **Step 3: Write `MemberCardV2.tsx`**

Look: artboard B2 left column and B6. Card: `flex gap-4 border-b border-border px-5 py-[18px]`, highlighted = `bg-[#2A221B] border-l-[3px] border-l-primary`, otherwise a transparent left border. Logo 56px rounded-[10px] (the existing `<img>` or the `Beer` fallback as on `/members`). Name: `font-display text-base font-extrabold uppercase`. Tag pill: teal for mobile (`bg-[#DCEDEC] text-[#17605F]`), indigo for Allied (`bg-[#E6E3F3] text-[#3B4B9A]`). Actions row: `flex items-center justify-between text-[13px] font-semibold text-muted-foreground`; Profile in `text-primary font-bold`.
```tsx
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Beer, CalendarDays, Globe, MapPin, Mic, Navigation, Star, Tent, Truck } from "lucide-react";
import type { V2Card } from "@/lib/members/members-v2";
import type { MobileIcon } from "@/lib/members/mobile-category";
import { directionsUrl } from "@/lib/members/directory";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { distanceMiles, formatMiles, splitLocations, type LatLng } from "@/lib/members/directory-filters";
import { cn } from "@/lib/utils";

const STOP_ICON: Record<MobileIcon, typeof Truck> = { truck: Truck, tent: Tent, mic: Mic, star: Star };

export function stopLineText(card: V2Card): string | null {
  const s = card.stop;
  if (!s) return null;
  switch (s.state) {
    case "at-member": return `Today at ${s.hostName} · ${s.time}`;
    case "at-address": return `Today at ${s.venue} · ${s.time}`;
    case "in-city": return s.place ? `Today in ${s.place} · ${s.time}` : `Today · ${s.time}`;
    case "next": return `No stop today. Next: ${s.day}${s.city ? ` · ${s.city}` : ""}`;
    case "none": return "No stops scheduled";
  }
}

function miles(origin: LatLng | null, lat: number | null, lng: number | null): string | null {
  return origin && lat !== null && lng !== null ? formatMiles(distanceMiles(origin, { lat, lng })) : null;
}

const actionClass = "inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground";

export function MemberCardV2(props: {
  card: V2Card;
  linkSearch: DirectorySearch;
  origin: LatLng | null;
  highlighted: boolean;
  focusedSlug: string | null;
  onHoverCard: (key: string | null) => void;
  onHoverLocation: (slug: string | null) => void;
  compact?: boolean;
}) {
  const { card, linkSearch, origin, highlighted } = props;
  const [expanded, setExpanded] = useState(false);
  const first = card.locations[0];
  const multi = card.memberType !== "mobile" && card.locations.length > 1;
  const { shown, hidden } = splitLocations(card.locations);
  const rows = expanded ? card.locations : shown;
  const StopIcon = card.mobileIcon ? STOP_ICON[card.mobileIcon] : Truck;
  const stopText = stopLineText(card);
  const hasPinToday = card.stopPin !== null;

  const profile = (
    <Link to="/members/$slug" params={{ slug: first.slug }} search={linkSearch} className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-bold text-primary">
      Profile <span aria-hidden="true">→</span>
    </Link>
  );
  const website = card.website ? (
    <a href={card.website} target="_blank" rel="noreferrer" className={actionClass}>
      <Globe className="h-[15px] w-[15px]" /> Website
    </a>
  ) : null;

  return (
    <article
      data-card-key={card.key}
      onMouseEnter={() => props.onHoverCard(card.key)}
      onMouseLeave={() => props.onHoverCard(null)}
      className={cn(
        "flex gap-4 border-b border-border border-l-[3px] px-5 py-[18px] transition-colors",
        highlighted ? "border-l-primary bg-[#2A221B]" : "border-l-transparent",
        props.compact && "px-4 py-4",
      )}
    >
      <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-white", props.compact ? "h-12 w-12" : "h-14 w-14")}>
        {card.logo ? <img src={card.logo} alt="" className="h-full w-full object-contain" loading="lazy" /> : <Beer className="h-6 w-6 text-primary" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {card.tag && (
          <span className={cn("inline-flex h-5 w-fit items-center rounded-full px-2 text-[10px] font-bold tracking-[0.08em]", card.memberType === "allied" ? "bg-[#E6E3F3] text-[#3B4B9A]" : "bg-[#DCEDEC] text-[#17605F]")}>
            {card.tag}
          </span>
        )}
        <Link to="/members/$slug" params={{ slug: first.slug }} search={linkSearch} className="font-display text-base font-extrabold uppercase leading-tight text-foreground hover:underline">
          {card.name}
        </Link>

        {card.memberType === "mobile" ? (
          <p className="flex gap-2 text-[13px] leading-snug text-foreground">
            <StopIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{stopText}</span>
          </p>
        ) : multi ? (
          <>
            <p className="text-xs text-muted-foreground">{card.locations.length} locations</p>
            <ul className="-ml-2.5 mt-1 flex flex-col gap-0.5">
              {rows.map((l) => {
                const d = miles(origin, l.lat, l.lng);
                const focused = props.focusedSlug === l.slug;
                return (
                  <li
                    key={l.slug}
                    onMouseEnter={() => props.onHoverLocation(l.slug)}
                    onMouseLeave={() => props.onHoverLocation(null)}
                    className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]", focused && "bg-[#2A221B]")}
                  >
                    <MapPin className={cn("h-3.5 w-3.5 shrink-0", focused ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      <Link to="/members/$slug" params={{ slug: l.slug }} search={linkSearch} className="font-semibold text-foreground hover:underline">{l.city}</Link>
                      {l.street ? ` · ${l.street}` : ""}
                      {d && <span className="font-semibold text-primary"> · {d}</span>}
                    </span>
                    <a href={directionsUrl(l)} target="_blank" rel="noreferrer" aria-label={`Directions to ${card.name}, ${l.city}`} className="text-muted-foreground hover:text-foreground">
                      <Navigation className="h-[15px] w-[15px]" />
                    </a>
                  </li>
                );
              })}
              {hidden.length > 0 && !expanded && (
                <li>
                  <button type="button" onClick={() => setExpanded(true)} className="px-2.5 py-1.5 text-[13px] font-semibold text-primary">
                    + {hidden.length} more location{hidden.length === 1 ? "" : "s"}
                  </button>
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="flex gap-2 text-[13px] leading-snug text-muted-foreground" onMouseEnter={() => props.onHoverLocation(first.slug)} onMouseLeave={() => props.onHoverLocation(null)}>
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {[first.street, first.city].filter(Boolean).join(", ") || first.address}
              {miles(origin, first.lat, first.lng) && <span className="font-semibold text-primary"> · {miles(origin, first.lat, first.lng)}</span>}
            </span>
          </p>
        )}

        <div className="mt-1 flex items-center justify-between">
          {card.memberType === "mobile" && !hasPinToday ? (
            <Link to="/members/$slug" params={{ slug: first.slug }} search={linkSearch} className={actionClass}>
              <CalendarDays className="h-[15px] w-[15px]" /> Schedule
            </Link>
          ) : !multi ? (
            <a href={card.memberType === "mobile" && card.stopPin ? `https://www.google.com/maps/dir/?api=1&destination=${card.stopPin.lat},${card.stopPin.lng}` : directionsUrl(first)} target="_blank" rel="noreferrer" className={actionClass}>
              <Navigation className="h-[15px] w-[15px]" /> Directions
            </a>
          ) : null}
          {website}
          {profile}
        </div>
      </div>
    </article>
  );
}
```
If `lucide-react` lacks `Tent`, use `Tent` → `TentTree` (check `node_modules/lucide-react/dist/lucide-react.d.ts`), and say so in the commit message.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/site/members-v2/MemberCardV2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/members-v2/MemberCardV2.tsx src/components/site/members-v2/MemberCardV2.test.ts
git commit -m "feat(members-v2): the member card (one per member, location rows, mobile stop line, Profile →)"
```

---

### Task 9: The map (highlight, pan only when off-screen, mobile pins)

**Files:**
- Create: `src/components/site/members-v2/MembersV2Map.tsx`

**Interfaces:**
- Consumes: `V2Pin` (Task 7); `locationPinSvg`, `mobilePinSvg`, `PinLook` (Task 6); `panDecision` (Task 6); `directionsUrl`; `DirectorySearch`.
- Produces:
  - `MembersV2Map(props: { pins: V2Pin[]; highlightCard: string | null; focusedSlug: string | null; onPinHover: (cardKey: string | null) => void; onPinClick: (pin: V2Pin) => void; linkSearch: DirectorySearch; initialView?: { lat: number; lng: number; zoom: number }; onViewChange?: (v: { lat: number; lng: number; zoom: number }) => void; className?: string })`

This task is glue around Google Maps; its rules are unit tested in Task 6. Check it by hand in Task 11.

- [ ] **Step 1: Write `MembersV2Map.tsx`**

```tsx
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { V2Pin } from "@/lib/members/members-v2";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { locationPinSvg, mobilePinSvg, type PinLook } from "@/lib/maps/pin-icons";
import { panDecision } from "@/lib/maps/pan-decision";

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function lookOf(pin: V2Pin, highlightCard: string | null, focusedSlug: string | null): PinLook {
  if (focusedSlug && pin.slug === focusedSlug && pin.cardKey === highlightCard) return "focused";
  return pin.cardKey === highlightCard ? "member" : "normal";
}

function FitOnce({ pins }: { pins: V2Pin[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current || pins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 60);
    done.current = true;
  }, [map, pins]);
  return null;
}

/** Spec "Map behavior": the map only moves when a highlighted pin is off-screen. */
function PanToHighlighted({ targets }: { targets: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  const signature = targets.map((t) => `${t.lat},${t.lng}`).join("|");
  useEffect(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const decision = panDecision(targets, (p) => bounds.contains(p));
    if (decision.kind === "pan") map.panTo(decision.to);
    if (decision.kind === "fit") {
      const b = new google.maps.LatLngBounds();
      decision.points.forEach((p) => b.extend(p));
      map.fitBounds(b, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the targets change
  }, [map, signature]);
  return null;
}

export function MembersV2Map(props: {
  pins: V2Pin[];
  highlightCard: string | null;
  focusedSlug: string | null;
  onPinHover: (cardKey: string | null) => void;
  onPinClick: (pin: V2Pin) => void;
  linkSearch: DirectorySearch;
  initialView?: { lat: number; lng: number; zoom: number };
  onViewChange?: (v: { lat: number; lng: number; zoom: number }) => void;
  className?: string;
}) {
  const [active, setActive] = useState<V2Pin | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(debounce.current), []);

  const targets = useMemo(() => {
    if (!props.highlightCard) return [];
    const own = props.pins.filter((p) => p.cardKey === props.highlightCard);
    const focused = props.focusedSlug ? own.filter((p) => p.slug === props.focusedSlug) : [];
    return (focused.length ? focused : own).map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [props.pins, props.highlightCard, props.focusedSlug]);

  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <div className={props.className}>
        <Map
          defaultCenter={props.initialView ? { lat: props.initialView.lat, lng: props.initialView.lng } : { lat: 33.95, lng: -117.3 }}
          defaultZoom={props.initialView?.zoom ?? 9}
          gestureHandling="greedy"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          onCameraChanged={(e) => {
            if (!props.onViewChange) return;
            clearTimeout(debounce.current);
            debounce.current = setTimeout(
              () => props.onViewChange?.({ lat: e.detail.center.lat, lng: e.detail.center.lng, zoom: e.detail.zoom }),
              400,
            );
          }}
        >
          {!props.initialView && <FitOnce pins={props.pins} />}
          <PanToHighlighted targets={targets} />
          {props.pins.map((p) => {
            const look = lookOf(p, props.highlightCard, props.focusedSlug);
            const label = `${p.name} · ${p.city}`.toUpperCase();
            const icon = p.kind === "mobile" && p.icon ? mobilePinSvg(p.icon, look, label) : locationPinSvg(look, label);
            return (
              <Marker
                key={p.key}
                position={{ lat: p.lat, lng: p.lng }}
                title={`${p.name} — ${p.city}`}
                zIndex={look === "normal" ? 1 : look === "member" ? 50 : 100}
                icon={{
                  url: icon.url,
                  scaledSize: new google.maps.Size(icon.width, icon.height),
                  anchor: new google.maps.Point(icon.anchorX, icon.anchorY),
                }}
                onMouseOver={() => props.onPinHover(p.cardKey)}
                onMouseOut={() => props.onPinHover(null)}
                onClick={() => {
                  setActive(p);
                  props.onPinClick(p);
                }}
              />
            );
          })}
          {active && (
            <InfoWindow position={{ lat: active.lat, lng: active.lng }} pixelOffset={[0, -36]} onCloseClick={() => setActive(null)}>
              <div className="font-sans" style={{ minWidth: 220, maxWidth: 280 }}>
                <div className="text-[15px] font-bold text-gray-900">{active.name}</div>
                <div className="mt-1 text-xs text-gray-600">{active.stopLine ?? active.address}</div>
                <div className="mt-2 flex gap-4 text-[13px] font-semibold text-amber-700">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${active.lat},${active.lng}`} target="_blank" rel="noreferrer">Directions</a>
                  <Link to="/members/$slug" params={{ slug: active.slug }} search={props.linkSearch}>Profile →</Link>
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
```
If `google` isn't defined at render time (the API not loaded yet), the `Marker` `icon` will throw. In that case, wrap the marker list in a component that renders only once `useMap()` returns a map. Check this in the browser in Task 11.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` then `npm run build`
Expected: `2` (the known errors only); the build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/members-v2/MembersV2Map.tsx
git commit -m "feat(members-v2): the map with highlighted pins, pan-only-when-off-screen and mobile pins"
```

---

### Task 10: The page and route (desktop split, phone list/map, Filters panel, Near me)

**Files:**
- Create: `src/components/site/members-v2/useNearMe.ts`
- Create: `src/components/site/members-v2/FiltersSheet.tsx`
- Create: `src/components/site/members-v2/MembersV2Page.tsx`
- Create: `src/routes/members-2.tsx`
- Create: `src/components/site/members-v2/MembersV2Page.test.ts`

**Interfaces:**
- Consumes: everything above; `Sheet`, `SheetContent` from `@/components/ui/sheet`; `validateDirectorySearch`, `DirectorySearch`.
- Produces:
  - `useNearMe(): { status: "off" | "asking" | "on" | "blocked"; origin: LatLng | null; turnOn: () => void; turnOff: () => void }`
  - `visibleCards(cards: V2Card[], opts: { query: string; type?: MemberType; origin: LatLng | null }): V2Card[]` (exported from `MembersV2Page.tsx`)
  - the route `/members-2`

- [ ] **Step 1: Write the failing test for the list logic**

`src/components/site/members-v2/MembersV2Page.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@vis.gl/react-google-maps", () => ({}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null, useNavigate: () => () => {} }));
const { visibleCards } = await import("./MembersV2Page");
import type { V2Card } from "@/lib/members/members-v2";

const c = (name: string, memberType: V2Card["memberType"], lat: number | null, lng: number | null, stopPin: V2Card["stopPin"] = null): V2Card => ({
  key: name, name, memberType, website: null, logo: null, tag: null, mobileIcon: null, stop: null, stopPin,
  locations: [{ slug: name, city: "Riverside", street: null, address: "", lat, lng }],
});

describe("visibleCards", () => {
  const cards = [c("Bravo", "producer", 34.06, -117.65), c("Alpha", "producer", null, null), c("Truck", "mobile", null, null, { lat: 33.98, lng: -117.37 })];
  it("A–Z by default", () => {
    expect(visibleCards(cards, { query: "", origin: null }).map((x) => x.name)).toEqual(["Alpha", "Bravo", "Truck"]);
  });
  it("Near me: nearest first; a mobile member counts at today's stop; no pin last", () => {
    const origin = { lat: 33.9806, lng: -117.3755 };
    expect(visibleCards(cards, { query: "", origin }).map((x) => x.name)).toEqual(["Truck", "Bravo", "Alpha"]);
  });
  it("type filter and search apply together", () => {
    expect(visibleCards(cards, { query: "tru", type: "mobile", origin: null }).map((x) => x.name)).toEqual(["Truck"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/site/members-v2/MembersV2Page.test.ts`
Expected: FAIL with "Cannot find module './MembersV2Page'".

- [ ] **Step 3: Write `useNearMe.ts`**

```ts
import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/members/directory-filters";

/** The visitor's location for Near me. It stays in this browser tab: never sent to the server or stored. */
export function useNearMe() {
  const [status, setStatus] = useState<"off" | "asking" | "on" | "blocked">("off");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const turnOn = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("blocked");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("on");
      },
      () => {
        setOrigin(null);
        setStatus("blocked");
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }, []);
  const turnOff = useCallback(() => {
    setOrigin(null);
    setStatus("off");
  }, []);
  return { status, origin, turnOn, turnOff };
}
```

- [ ] **Step 4: Write `FiltersSheet.tsx` (B4)**

```tsx
import { useState } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const TYPES: Array<{ value: MemberType | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "producer", label: "Producers" },
  { value: "mobile", label: "Mobile" },
  { value: "allied", label: "Allied" },
];

/** Phone Filters panel: choices apply on "Show N members", not while tapping. */
export function FiltersSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: MemberType | undefined;
  nearest: boolean;
  countFor: (type: MemberType | undefined) => number;
  onApply: (next: { type: MemberType | undefined; nearest: boolean }) => void;
}) {
  const [type, setType] = useState(props.type);
  const [nearest, setNearest] = useState(props.nearest);
  const n = props.countFor(type);
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          setType(props.type);
          setNearest(props.nearest);
        }
        props.onOpenChange(open);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-[18px] border-t border-border bg-[#1E1915] px-5 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between">
          <SheetTitle className="font-display text-[22px] font-extrabold uppercase">Filters</SheetTitle>
          <button type="button" aria-label="Close" onClick={() => props.onOpenChange(false)} className="flex h-10 w-10 items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Member type</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => setType(t.value)}
              className={cn("h-10 rounded-full border px-4 text-sm font-semibold", type === t.value ? "border-primary bg-primary/15 text-primary" : "border-border")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Sort</p>
        <div role="radiogroup" className="mt-1">
          {[
            { v: false, label: "A–Z", sub: "By business name" },
            { v: true, label: "Nearest to me", sub: "Uses your location; your browser asks first" },
          ].map((o) => (
            <button key={o.label} type="button" role="radio" aria-checked={nearest === o.v} onClick={() => setNearest(o.v)} className="flex w-full items-start gap-3 py-2.5 text-left">
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", nearest === o.v ? "border-primary" : "border-border")}>
                {nearest === o.v && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{o.label}</span>
                <span className="block text-[13px] text-muted-foreground">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => { setType(undefined); setNearest(false); }} className="px-1.5 text-[15px] font-semibold underline underline-offset-4">
            Clear
          </button>
          <button
            type="button"
            onClick={() => { props.onApply({ type, nearest }); props.onOpenChange(false); }}
            className="h-[50px] flex-1 rounded-[10px] bg-primary text-base font-bold text-primary-foreground"
          >
            Show {n} member{n === 1 ? "" : "s"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
Check `src/components/ui/sheet.tsx` exports `SheetTitle` and supports `side="bottom"`. If `SheetContent` already draws its own close button, hide it with the component's `className` prop and don't draw a second one.

- [ ] **Step 5: Write `MembersV2Page.tsx`**

Look: B2 (desktop) and B3–B5 (phone). Desktop is `lg` and up (1024px+). The site header is sticky; the split's height is `lg:h-[calc(100dvh-4rem)]`. Check the header's real height in the browser in Task 11 and adjust it there.
```tsx
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Crosshair, List, Map as MapIcon, Search, SlidersHorizontal, X } from "lucide-react";
import type { V2Card, V2Pin } from "@/lib/members/members-v2";
import type { MemberType } from "@/lib/supabase/types";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { filterCards, orderByDistance, type LatLng } from "@/lib/members/directory-filters";
import { MemberCardV2 } from "./MemberCardV2";
import { MembersV2Map } from "./MembersV2Map";
import { FiltersSheet } from "./FiltersSheet";
import { useNearMe } from "./useNearMe";
import { cn } from "@/lib/utils";

function pointsOf(card: V2Card): LatLng[] {
  if (card.memberType === "mobile") return card.stopPin ? [card.stopPin] : [];
  return card.locations.flatMap((l) => (l.lat !== null && l.lng !== null ? [{ lat: l.lat, lng: l.lng }] : []));
}

export function visibleCards(cards: V2Card[], opts: { query: string; type?: MemberType; origin: LatLng | null }): V2Card[] {
  const filtered = filterCards(cards, { query: opts.query, type: opts.type });
  return opts.origin
    ? orderByDistance(filtered, opts.origin, pointsOf, (c) => c.name)
    : [...filtered].sort((a, b) => a.name.localeCompare(b.name));
}

export function MembersV2Page(props: { cards: V2Card[]; pins: V2Pin[]; search: DirectorySearch }) {
  const navigate = useNavigate({ from: "/members-2" });
  const [query, setQuery] = useState("");
  const [hoverCard, setHoverCard] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const near = useNearMe();
  const listRef = useRef<HTMLDivElement>(null);
  const type = props.search.filter;

  const cards = useMemo(() => visibleCards(props.cards, { query, type, origin: near.origin }), [props.cards, query, type, near.origin]);
  const shownKeys = useMemo(() => new Set(cards.map((c) => c.key)), [cards]);
  const pins = useMemo(() => props.pins.filter((p) => shownKeys.has(p.cardKey)), [props.pins, shownKeys]);
  const memberCount = cards.length;
  const locationCount = cards.reduce((n, c) => n + (c.memberType === "mobile" ? 0 : c.locations.length), 0);

  const setType = (next: MemberType | undefined) =>
    navigate({ search: (prev) => ({ ...prev, filter: next }), replace: true, resetScroll: false });

  // Hovering or clicking a pin scrolls the list to its card.
  const revealCard = (key: string | null) => {
    setHoverCard(key);
    if (!key) return;
    listRef.current?.querySelector(`[data-card-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const initialView =
    props.search.mapLat !== undefined && props.search.mapLng !== undefined && props.search.mapZoom !== undefined
      ? { lat: props.search.mapLat, lng: props.search.mapLng, zoom: props.search.mapZoom }
      : undefined;
  const onViewChange = (v: { lat: number; lng: number; zoom: number }) =>
    navigate({ search: (prev) => ({ ...prev, mapLat: v.lat, mapLng: v.lng, mapZoom: v.zoom }), replace: true, resetScroll: false });

  const nearButton = (
    <button
      type="button"
      onClick={() => (near.status === "on" ? near.turnOff() : near.turnOn())}
      aria-pressed={near.status === "on"}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold lg:h-[46px] lg:rounded-[10px] lg:px-3.5 lg:text-sm",
        near.status === "on" ? "border-primary bg-primary/15 text-primary" : "border-border",
      )}
    >
      <Crosshair className="h-4 w-4" /> {near.status === "asking" ? "Finding you…" : "Near me"}
    </button>
  );
  const searchBox = (
    <label className="flex h-11 flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-[#211C17] px-3 lg:h-[46px]">
      <Search className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">Search members</span>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members…" className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground lg:text-sm" />
      {query && (
        <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </label>
  );
  const blockedNote =
    near.status === "blocked" ? (
      <p className="flex gap-3 bg-[#2A221B] px-5 py-4 text-sm leading-relaxed">
        <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        We couldn’t get your location, so the list stays A–Z. To use Near me, allow location for this site in your browser’s settings.
      </p>
    ) : null;
  const empty =
    cards.length === 0 ? (
      <div className="flex flex-col items-center gap-2.5 px-6 py-9 text-center">
        <Search className="h-7 w-7 text-muted-foreground" />
        <p className="font-semibold">No members match “{query.trim() || "your filters"}”.</p>
        <p className="text-sm text-muted-foreground">Check the spelling, or</p>
        <button type="button" onClick={() => { setQuery(""); setType(undefined); near.turnOff(); }} className="text-sm font-semibold text-primary underline underline-offset-4">
          clear the search and filters
        </button>
      </div>
    ) : null;
  const list = cards.map((card) => (
    <MemberCardV2
      key={card.key}
      card={card}
      linkSearch={props.search}
      origin={near.origin}
      highlighted={hoverCard === card.key}
      focusedSlug={focusedSlug}
      onHoverCard={setHoverCard}
      onHoverLocation={setFocusedSlug}
    />
  ));
  const map = (className: string) => (
    <MembersV2Map
      pins={pins}
      highlightCard={hoverCard}
      focusedSlug={focusedSlug}
      onPinHover={revealCard}
      onPinClick={(p) => revealCard(p.cardKey)}
      linkSearch={props.search}
      initialView={initialView}
      onViewChange={onViewChange}
      className={className}
    />
  );

  return (
    <>
      {/* Heading: the new top of the page (no photo banner). */}
      <section className="border-b border-border px-4 pb-4 pt-6 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-12 lg:pb-6 lg:pt-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary lg:text-xs">Find a member</p>
          <h1 className="mt-1.5 text-[26px] lg:text-[38px]">Members on the map.</h1>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground lg:max-w-[470px] lg:text-right lg:text-[15px]">
          <span className="lg:hidden">Search by name, or see who is near you.</span>
          <span className="hidden lg:inline">The independent producers, mobile members and Allied Members behind the Guild. Point at a member to find them on the map; click for their profile.</span>
        </p>
      </section>

      {/* Desktop: list beside the map (B2). */}
      <div className="hidden lg:flex lg:h-[calc(100dvh-4rem)]">
        <div className="flex w-[440px] shrink-0 flex-col border-r border-border">
          <div className="flex flex-col gap-2.5 border-b border-border px-5 pb-3 pt-[18px]">
            <div className="flex gap-2.5">{searchBox}{nearButton}</div>
            <div className="flex gap-2.5">
              <select aria-label="Member type" value={type ?? ""} onChange={(e) => setType((e.target.value || undefined) as MemberType | undefined)} className="h-[46px] flex-1 rounded-[10px] border border-border bg-[#211C17] px-3.5 text-sm">
                <option value="">All member types</option>
                <option value="producer">Producers</option>
                <option value="mobile">Mobile members</option>
                <option value="allied">Allied Members</option>
              </select>
              <select aria-label="Order" value={near.status === "on" ? "near" : "az"} onChange={(e) => (e.target.value === "near" ? near.turnOn() : near.turnOff())} className="h-[46px] w-[150px] rounded-[10px] border border-border bg-[#211C17] px-3.5 text-sm">
                <option value="az">A–Z</option>
                <option value="near">Nearest</option>
              </select>
            </div>
            <p className="pt-0.5 text-xs text-muted-foreground">
              {memberCount} member{memberCount === 1 ? "" : "s"} · {locationCount} location{locationCount === 1 ? "" : "s"}
            </p>
          </div>
          {blockedNote}
          <div ref={listRef} className="flex-1 overflow-y-auto">{empty}{list}</div>
        </div>
        {map("min-w-0 flex-1 [&>div]:h-full")}
      </div>

      {/* Phone and tablet (B3-B5). */}
      <div className="lg:hidden">
        <div className="sticky top-14 z-20 flex flex-col gap-2.5 border-b border-border bg-background px-4 pb-3 pt-2.5">
          {searchBox}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-[13px] font-semibold">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {(type || near.status === "on") && (
                <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                  {(type ? 1 : 0) + (near.status === "on" ? 1 : 0)}
                </span>
              )}
            </button>
            {nearButton}
            <div className="ml-auto flex rounded-full border border-border p-[3px]">
              {(["list", "map"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={phoneView === v} onClick={() => setPhoneView(v)} className={cn("inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold", phoneView === v ? "bg-foreground text-background" : "text-muted-foreground")}>
                  {v === "list" ? <List className="h-[15px] w-[15px]" /> : <MapIcon className="h-[15px] w-[15px]" />}
                  {v === "list" ? "List" : "Map"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {blockedNote}
        {phoneView === "list" ? (
          <div ref={listRef}>
            <p className="px-4 pt-2.5 text-xs text-muted-foreground">
              {near.status === "on" ? "Nearest first · " : ""}{memberCount} member{memberCount === 1 ? "" : "s"}
            </p>
            {empty}{list}
          </div>
        ) : (
          <PhoneMapView cards={cards} pins={pins} map={map} onFocusCard={(key) => { setHoverCard(key); setFocusedSlug(null); }} linkSearch={props.search} origin={near.origin} />
        )}
        <FiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          type={type}
          nearest={near.status === "on"}
          countFor={(t) => visibleCards(props.cards, { query, type: t, origin: null }).length}
          onApply={(next) => {
            setType(next.type);
            if (next.nearest && near.status !== "on") near.turnOn();
            if (!next.nearest && near.status === "on") near.turnOff();
          }}
        />
      </div>
    </>
  );
}

/** B5: the map fills the screen; cards swipe along the bottom and move the map to their pin. */
function PhoneMapView(props: {
  cards: V2Card[];
  pins: V2Pin[];
  map: (className: string) => ReactElement;
  onFocusCard: (key: string) => void;
  linkSearch: DirectorySearch;
  origin: LatLng | null;
}) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const key = best?.target.getAttribute("data-rail-key");
        if (key) props.onFocusCard(key);
      },
      { root: el, threshold: [0.6] },
    );
    el.querySelectorAll("[data-rail-key]").forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe when the cards change
  }, [props.cards]);
  return (
    <div className="relative h-[calc(100dvh-3.5rem-118px)]">
      {props.map("absolute inset-0 [&>div]:h-full")}
      <div ref={rail} className="absolute inset-x-0 bottom-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {props.cards.map((card) => (
          <div key={card.key} data-rail-key={card.key} className="w-[85%] shrink-0 snap-center overflow-hidden rounded-[14px] border border-border bg-[#1E1915] shadow-xl">
            <MemberCardV2 card={card} linkSearch={props.linkSearch} origin={props.origin} highlighted={false} focusedSlug={null} onHoverCard={() => {}} onHoverLocation={() => {}} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
```
Tapping a pin on the phone map calls `revealCard`. Make that also scroll the rail: find `[data-rail-key=…]` and `scrollIntoView({ inline: "center" })`. A rail card coming into view must move the map: `onFocusCard` sets `hoverCard`, and `MembersV2Map`'s `PanToHighlighted` then pans only if the pin is off-screen. **Ruling to record:** the spec says swiping "moves the map to that member's first pinned location". With pan-only-when-off-screen it moves only when needed. If, by hand in Task 11, the map doesn't feel like it follows the swipe, pass an `alwaysPan` flag from `PhoneMapView` that makes `PanToHighlighted` always `panTo`.

- [ ] **Step 6: Write the route `src/routes/members-2.tsx`**

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { getMembersV2Data } from "@/lib/members/members-v2.server";
import { MembersV2Page } from "@/components/site/members-v2/MembersV2Page";

/**
 * Members page v2 -- a staging trial (docs/superpowers/specs/2026-10-05-members-page-v2-design.md).
 * Not in the menu, noindex, and a 404 on the live site's hostnames
 * (members-v2-gate.ts). /members is unchanged.
 */
export const Route = createFileRoute("/members-2")({
  validateSearch: validateDirectorySearch,
  loader: async () => {
    const data = await getMembersV2Data();
    if (!data.enabled) throw notFound();
    return data;
  },
  head: () => ({
    meta: [
      { title: "Member Directory (v2) — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MembersV2Route,
});

function MembersV2Route() {
  const { cards, pins } = Route.useLoaderData();
  const search = Route.useSearch();
  return <MembersV2Page cards={cards} pins={pins} search={search} />;
}
```

- [ ] **Step 7: Run the tests, type-check and build**

Run: `npm run test`, `npx tsc --noEmit 2>&1 | grep -c "error TS"`, `npm run build`
Expected: all tests pass; `2`; the build succeeds and `src/routeTree.gen.ts` now includes `/members-2`.

- [ ] **Step 8: Commit**

```bash
git add src/components/site/members-v2 src/routes/members-2.tsx src/routeTree.gen.ts
git commit -m "feat(members-v2): /members-2 page: desktop split, phone list/map, Filters panel, Near me"
```

---

### Task 11: Check it on staging, docs, and the server-function check

**Files:**
- Modify: `docs/member-profiles.md` (a short "Members page v2 (trial)" note, after the `/members` description)
- Modify: `docs/design/README.md` (B1–B6 rows: "built at `/members-2`, staging only")

- [ ] **Step 1: The server-function check**

Run, after `npm run build`, the same check used before: every `createSsrRpc` id in the client build appears in `dist/server`.
Expected: `missing 0`.

- [ ] **Step 2: Push to staging and check by hand**

```bash
git push origin staging
```
Wait for the staging build, then at `https://ie-brewers-guild-staging.boblelle77.workers.dev/members-2`:

1. **Desktop:**
   - no banner, and the split fills the window under the header (adjust `4rem` in `MembersV2Page` if the header is taller);
   - hovering Hangar 24 turns its 4 pins orange;
   - hovering its Redlands row grows that pin with the label;
   - the map moves only when the pin is off-screen;
   - hovering a pin highlights its card and scrolls the list to it.
2. **Search and filter:**
   - "redlands" finds Hangar 24;
   - "Mobile members" with no mobile members published shows the "No members match" state.
3. **Near me:** allowed in the browser, it orders by distance and shows "· N.N mi"; blocked, it shows the note.
4. **Phone, at a 390px window:**
   - the bar sticks while scrolling;
   - Filters opens the panel and "Show N members" applies it;
   - the List/Map switch works;
   - swiping cards moves the map.
5. **A mobile member's stop** (with the owner's OK, because these are shared-database writes):
   - temporarily publish Sample Taco Truck, or have the owner do it;
   - add a manual stop today with venue "Sample Brewing Co." → the truck pin sits beside Sample Brewing Co.'s pin with the truck icon;
   - add a stop at a street address → within 15 minutes the pin appears there;
   - put Sample Taco Truck back to draft afterwards.

   If the owner says no to publishing a sample member, report that this was checked by unit tests only.
6. **The live site:** `https://iscbrewersguild.org/members-2` is not reachable yet (main doesn't have it). Note in the report that the gate is unit tested.

- [ ] **Step 3: Docs**

In `docs/member-profiles.md`, after the public `/members` description, add:
```markdown
**Members page v2 (trial, 5 October 2026).** `/members-2`, staging only. It's `noindex`, not in the menu, and a 404 on the live site's hostnames. The layout follows artboards B2–B6: a list beside the map, one card per member with its locations inside, search, member type, Near me, and pins that highlight on hover (the map moves only when a pin is off-screen). It also shows mobile members' pins for today's stop, with an icon from their first category: truck, tent, microphone, or a star for anything else. Stops get map positions from the 15-minute cron (`events.latitude/longitude/geocoded_address`). The design is `docs/superpowers/specs/2026-10-05-members-page-v2-design.md`. `/members` is unchanged; whether v2 replaces it is the owner's call.
```
In `docs/design/README.md`, change the B1–B6 rows' route column from "`/members-2` on staging (not built yet)" to "`routes/members-2.tsx` → `site/members-v2/*` (staging only)".

- [ ] **Step 4: Commit and push**

```bash
git add docs/member-profiles.md docs/design/README.md
git commit -m "docs: Members page v2 trial built at /members-2"
git push origin staging
```

---

## Self-review notes

- **Spec coverage:**

  | Spec section | Task |
  |---|---|
  | Goal and gate | 7, 10 |
  | Desktop B2 | 8, 10 |
  | Phone B3–B5 | 10 |
  | Search, filter, order | 5, 10 |
  | Near me privacy | 10 (`useNearMe` keeps it in the browser) |
  | Nothing matches / blocked | 10 |
  | Pins follow the list | 10 |
  | Map behavior | 6, 9 |
  | First load | 9 |
  | Today's stop rules | 2 |
  | Placement rules 1–4 | 3 |
  | Mobile pin and card text, icons from categories | 2, 3, 6, 8 |
  | Data: columns and grants | 1 |
  | Cron (48 h, 20, never throws, service role) | 3, 4 |
  | Loader (public columns, 14 days) | 7 (window: a day back to 15 days out) |
  | Testing list | 1–8, 11 |
  | Copy | 8, 10 |

- **Deliberate gaps:** none known.
- **Where the code is glue:** the map, page and route are the parts unit tests don't cover (Google Maps and browser APIs). Task 11's hand check covers them.
