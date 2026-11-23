# Named Staff Codes with Activity Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each staff member their own QR and 4-digit code, record which one confirmed each check-in, reward and undo, and show owners the activity with flags.

**Architecture:** Three new server-only tables hold staff, codes and activity; `tap_card_plates` keeps the counter QR and shared code so live keeps working. Pure modules decide code matching, flags and labels; thin `*.server.ts` files do the database work behind a new owner-level gate. The check-in flow resolves a source, records the visit as today, then logs activity without being able to fail the visit.

**Tech Stack:** TanStack Start (`createServerFn`), React, Supabase, pdf-lib print kit, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-staff-qr-tracking-design.md`

## Global Constraints

- Migration only adds. Never change or drop `tap_card_plates.staff_qr` / `staff_code`. Live runs the old code on the same database.
- `npx supabase db push` (dry run first) only with the owner's go-ahead, and before code that reads the new tables is pushed.
- Roles: owner, co-owner, Guild admin, via the existing RPC `is_member_owner_level(target_member_id)`. Full editors must get no staff secret or activity from any server function.
- QR codes: `^[0-9A-HJKMNP-TV-Z]{8}$` (`generateCardCode()`). 4-digit codes: `^[0-9]{4}$`. 4-digit codes are never printed.
- Names: 1-40 characters, unique per member ignoring case and extra spaces.
- No customer id, name, email or phone reaches the browser from activity.
- Any new `*.server.ts` file of createServerFn that client code imports goes in the `vite.config.ts` allowlist next to the other `src/lib/tap-card/` entries.
- US spelling. `npm run build` passes before any push; push to `staging` only, never `main`. No test emails.
- Commits: `git commit -F <file>`, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage files by name. Keep each file's line endings.

## Review Focus

1. **Activity beyond 1,000 rows** (Supabase returns at most 1,000 per request): totals must still be complete. *(Task 6, `readAll`.)*
2. **The activity insert fails** (or tables missing): the customer's check-in, reward and undo still succeed. *(Task 5, `logActivity swallows errors`.)*
3. **Two windows make a code for the same person at once:** one active code of each kind, and no raw database error shown. *(Task 1 unique index; Task 4 test.)*
4. **Open past midnight and daylight-saving days:** a 12:30 am check-in at a taproom open until 1 am isn't flagged. *(Task 3.)*
5. **A removed name typed again with different capitals or spaces:** the same person returns with their history. *(Tasks 2 and 4.)*

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261126100000_tap_card_staff_codes.sql` | Tables, column |
| `src/lib/tap-card/staff-codes.ts` (+ test) | Names, 4-digit generation, matching, plate-on rule |
| `src/lib/tap-card/staff-activity.ts` (+ test) | Flag limits, flags, totals, customer labels |
| `src/lib/tap-card/staff-source.server.ts` | Resolve a token or code to a source; log activity (plain helpers) |
| `src/lib/tap-card/staff-codes-core.ts` (+ test) | Make, replace, turn off, rename, remove, against a store interface |
| `src/lib/tap-card/staff-codes.server.ts` | createServerFns for the Staff QR codes box |
| `src/lib/tap-card/staff-activity.server.ts` | createServerFns for the Staff activity box |
| `src/components/portal/StaffCodesCard.tsx`, `StaffActivityCard.tsx` | The two boxes |
| Modified | `plate.ts`, `plate.server.ts`, `staff-qr.ts`, `tap-card-editor.server.ts`, `trail-pass-admin.server.ts`, `CounterPlateCard.tsx`, `PrintKitCard.tsx`, `TapCardSection.tsx`, `StaffQrScreen.tsx`, print-kit `copy.ts`/`types.ts`/`render.ts`, guide, `PrivacyPolicy.tsx`, `vite.config.ts` |

---

### Task 1: Database migration

**Files:** Create `supabase/migrations/20261126100000_tap_card_staff_codes.sql`

**Produces** (all RLS on, no policies, `revoke all ... from anon, authenticated`, as in `20261121100000_tap_card_loyalty.sql`; member and holder foreign keys `on delete cascade`):

