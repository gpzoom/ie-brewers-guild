# Scan Pass One-Scan Check-in and Location Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A returning Scan Pass customer checks in with one scan of a staff QR and one tap, and each check-in records near/far/no location for the owner's activity list.

**Architecture:** Scanning `/s/<token>` notes the scan on the phone's own session row and redirects to `/card`, which opens a check-in modal while that scan is under 5 minutes old. The tap claims the scan once, rechecks the staff code and ends in the existing `recordVisit`. The server turns the phone's position into one word on the activity row; flags are computed when the activity page is read.

**Tech Stack:** TanStack Start, React, Supabase (service role), Vitest, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-11-24-staff-qr-one-scan-design.md`

## Global Constraints

- Work on `staging` only (or a branch off it). Never merge or push to `main`: Scan Pass is not live.
- Staging and live share one database. The migration only adds. **No database push without the owner's go-ahead, and it goes before any code that uses it is pushed.**
- No emails sent while building or testing. Never print or write secret values.
- Scan to tap window: **5 minutes**. Location wait: **4 seconds**. Far: distance minus stated accuracy more than **400 meters**. "No location": **3** or more check-ins in the range, none `near`.
- Location never blocks or fails a check-in. Coordinates are never stored, logged or returned.
- The staff token is never in the address of the page that checks in, never in an email, and never in data sent to `/card`.
- US spelling. Customer wording says "staff member", never "bartender".
- Server-only modules stay out of client bundles; `npm run build` must pass before any push.
- Keep each file's line endings. Commit with `git commit -F <file>`, using the session's attribution line.

## Review Focus

- **Page reloaded or reopened after a successful check-in:** nothing is recorded and no modal appears (Task 3 claim test, Task 5 walkthrough).
- **Double tap, or two tabs tapping together:** one visit; the second says "Scan the staff QR code again." (Task 3).
- **Staff code turned off between scan and tap:** refused and logged as a turned-off scan (Task 3).
- **Location prompt ignored, or a phone with "Precise" location off:** the check-in finishes after 4 seconds; a very rough position counts as `none`, not `near` (Tasks 2 and 5).
- **A second phone or tab signed in to the same pass:** only the phone that scanned can confirm (Task 3).

---

### Task 1: Migration (written and tested, not pushed)

**Files:**
- Create: `supabase/migrations/20261128100000_tap_card_one_scan.sql`
- Modify: `supabase/tests/tap_card.test.sql`

**Interfaces:**
- Produces: `tap_card_sessions.pending_staff_code text`, `tap_card_staff_activity.location text`.

- [ ] **Step 1:** Add assertions to the test file (update its plan count): both columns exist; `location` accepts null, `near`, `far`, `none` and refuses `home`; `anon` and `authenticated` can't select either table.
- [ ] **Step 2:** Write the migration:

```sql
-- Scan Pass one-scan check-in and location flags (spec 2026-11-24). Adds only.
alter table public.tap_card_sessions
  add column pending_staff_code text;
alter table public.tap_card_staff_activity
  add column location text check (location in ('near', 'far', 'none'));