- [ ] **Step 1: Write the migration**
  - `tap_card_plates.staff_code_off boolean not null default false`
  - `tap_card_staff`: `id uuid pk`, `member_id`, `name text check (char_length(name) between 1 and 40)`, `name_key text not null`, `created_at`, `removed_at timestamptz`; unique `(member_id, name_key)`; unique `(id, member_id)`
  - `tap_card_staff_codes`: `id uuid pk`, `member_id`, `staff_id uuid null` with composite FK `(staff_id, member_id)` to `tap_card_staff (id, member_id)` on delete cascade, `kind text check (kind in ('qr','pin'))`, `code text`, `created_at`, `turned_off_at timestamptz`; check that `qr` matches the 8-character pattern and `pin` matches 4 digits; check that a null `staff_id` is `kind = 'qr'` and turned off; unique index on `code where kind = 'qr'`; unique index on `(member_id, code) where kind = 'pin'` (never reissued); unique index on `(staff_id, kind) where turned_off_at is null`
  - `tap_card_staff_activity`: `id uuid pk`, `member_id`, `holder_id`, `visit_id uuid null references tap_card_visits on delete set null`, `at timestamptz not null default now()`, `day date not null` (Pacific), `event text check (event in ('check-in','reward-used','reward-undone','turned-off-code'))`, `source text check (source in ('staff','counter','staff-code'))`, `staff_id uuid null`, `code_id uuid null` (both FK, on delete set null), `method text check (method in ('qr','pin'))`, `code_text text null` (QR text only, never a 4-digit code), `reward text null`; index `(member_id, at desc)`; index on `visit_id`; unique index `(holder_id, code_text, day) where event = 'turned-off-code'`
- [ ] **Step 2:** `npx supabase db push --dry-run`. Expected: only this migration listed. Do not push.
- [ ] **Step 3: Commit** `feat(staff-qr): tables for staff codes and activity`
- [ ] **Step 4: STOP.** Ask the owner for the go-ahead to push the database. Then push, and confirm a trivial service-role read of each table works. Other tasks may continue meanwhile.

### Task 2: Code rules (pure)

**Files:** Create `src/lib/tap-card/staff-codes.ts`, `staff-codes.test.ts`; modify `plate.ts`, `plate.test.ts`

**Produces:**
```ts
export function cleanStaffName(raw: string): { ok: true; name: string; key: string } | { ok: false; message: string };
export function generatePin(taken: ReadonlySet<string>, random?: () => number): string | null; // null when none are left
export type PersonalPin = { codeId: string; staffId: string; code: string; active: boolean };
export type PinMatch = { source: "staff"; staffId: string; codeId: string } | { source: "staff-code" } | null;
export function matchPin(entered: string, i: { shared: string | null; sharedOff: boolean; personal: PersonalPin[] }): PinMatch;
export function plateIsOn(i: { shared: string | null; personalActive: number }): boolean;
export function sharedPinSaveError(code: string, issued: ReadonlySet<string>): string | null;
// plate.ts
export async function staffCodeGate<M>(store: AttemptStore, match: () => M | null): Promise<{ kind: "ok"; match: M } | { kind: "wrong-code"; triesLeft: number } | { kind: "locked" }>;
```

- [ ] **Step 1: Write failing tests**
  - `cleanStaffName("  Maria   L ")` → name `"Maria L"`, key `"maria l"`; `""` and 41 characters refused with `"Type a name of 1 to 40 characters."`
  - `generatePin` never returns a taken code; with all 10,000 taken, `null`
  - `matchPin`: active personal → staff; inactive → null; shared on → `staff-code`; shared off → null; personal equal to a shared code that is on → `staff-code`; personal equal to an off shared code → staff
  - `plateIsOn`: shared set → true even if off; null and 1 personal → true; null and 0 → false
  - `sharedPinSaveError`: issued code → `"That code belongs to a staff member. Choose another."`; else null
  - existing `staffCodeGate` tests rewritten for the `match` callback, keeping the lockout and all-at-once cases; `match` is not called when locked
- [ ] **Step 2:** `npx vitest run src/lib/tap-card/staff-codes.test.ts src/lib/tap-card/plate.test.ts` → FAIL
- [ ] **Step 3: Implement.** Update the one caller in `plate.server.ts` to pass `() => (staffCodeMatches(...) ? true : null)`, so this commit still builds.
- [ ] **Step 4:** Same command → PASS; typecheck clean
- [ ] **Step 5: Commit** `feat(staff-qr): staff name and code rules`

### Task 3: Flags, totals and labels (pure)

**Files:** Create `src/lib/tap-card/staff-activity.ts`, `staff-activity.test.ts`

**Consumes:** `computeOpenNow`, `WeekdayHours`, `SpecialHoursDay` from `@/lib/hours/open-now`

**Produces:**
```ts
export const FLAG_LIMITS = { graceMinutes: 60, burstCustomers: 4, burstMinutes: 5, sameVisits: 5, sameShare: 0.8, wrongTries: 5 } as const;
export type ActivityRow = { id: string; holderId: string; visitId: string | null; at: string; event: "check-in" | "reward-used" | "reward-undone" | "turned-off-code"; source: "staff" | "counter" | "staff-code"; staffId: string | null; method: "qr" | "pin"; reward: string | null };
export type FlagKind = "outside-hours" | "burst" | "same-customer" | "turned-off-code";
export type MemberHours = { timezone: string; hours: WeekdayHours[]; specialHours: SpecialHoursDay[] };
export function rowKey(r: ActivityRow): string; // "staff:<id>" | "counter" | "staff-code"
export function flagRows(rows: ActivityRow[], hours: MemberHours): Map<string, FlagKind[]>; // by activity id
export type SourceTotal = { key: string; checkIns: number; rewards: number; undone: number; flags: Partial<Record<FlagKind, number>> };
export function totals(rows: ActivityRow[], flags: Map<string, FlagKind[]>): SourceTotal[];
export function wrongTryGroups(misses: { holderId: string; at: string }[], timezone: string): { holderId: string; day: string; tries: number }[];
export async function customerLabels(memberId: string, holderIds: string[]): Promise<Map<string, string>>;
```

- [ ] **Step 1: Write failing tests**
  - Hours, timezone `America/Los_Angeles`, open 12:00-21:00: 11:01 and 21:59 not flagged; 10:59 and 22:01 flagged; undo and turned-off events never get `outside-hours`
  - Fri 12:00 to 01:00 next day: Sat 00:30 and 01:59 not flagged, 02:01 flagged; closed Saturday: 14:00 flagged
  - Special closed date flagged; special open date overrides the weekly row; no hours → never flagged; the Nov 1 2026 clock change doesn't crash or mis-flag a noon visit
  - Burst: 4 different customers within 5 minutes on one person flags all 4 (QR and 4-digit combined); 3 don't; the same customer 4 times doesn't; counter and shared never
  - Same customer: 5 check-ins at the member, 4 on Maria → those 4 flagged; 3 of 5 not; 4 of 4 not; old and new codes of one person count together
  - `totals`: gross rewards, undos separate; turned-off events add a flag and no check-in
  - `wrongTryGroups`: 5 in one local day listed, 4 not
  - `customerLabels`: `"Customer "` + at least 3 uppercase hex of SHA-256(`memberId:holderId`); same within a member, different for another member; colliding ones lengthened until unique
- [ ] **Step 2:** `npx vitest run src/lib/tap-card/staff-activity.test.ts` → FAIL
- [ ] **Step 3: Implement.** Within hours = `computeOpenNow` is not `"closed"` at the event time, or at any minute within ±60 (check every 15 minutes plus the exact ends at ±60). Never throw on an empty list. Label collisions are judged over the ids passed, so callers pass all of the member's ids.
- [ ] **Step 4:** Same command → PASS
- [ ] **Step 5: Commit** `feat(staff-qr): activity flags and totals`

### Task 4: Managing staff and codes (server)

**Files:** Create `staff-codes-core.ts`, `staff-codes-core.test.ts`, `staff-codes.server.ts` (all in `src/lib/tap-card/`); modify `tap-card-editor.server.ts`, `plate.server.ts`, `vite.config.ts`