```

- [ ] **Step 3:** Run `npm run test:db`. Read `scripts/test-db.mjs` first; if it needs the migration in the shared database, stop here and leave the run until the owner's go-ahead. Expected: pass.
- [ ] **Step 4:** Commit `feat(db): scan note and location word for one-scan check-in`.

### Task 2: Pure rules: scan decision, location, flags

**Files:**
- Modify: `src/lib/tap-card/staff-qr.ts`, `staff-qr.test.ts`, `staff-activity.ts`, `staff-activity.test.ts`, `staff-activity-view.ts`, `staff-activity-view.test.ts`, `staff-activity-text.ts`, `staff-activity-text.test.ts`
- Create: `src/lib/tap-card/location.ts`, `location.test.ts`

**Interfaces:**
- Produces, in `staff-qr.ts`:
  - `SCAN_MINUTES = 5` (replaces `PENDING_MINUTES`)
  - `type PendingScan = { sessionId: string; memberId: string; staffCode: string; at: string }` (replaces `Pending`)
  - `scanIsFresh(at: string, now: Date): boolean`
  - `type StaffQrView = { kind: "unknown" | "closed" | "turned-off" | "sign-in" | "note-scan" }`
  - `decideStaffQrView(i: { qrMemberId: string | null; takesCheckIns: boolean; plateOpen: boolean; qrActive: boolean; signedIn: boolean }): StaffQrView`
- Produces, in `location.ts`:
  - `type Position = { lat: number; lng: number; accuracy: number }`, `type LocationWord = "near" | "far" | "none"`
  - `parsePosition(raw: unknown): Position | null`
  - `locationWord(position: Position | null, place: { memberType: string; lat: number | null; lng: number | null }): LocationWord | null`
- Produces, in `staff-activity.ts`: `ActivityRow.location: LocationWord | null`; `FlagKind` gains `"far"` and `"no-location"`; `FLAG_LIMITS.noLocationVisits = 3`. `ActivityItem.location` in `staff-activity-view.ts`. `locationLabel(word: LocationWord | null): string | null` in `staff-activity-text.ts`.

- [ ] **Step 1: Failing tests, `staff-qr.test.ts`.** Remove the plate, wrong-brewery and 10-minute cases. Assert: null member → `unknown`; not taking check-ins → `closed`; inactive code → `turned-off` (signed in or out, plate open or not); active code, plate off → `closed`; signed out → `sign-in`; otherwise `note-scan`. `scanIsFresh`: 4m59s true, exactly 5m true, 5m01s false, a future time false, an invalid date false.
- [ ] **Step 2: Failing tests, `location.test.ts`.** Place: 34.0, -117.0, producer.
  - 300 m away, accuracy 20 → `near`
  - 420 m away, accuracy 10 → `far`; 420 m, accuracy 50 → `near`
  - 5 km away, accuracy 100 → `far`
  - accuracy over 1000 and not far → `none`
  - null position → `none`
  - `mobile` member, or null lat or lng → `null`, whatever the position
  - `parsePosition` returns null for: missing fields, strings, NaN, Infinity, lat over 90, lng over 180, negative accuracy
- [ ] **Step 3: Failing tests, activity.** A `far` check-in gets `far`; a `far` reward-used row doesn't. Three `none` check-ins by one customer get `no-location`; two don't; three plus one `near` don't; `far`, `none`, `none` flags only the two `none` rows; null rows count toward nothing. A check-in on a weekday marked closed, and on a special date marked closed, gets `outside-hours`. `buildPage` returns `location`. Text: `far` → "far from the taproom", `no-location` → "no location"; both in `FLAG_ORDER` after `outside-hours`; `locationLabel`: `near` → "Near", `far` → "Far away", `none` → "No location", null → null.
- [ ] **Step 4:** Run `npx vitest run src/lib/tap-card`. Expected: the new tests fail.
- [ ] **Step 5:** Implement. Use `distanceMiles` from `src/lib/members/directory-filters.ts` (× 1609.344). Location stays in pure modules the client may import.
- [ ] **Step 6:** Run again. Expected: pass, apart from type errors in callers fixed in Task 3.
- [ ] **Step 7:** Commit `feat(scan-pass): one-scan and location rules`.

### Task 3: Server: note the scan, confirm it once, log location

**Files:**
- Modify: `src/lib/tap-card/tap-card-cookies.server.ts`, `plate.server.ts`, `staff-source.server.ts`, `staff-source.test.ts`, `staff-activity.server.ts`
- Create: `src/lib/tap-card/scan-core.ts`, `scan-core.test.ts`

**Interfaces:**
- Consumes: Task 2's types.
- Produces in `tap-card-cookies.server.ts`, replacing the three plate-pending functions:
  - `notePendingScan(p: { memberId: string; staffCode: string }): Promise<boolean>`; sets `pending_at`, and nulls `pending_choice` and `pending_plate_code`
  - `readPendingScan(): Promise<PendingScan | null>`; **this session's row only** (by cookie hash, unexpired)
  - `claimPendingScan(p: { sessionId: string; at: string }): Promise<boolean>`
  - `dropPendingScan(): Promise<void>`
- Produces in `scan-core.ts`: `confirmScanCore(store, now)`, where `store` is `{ pending(): Promise<PendingScan | null>; codeState(staffCode: string): Promise<{ memberId: string; view: StaffQrView } | null>; claim(p: PendingScan): Promise<boolean> }`, returning `{ kind: "ok"; scan: PendingScan } | { kind: "turned-off"; scan: PendingScan } | { kind: "closed" } | { kind: "scan-again" }`.
- Produces server functions in `plate.server.ts`:
  - `openStaffQr({ token }): StaffQrPage`, with `StaffQrPage = { view: "unknown" } | { view: "closed" | "turned-off"; memberName } | { view: "sign-in"; memberName; plateCode; canJoinTrail; trailStop } | { view: "noted" }`
  - `getPendingCheckIn(): PendingCheckIn | null`, with `PendingCheckIn = { memberName; memberSlug; plateCode; firstName; nextVisitNumber; checkedInToday; state: BarState }`
  - `confirmPendingCheckIn({ choice: PlateChoice; position: unknown }): PlateResult | { kind: "scan-again" }`
  - `cancelPendingCheckIn(): { ok: true }`
  - `confirmAtPlate` gains `position: unknown`
- Removed: `choosePlateAction`, `getStaffQrView`, `confirmByStaffQr`.

- [ ] **Step 1: Failing tests, `scan-core.test.ts`:** no pending → `scan-again`; stale → `scan-again` and never claimed; code unknown → `scan-again`; code's member differs from the scan's → `scan-again`; turned off → `turned-off`, not claimed; closed → `closed`; claim returns false → `scan-again`; two calls on one scan → one `ok`, one `scan-again`.
- [ ] **Step 2: Failing tests, `staff-source.test.ts`:** `logVisitActivity` takes a final `location: LocationWord | null`; it's on `check-in` and `reward-used` rows, null on `reward-undone` and `turned-off-code`.
- [ ] **Step 3:** Run `npx vitest run src/lib/tap-card`. Expected: fail.
- [ ] **Step 4:** Implement. `loadPlateBy` also selects `code`, `members.latitude`, `members.longitude`. `recordVisit` takes the parsed position and works out the word with `locationWord`; undo passes null. A turned-off tap calls `logTurnedOff`. If working out the word throws, log the error without the position and use null. `getPendingCheckIn` returns null unless the scan is fresh and its code still reads `note-scan`. `staff-activity.server.ts` selects and maps `location`.
- [ ] **Step 5:** Run again. Expected: pass.
- [ ] **Step 6:** Commit `feat(scan-pass): staff QR notes a scan, one tap confirms it`.

### Task 4: Staff QR page and counter plate page

**Files:**
- Modify: `src/routes/s.$token.tsx`, `src/components/tap-card/StaffQrScreen.tsx`, `PlateScreen.tsx`, `PlateSuccess.tsx`
- Create: `src/components/tap-card/HolderSignIn.tsx` (the email and code form now inside `SignedOut`), `RewardChoices.tsx` (the radio list, `rewardLine`, `keyOf`, `choiceOf`), `RewardChoices.test.ts`

**Interfaces:**
- Produces: `<HolderSignIn next={string} onSignedIn={() => void} />`; `<RewardChoices waiting choice onChange />`; `PlateSuccess` keeps its props.

- [ ] **Step 1: Failing test, `RewardChoices.test.ts`:** `choiceOf(keyOf(r))` round-trips for trail, earn and member rewards; "none" → `{ kind: "none" }`.
- [ ] **Step 2:** The `/s/$token` loader calls `openStaffQr`; on `noted`, `throw redirect({ to: "/card", replace: true })`. Add `preload: false`. No client code confirms from this page any more.
- [ ] **Step 3:** `StaffQrScreen` keeps `unknown`, `closed` and `turned-off`, and adds `sign-in`: heading "Sign in to check in", `HolderSignIn` with `next="/card"` (the token must never reach an email) reloading on success, then "New here?" with the free-pass and, when `canJoinTrail`, Beer Trail links for `plateCode`.
- [ ] **Step 4:** `PlateScreen` signed in: heading "Hi {firstName}" ; lead "To check in, scan the staff QR code. Ask a staff member for it."; `CardScanner label="Scan the staff QR code"`; waiting rewards listed as text under "Waiting for you here"; the Beer Trail link as today; "Enter the staff code instead" showing `RewardChoices` and `StaffCodeForm`. The step state and Continue go.
- [ ] **Step 5:** `plateRefusal`: replace `scan-plate-first` with `scan-again` → "Scan the staff QR code again."; signed-out → "You've been signed out. Scan the staff QR code again to sign in."; closed → "This taproom isn't taking check-ins right now. Ask a staff member for help."
- [ ] **Step 6:** Run `npx vitest run` and `npx tsc --noEmit`. Expected: pass, with no new type errors.
- [ ] **Step 7:** Commit `feat(scan-pass): staff QR and counter plate pages for one scan`.

### Task 5: Check-in modal, in-page scanner, position

**Files:**
- Create: `src/components/tap-card/CheckInModal.tsx`, `src/lib/tap-card/get-position.ts`, `get-position.test.ts`
- Modify: `src/routes/card.tsx`, `src/components/tap-card/CardScanner.tsx`, `PlateScreen.tsx`, `src/lib/tap-card/card-app.ts`, `card-app.test.ts`

**Interfaces:**
- Produces: `getPosition(geo: Pick<Geolocation, "getCurrentPosition"> | undefined, waitMs = 4000): Promise<Position | null>`; `<CheckInModal pending={PendingCheckIn} onClose />`; `staffQrTokenFrom(path: string): string | null` in `card-app.ts`.

- [ ] **Step 1: Failing tests.** `getPosition`: no geolocation → null; success → the three numbers; error → null; a callback that never fires → null at 4000 ms (fake timers); a late success after that is ignored; a synchronous throw → null. `staffQrTokenFrom("/s/ABCD1234")` → `"ABCD1234"`; `/t/ABCD1234` → null.
- [ ] **Step 2:** Run. Expected: fail.
- [ ] **Step 3:** Implement `getPosition` with `{ enableHighAccuracy: true, maximumAge: 60000, timeout: 4000 }` and its own timer, since the prompt's wait isn't covered by `timeout`.
- [ ] **Step 4:** `CheckInModal`, on `components/ui/dialog.tsx`: member name; "Hi {firstName} — this will be visit #N" or "Checked in today — visit #N"; `RewardChoices` unless `state.used`; button "Check in", or "Show my confirmation" when already checked in with nothing chosen, or "Use my reward" when one is chosen. A reward asks "Use your reward now?" / "This can't be undone without a staff member." with "Yes, use it" and "No, just check in". Under the button: "We'll ask for your location to help the taproom spot misuse. You can say no." While saving, buttons are disabled. `ok` replaces the whole page content with `PlateSuccess` (full screen, not inside the dialog). `scan-again`, `turned-off`, `closed` and `signed-out` show `plateRefusal` text. Close calls `cancelPendingCheckIn`.
- [ ] **Step 5:** `/card` loader also loads `getPendingCheckIn`; with one, it renders the modal. A tab restored from memory (`pageshow` with `persisted`) reloads the data.
- [ ] **Step 6:** `CardScanner`: a staff QR calls `openStaffQr` in place; `noted` on `/card` refreshes the route data so the modal opens, and elsewhere goes to `/card`; any other answer, or a failed call, opens `/s/<token>` as now. Scanner copy: "Point your camera at the staff QR code." and "That isn't a Scan Pass code. Point at the staff QR code."
- [ ] **Step 7:** The 4-digit form in `PlateScreen` sends `await getPosition(navigator.geolocation)`.
- [ ] **Step 8:** Run `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Expected: pass.
- [ ] **Step 9:** Commit `feat(scan-pass): check-in modal with location`.