**Consumes:** Task 2
**Produces:**
```ts
// tap-card-editor.server.ts
export async function requireTapCardOwner(memberId: string): Promise<{ userId: string; service: SupabaseClient; trailStop: boolean }>;
// refuses with "Only the owner or a co-owner can manage staff codes."
// staff-codes.server.ts (every handler calls requireTapCardOwner first)
export type StaffCodesView = {
  counter: { url: string; printed: string };
  shared: { code: string | null; off: boolean };
  staff: { id: string; name: string; qr: { url: string; printed: string } | null; pin: string | null }[]; // not removed, by name
  canTurnSharedOff: boolean;
};
export const getStaffCodes, makeStaffCodes, replaceStaffCode, turnOffStaff, renameStaff, removeStaff, resetCounterQr, saveSharedCode, setSharedCodeOff;
```
Inputs: `{memberId}`; `{memberId, name}`; `{memberId, staffId, kind: "qr"|"pin"}`; `{memberId, staffId}`; `{memberId, staffId, name}`; `{memberId, staffId}`; `{memberId}`; `{memberId, code}`; `{memberId, off}`. All return `StaffCodesView`.

`CounterPlate` in `plate.server.ts` becomes `{ url; printedCode; plateOn: boolean }`; `getCounterPlate` and `resetPlateLink` stay on `requireTapCardEditor`. Delete `resetStaffQr` and `saveStaffCode` there.

- [ ] **Step 1: Write failing tests** with an in-memory store
  - new name makes one active QR and one active 4-digit code; existing name replaces both and turns the old ones off; `" MARIA "` finds `Maria`; a removed name comes back with the same id
  - replacing `qr` leaves the `pin` alone, and the reverse
  - turn off stops both; remove stops both and hides the name
  - rename to another person's name refused: `"That name is already in use."`
  - staff id of another member refused: `"Staff member not found."`
  - QR generation retries on a clash with named codes or `tap_card_plates.staff_qr`
  - two makes at once: the loser's unique violation is retried, ending with one active code per kind
  - counter reset stores the old token as a turned-off counter code before replacing it
  - shared off refused with no active personal code: `"Give at least one staff member their own code first."`
  - `requireTapCardOwner` (mock the RPC): false → throws the message above; true → passes
- [ ] **Step 2:** `npx vitest run src/lib/tap-card/staff-codes-core.test.ts` → FAIL
- [ ] **Step 3: Implement.** Export `ensurePlate` from a plain helper, not from a createServerFn file, so both server files can share it. `saveSharedCode` uses `sharedPinSaveError` with every code ever issued by the member.
- [ ] **Step 4:** Tests → PASS. `grep -n "staffQr\|staffCode" src/lib/tap-card/plate.server.ts` shows no staff secret returned from an editor-gated function. Adjust `CounterPlateCard`/`PrintKitCard` only enough to compile (finished in Task 7).
- [ ] **Step 5: Commit** `feat(staff-qr): owners manage staff codes`

### Task 5: Check-in flow records its source

**Files:** Create `src/lib/tap-card/staff-source.server.ts`, `staff-source.test.ts`; modify `plate.server.ts`, `staff-qr.ts` (+ test), `StaffQrScreen.tsx`

**Consumes:** Tasks 1, 2
**Produces:**
```ts
export type Source = { source: "staff"; staffId: string; codeId: string; method: "qr" | "pin"; codeText: string | null } | { source: "counter"; method: "qr"; codeText: string } | { source: "staff-code"; method: "pin" };
export async function sourceByQr(service: SupabaseClient, token: string): Promise<{ memberId: string; active: boolean; source: Source } | null>; // named codes, then tap_card_plates.staff_qr
export async function logActivity(service: SupabaseClient, rows: ActivityInsert[]): Promise<void>; // never throws; console.error
```

- [ ] **Step 1: Write failing tests**
  - `sourceByQr`: active named; turned-off named; turned-off counter; current counter; unknown → null
  - `logActivity` swallows both a returned error and a thrown one; a 23505 is not logged as an error
  - `activityFor(before, result, source)` (pure, same file): first confirm → `check-in`; with reward → `check-in` + `reward-used` with its text; second confirm same day, no reward → none; second with reward → `reward-used` only; outcome `already-used-today` or `not-available` → no reward row; undo `undone` → `reward-undone` with the text that was used; `nothing-to-undo` → none
- [ ] **Step 2:** `npx vitest run src/lib/tap-card/staff-source.test.ts` → FAIL
- [ ] **Step 3: Implement**
  - `loadPlate.open` uses `plateIsOn`; `plateContext` loads personal codes and uses `matchPin` through `staffCodeGate`, returning the `Source`
  - `recordVisit` takes `source`; takes the visit id from `findVisit`; reads the used reward's text from `state.used`; undo reads the text before undoing
  - Turned-off QR: new `StaffQrPage` view `{ view: "turned-off"; memberName }`, text exactly `"This staff code no longer works. Ask the staff for the current one."`; `getStaffQrView` logs `turned-off-code` for a signed-in holder. `confirmByStaffQr` re-resolves the token and returns `{ kind: "turned-off" }` without recording a visit if it was turned off in between; `StaffQrScreen` shows the same text.
  - Closed members: unchanged, nothing logged
- [ ] **Step 4:** `npx vitest run src/lib/tap-card` → PASS
- [ ] **Step 5: Commit** `feat(staff-qr): record which code confirmed each visit`

### Task 6: Reading activity (server)

**Files:** Create `src/lib/tap-card/staff-activity.server.ts`, `read-all.ts`, `read-all.test.ts`; modify `vite.config.ts`

**Consumes:** Task 3, `requireTapCardOwner`
**Produces:**
```ts
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]>; // 1,000 at a time
export type ActivityRange = 7 | 30 | 90 | "all";
export type ActivitySummary = { rows: (SourceTotal & { name: string; removed: boolean })[]; beforeTracking: number; wrongTries: { customer: string; day: string; tries: number }[] };
export const getStaffActivity; // { memberId, range } → ActivitySummary
export type ActivityItem = { id: string; at: string; customer: string; event: ActivityRow["event"]; method: "qr" | "pin"; reward: string | null; flags: FlagKind[] };
export const getStaffActivityList; // { memberId, range, key, offset } → { items: ActivityItem[]; more: boolean }, 50 each, newest first
```

- [ ] **Step 1: Write failing tests** for `readAll`: 0, 999, 1,000, 1,001 and 2,500 rows all returned complete; an error throws
- [ ] **Step 2:** `npx vitest run src/lib/tap-card/read-all.test.ts` → FAIL
- [ ] **Step 3: Implement.** Every query ordered by a unique column pair (`at, id`). `beforeTracking` = visits in range with no activity row for that `visit_id`. Hours come from the live `hours` and `special_hours` rows plus `members.timezone`. Labels over all the member's holders in activity and misses. A bad `range` becomes 30; `key` must match `rowKey` format. Flags for the list use the whole range, not the page. Rows with a deleted staff person show as "Removed staff".
- [ ] **Step 4:** Tests → PASS; no `holderId` field in either return type
- [ ] **Step 5: Commit** `feat(staff-qr): activity summary and list`

### Task 7: Staff QR codes box and print kit

**Files:** Create `src/components/portal/StaffCodesCard.tsx`; modify `CounterPlateCard.tsx`, `PrintKitCard.tsx`, `TapCardSection.tsx`, `print-kit/copy.ts`, `types.ts`, `render.ts`, `render.test.ts`, `print-kit/copy.test.ts`, `setup-qr.ts`

**Consumes:** Task 4
**Produces:** `PrintKitInput` drops the staff fields; `buildStaffCardsPdf(input: StaffCardInput, ...)` with `StaffCardInput = PrintKitInput & { staffQrUrl: string; staffQrPrinted: string; staffName: string | null }`