### Task 6: Staff activity screen

**Files:**
- Modify: `src/components/portal/StaffActivityCard.tsx`

- [ ] **Step 1:** Show `locationLabel(item.location)` on each row, after the method, when not null. The new flags come through `FLAG_ORDER`. Add to the note: "Location comes from the customer's phone, and they can say no."
- [ ] **Step 2:** Run `npx vitest run` and `npm run build`. Expected: pass.
- [ ] **Step 3:** Commit `feat(scan-pass): location in staff activity`.

### Task 7: Wording: print kit, portal, site, emails

**Files:**
- Modify: `src/lib/tap-card/print-kit/copy.ts` and its tests, `src/components/portal/TapCardSection.tsx`, `src/routes/trail.tsx`, `src/routes/p.$code.tsx`, `src/lib/email/build-email-content.ts` and its tests

- [ ] **Step 1:** Update the tests, then the copy:
  - `PLATE_COPY.headline`: "GET YOUR SCAN PASS"; `line`: "Free on your phone · earn rewards here."
  - `STAFF_COPY.howTo`: "Hold this up for the customer to scan, then look for the live green screen."
  - `TapCardSection`: "Customers get a Scan Pass from your counter plate, then scan a staff QR code on each visit to check in and collect rewards."
  - `trail.tsx` step: "Scan the staff QR code and tap Check in. Your visit counts, and you get that stop's offer once a year."
  - `p.$code.tsx` second line: "Scan the staff QR code at every new taproom on the trail."
  - Pass-ready email: "At every taproom on the trail, scan the staff QR code with your phone to record your visit and get that stop's first-beer offer."
- [ ] **Step 2:** Render the print kit and check that the new headline fits on the counter card and the table tent (`print-kit/render.test.ts`, plus look at each PDF).
- [ ] **Step 3:** Search `src` for "scan the counter plate", "then the staff QR" and "Continue" in Scan Pass files. Expected: nothing left that describes two scans.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`. Commit `copy(scan-pass): one scan`.

### Task 8: Privacy Policy wording (owner approves before it's committed)

**Files:**
- Modify: `src/components/site/PrivacyPolicy.tsx`, `src/components/site/LegalPage.test.ts`

- [ ] **Step 1:** Show the owner this wording and wait for their approval:
  - Replace "the counter plate that recorded it" with "how it was recorded".
  - Replace "A taproom's counter plate records your visits there." with "When you check in, we ask your phone for its location. You can say no and still check in. We use it once to tell whether you were near the taproom and don't keep it. We keep only the result: near, far or no location. The taproom's owner, co-owners and Guild admins can see that result under the made-up label."
- [ ] **Step 2:** Read the Terms' Scan Pass section for anything that describes two scans; include any change in the same approval.
- [ ] **Step 3:** Update `LegalPage.test.ts` and the page. The effective date does not change here; it moves at the Scan Pass launch. Run `npx vitest run`. Commit `legal(scan-pass): location at check-in`.

### Task 9: Database push, staging and walkthrough

- [ ] **Step 1:** Ask the owner for the database go-ahead. Push the migration, confirm both columns exist, and run `npm run test:db`.
- [ ] **Step 2:** `npm run build`, push `staging`, and confirm the deploy by behavior.
- [ ] **Step 3:** Owner's phone walkthrough at Sample Brewery on staging, on iPhone and Android: regular-camera scan; in-pass scan; free-pass first visit; signed-out scan; reward used and undone; reload and reopen after a check-in (nothing recorded); tap after 5 minutes (refused); turned-off code; location allowed, declined and ignored; 4-digit backup; activity row shows the right location word. Sample Brewery must have saved coordinates.
- [ ] **Step 4:** Fix anything found before Task 10.

### Task 10: Member Guide and checklist

**Files:**
- Modify: `docs/member-guide/member-profile-guide.html` (sections A, B and D), its Scan Pass screenshots and PDFs, `docs/beer-trail-launch-checklist.md`

- [ ] **Step 1:** Section B becomes: customer gets a pass once at the counter plate; after that, scan the staff QR, pick a reward or **Check in**, show the green screen; the 4-digit backup starts from the counter plate. Section D: add the near / far / no location label and both flags with their limits.
- [ ] **Step 2:** Rebuild with `npm run build:guides`; re-take changed screenshots with sample data only; check every page of each PDF.
- [ ] **Step 3:** Commit, build, push `staging`.