- [ ] **Step 1: Write failing render tests:** a named card includes `staffName`; a counter card doesn't; a 40-character name stays inside the card; no 4-digit code in the text; QR still at least 1.6 in
- [ ] **Step 2:** `npx vitest run src/lib/tap-card/print-kit` → FAIL
- [ ] **Step 3: Implement render**, staff name above the member name. Run → PASS
- [ ] **Step 4: Build the box** per the spec sketch
  - QR images made in the browser with `captionedQrDataUrl`; a named caption reads `Staff QR: <name>`
  - Confirm text: `<name>'s current QR and 4-digit code will stop working right away.` (make on an active name); `<name>'s current QR will stop working right away.` / `4-digit code` (single replacement)
  - Turning off or removing the last active person while the shared code is off warns: `After this, nobody can type a code or undo a reward. Staff QR codes will still work.` and the box keeps showing that line while true
  - Shared code off: note `The live site keeps accepting the shared code until this feature goes live.` (removed at merge, Task 9)
  - After a QR replacement show `REPRINT_NOTICE.staff`. Drop-down lists people not removed, plus `Add a name…`
  - Editors: a server refusal hides the box entirely (the card returns null on the permission message, any other error shows)
- [ ] **Step 5: Print kit:** "Staff cards" fetches `getStaffCodes` on click; a chooser lists `Behind the counter` and each person with an active QR; hidden for editors. Add the new refusal message to `ACTIONABLE_ERRORS`.
- [ ] **Step 6: CounterPlateCard:** plate only. When `plateOn` is false: `Set up a staff code to turn your plate on.` It reloads when StaffCodesCard changes codes (a version prop from `TapCardSection`). Order: Beer Trail, Print kit, Counter plate, Staff QR codes, Staff activity, passes, offers.
- [ ] **Step 7:** typecheck, `npx vitest run src/lib/tap-card`, `npm run build` → all pass
- [ ] **Step 8: Commit** `feat(staff-qr): Staff QR codes box and named staff cards`

### Task 8: Staff activity box

**Files:** Create `src/components/portal/StaffActivityCard.tsx`; modify `TapCardSection.tsx`

**Consumes:** Task 6

- [ ] **Step 1: Build** per the spec sketch
  - Range 7 / 30 (default) / 90 days / All time; rows expand to the list with `Show more`
  - Flag labels: `outside open hours`, `close together`, `same customer`, `turned-off QR used`; wrong tries in their own `Wrong code tries` row
  - Note: `A flag means it's worth a look. It isn't proof of anything. Busy nights and private events can cause one.` then `Open hours use your hours as posted now, so changing them can change older flags.`
  - Hidden for editors. Flags use text as well as the symbol. Table reflows at phone width without side scroll.
  - Switching range or member ignores late responses (the `current` pattern in `TrailOptInCard.tsx`)
- [ ] **Step 2:** typecheck and `npm run build` → pass
- [ ] **Step 3: Commit** `feat(staff-qr): Staff activity box`

### Task 9: Demo reset, guide, policy, staging check

**Files:** Modify `trail-pass-admin.server.ts`, `docs/member-guide/member-profile-guide.html` + rebuilt PDFs, `src/components/site/PrivacyPolicy.tsx`

- [ ] **Step 1:** `resetDemoVisits` also deletes `tap_card_staff_activity` for the Sample ids; staff and codes stay
- [ ] **Step 2:** Update guide sections A and B: named codes, personal and shared 4-digit codes, undo, turn off, activity and flags, who can manage what. Then `npm run build:guides`; `npx vitest run src/lib/member-guide.test.ts` → PASS
- [ ] **Step 3: STOP for wording approval.** Draft Privacy Policy changes: members see visits without name or email, under a made-up label; the staff code that confirmed each visit is recorded; staff names members type are kept. Apply only the wording the owner approves, with the page's effective date handled as the last policy release was.
- [ ] **Step 4:** Full `npx vitest run`, typecheck, `npm run build` → pass. Commit. Push to staging only after Task 1's database push and with the owner's OK.
- [ ] **Step 5: Try on staging with Sample Brewery:** make two people; check in by each QR, each 4-digit code and the counter QR; use and undo a reward; turn one off and scan it; turn the shared code off; print both kinds of card; sign in as a full editor and confirm no codes or activity show; open the same screens on `/admin/scan-pass`. Report results, including anything not tried.
- [ ] **Step 6: At merge (owner's "go" only):** remove the "until this feature goes live" note.
