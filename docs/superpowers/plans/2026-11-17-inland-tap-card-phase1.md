# Inland Tap Card — Phase 1 (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plastic NFC/QR Tap Cards that brewery staff tap or scan to record taproom visits and once-a-year "first beer for a nickel" redemptions, with holder sign-up, a holder progress page, Guild-approved brewer offers, milestone rewards, and a public Trail page.

**Architecture:** Every card holds `https://iscbrewersguild.org/p/<code>`. The `/p/$code` route decides what to show from two HttpOnly cookies: a **scanner device** cookie (brewery staff → check-in screen) or a **holder session** cookie (customer → their card page). Staff need no camera library: the phone's own NFC reader or camera app opens the link in the default browser, where the scanner cookie lives. All Tap Card tables are service-role only (RLS on, no client policies); every server function checks the cookie or the Guild/member session itself. Business rules live in pure `*-core.ts` files with store interfaces (the `submitJoinCore` pattern) so they're unit-tested without a database.

**Tech Stack:** TanStack Start (`createServerFn`) on Cloudflare Workers; Supabase Postgres (pgTAP in `supabase/tests`, run with `npm run test:db`); Vitest; Resend via `sendTransactionalEmail`; `@date-fns/tz` for Pacific time.

**Spec:** `docs/superpowers/specs/2026-11-17-inland-tap-card-design.md`

## Global Constraints

- Program name exactly **"Inland Tap Card"**; standard offer text exactly **"Your first beer for a nickel"**.
- All user-facing text in US English.
- Visits count **once per card holder per brewery per Pacific calendar day**; a redemption is allowed **once per card holder per brewery per calendar year**, both computed in `America/Los_Angeles`.
- Trail stops = members with `status = 'published'` **and** `trail_eligible = true`. Nothing else can record visits or appear on the Trail.
- A brewer's own offer shows only after a Guild admin approves it; until then (and if declined) the standard offer shows.
- Name + email required to activate a card; activation also requires "I am 21 or older" (customer) or "I checked their ID" (staff).
- No leaderboard, no drawing, no points for beers. Milestones count **distinct stops visited in the current calendar year**.
- Brewers see **counts only**, never holder names or emails. Holder names/emails are visible to Guild admins and to the holder.
- **Holder sign-in is separate from member sign-in:** single-use emailed link → `tap_card_sessions` cookie. Holders are **not** Supabase auth users (the member auth helpers assume a few hundred accounts).
- Card codes: 8 characters from Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), printed as `XXXX-XXXX`; input accepts lowercase, spaces, dashes, and `I/L→1`, `O→0`.
- Public server functions rate-limited through `CREATOR_UPLOAD_RATE_LIMITER` (fails closed) with keys `tapcard-activate:<ip>`, `tapcard-signin:<ip>`, `tapcard-card:<ip>`.
- Staging shares the live database. Test only with an `is_test` card batch assigned to **Sample Brewery**, holder emails on the owner's own `+tapcard` alias; delete the test batch afterwards. Never publish Sample Brewery outside Maintenance Mode.
- `db push` only with the owner's explicit go-ahead, before any code reading the new tables is pushed.
- `npm run build` before every staging push; check `git log` vs `origin/staging` before pushing.
- New member-editing screens land on **both** `/portal` and `/admin` ("Edit as them").
- `/privacy` and `/terms` updated (and `LEGAL.effectiveDate` bumped) in the same release; Member Guide (HTML + PDFs) updated before merging to main.

## Review Focus

1. Staff double-tap "Redeem" or two devices scan the same card at once → exactly one visit row for the day and one redemption for the year; the second call answers "Already recorded". Test in Task 2 (core) and Task 1 (unique indexes).
2. Visit at 11:30 pm Dec 31 Pacific vs 12:30 am Jan 1 → the first counts for the old year (redemption used), the second is a new day and a new year (redemption available again), even though both are Jan 1 in UTC. Test in Task 2.
3. A brewery is unpublished or loses `trail_eligible` while its tablet is still signed in → the tablet shows "This device can't record visits right now" and nothing is written. Test in Task 6.
4. A customer whose card was lost activates a new card with the same email in different case (`Pat@X.com` vs `pat@x.com`) → the card joins the holder's existing account; visits, redemptions and rewards carry over; no second holder. Test in Task 5.
5. Someone types random codes into `/p/` → unknown codes show "We don't recognize this card" with no hint about which codes exist, and the per-IP limit stops bulk guessing. Test in Task 4.

---

### Task 1: Database tables and settings

**Files:**
- Create: `supabase/migrations/20261120100000_inland_tap_card.sql`
- Create: `supabase/tests/tap_card.test.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces (all `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()` unless noted; RLS enabled, **no** client policies, revoke all from `anon, authenticated`):
  - `tap_card_batches(label text not null, member_id uuid null → members on delete set null, card_count int not null, is_test boolean not null default false, created_by uuid → auth.users)`
  - `tap_cards(code text unique not null check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'), batch_id uuid not null → batches on delete cascade, holder_id uuid null → tap_card_holders on delete set null, activated_at timestamptz, deactivated_at timestamptz)`
  - `tap_card_holders(name text not null, email text not null, email_lower text generated always as (lower(email)) stored unique, age_confirmed_via text not null check in ('customer','staff'), activated_by_member_id uuid null)`
  - `tap_card_visits(holder_id → holders on delete cascade, member_id → members on delete cascade, card_id → cards on delete set null, device_id → scanner_devices on delete set null, visited_at timestamptz not null default now(), visit_day date not null, redeemed_year smallint null)`; unique `(holder_id, member_id, visit_day)`; unique partial `(holder_id, member_id, redeemed_year) where redeemed_year is not null`.
  - `scanner_devices(member_id → members on delete cascade, label text not null, token_hash text unique not null, created_by uuid, last_used_at timestamptz, revoked_at timestamptz)`
  - `tap_card_offers(member_id uuid pk → members on delete cascade, offer_text text not null check (char_length between 3 and 140), status text not null check in ('pending','approved','declined'), submitted_by uuid, submitted_at timestamptz default now(), reviewed_by uuid, reviewed_at timestamptz)`
  - `tap_card_milestones(stops_required int not null check (> 0), reward_text text not null, active boolean not null default true)`
  - `tap_card_rewards(holder_id → holders cascade, milestone_id → milestones cascade, year smallint not null, earned_at timestamptz default now(), handed_out_at timestamptz, handed_out_by uuid)`; unique `(holder_id, milestone_id, year)`.
  - `tap_card_login_tokens(holder_id → holders cascade, token_hash text unique not null, expires_at timestamptz not null, used_at timestamptz)`
  - `tap_card_sessions(holder_id → holders cascade, token_hash text unique not null, expires_at timestamptz not null)`
  - `site_settings.tap_card_period text not null default 'calendar_year' check (tap_card_period in ('calendar_year'))`, `site_settings.tap_card_price_cents int not null default 500 check (>= 0)`.
  - Matching row types in `types.ts` (`TapCardRow`, `TapCardHolderRow`, `TapCardVisitRow`, `ScannerDeviceRow`, `TapCardOfferRow`, `TapCardMilestoneRow`, `TapCardRewardRow`).

- [ ] **Step 1: Write `tap_card.test.sql`** (fixtures via `\ir _fixtures.psql`): `has_table` for all nine; as `authenticated` owner f0..01, `select` from each Tap Card table returns 0 rows / is denied (`throws_ok` on insert into `tap_card_visits`); as service role: a second visit row with the same `(holder, member, visit_day)` throws `23505`; a second `redeemed_year = 2026` row for the same holder+member on another day throws `23505`; `redeemed_year = 2027` succeeds; inserting `code = 'ABCI1234'` throws `23514`; two holders with emails `Pat@x.com` / `pat@x.com` throws `23505`; `site_settings.tap_card_price_cents` defaults to 500.
- [ ] **Step 2: Run** `npm run test:db -- supabase/tests/tap_card.test.sql` → FAIL (tables missing; the runner splices the unpushed migration only once it exists).
- [ ] **Step 3: Write the migration** as specified above.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Add the row types; run** `npx tsc --noEmit` → no new errors.
- [ ] **Step 6: Commit** `feat(tap-card): tables, unique rules and settings for the Inland Tap Card`.
- [ ] **Step 7: STOP — ask the owner for the go-ahead to `db push`.** After pushing, confirm the tables exist on the hosted DB before pushing any later task to staging.

### Task 2: Pure rules — codes, Pacific dates, check-in, milestones

**Files:**
- Create: `src/lib/tap-card/card-code.ts`, `src/lib/tap-card/card-code.test.ts`
- Create: `src/lib/tap-card/tapcard-time.ts`, `src/lib/tap-card/tapcard-time.test.ts`
- Create: `src/lib/tap-card/check-in-core.ts`, `src/lib/tap-card/check-in-core.test.ts`
- Create: `src/lib/tap-card/milestones.ts`, `src/lib/tap-card/milestones.test.ts`
- Create: `src/lib/tap-card/tapcard-copy.ts`

**Interfaces:**
- Produces:
  ```ts
  // card-code.ts
  export const CARD_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  export function generateCardCode(): string;                 // 8 chars, crypto.getRandomValues, rejection-sampled
  export function normalizeCardCode(input: string): string | null; // upper, strip spaces/dashes, I/L→1, O→0; null unless 8 valid chars
  export function formatCardCode(code: string): string;       // "ABCD-EFGH"
  export function cardUrl(siteUrl: string, code: string): string; // `${siteUrl}/p/${code}`
  // tapcard-time.ts
  export const TAP_CARD_TZ = "America/Los_Angeles";
  export function tapCardDay(at: Date): string;   // "YYYY-MM-DD" in TAP_CARD_TZ
  export function tapCardYear(at: Date): number;
  // check-in-core.ts
  export type CheckInStore = {
    findVisit(holderId: string, memberId: string, day: string): Promise<{ id: string; redeemedYear: number | null } | null>;
    hasRedeemed(holderId: string, memberId: string, year: number): Promise<{ day: string } | null>;
    insertVisit(v: { holderId: string; memberId: string; cardId: string; deviceId: string; day: string; redeemedYear: number | null }): Promise<"ok" | "duplicate">;
    markRedeemed(visitId: string, year: number): Promise<"ok" | "duplicate">;
  };
  export type CheckInOutcome =
    | { kind: "recorded"; redeemed: boolean }
    | { kind: "already-visited-today"; redeemed: boolean }
    | { kind: "already-redeemed"; redeemedOn: string; visitRecorded: boolean };
  export function checkInCore(store: CheckInStore, input: { holderId: string; memberId: string; cardId: string; deviceId: string; redeem: boolean; at: Date }): Promise<CheckInOutcome>;
  export function redemptionStatus(store: CheckInStore, holderId: string, memberId: string, at: Date): Promise<{ available: true } | { available: false; redeemedOn: string }>;
  // milestones.ts
  export type Milestone = { id: string; stopsRequired: number; rewardText: string };
  export function newlyEarned(milestones: Milestone[], distinctStopsThisYear: number, alreadyEarnedIds: Set<string>): Milestone[];
  // tapcard-copy.ts
  export const PROGRAM_NAME = "Inland Tap Card";
  export const STANDARD_OFFER = "Your first beer for a nickel";
  ```

- [ ] **Step 1: Write failing tests:**
  - `normalizeCardCode`: `"abcd-efgh"` → `"ABCDEFGH"`; `"oil1 2345"` → `"0111 2345"` minus space = `"01112345"`; `"ABCU1234"` → `null` (U not in alphabet); 7 chars → `null`. `generateCardCode()` 1,000 times → all match `/^[0-9A-HJKMNP-TV-Z]{8}$/`. `formatCardCode("ABCDEFGH") === "ABCD-EFGH"`.
  - `tapCardDay(new Date("2027-01-01T07:30:00Z")) === "2026-12-31"`, `tapCardYear(...) === 2026`; `new Date("2027-01-01T08:30:00Z")` → `"2027-01-01"`, `2027` (Review Focus 2). DST check: `2026-03-08T09:59:00Z` → `"2026-03-08"`.
  - `checkInCore` with an in-memory store: first visit no redeem → `recorded, redeemed false`; same day again → `already-visited-today`; same day with redeem → visit row updated, `recorded, redeemed true` via `markRedeemed`; next day redeem again same year → `already-redeemed` with `redeemedOn` and `visitRecorded true` (the visit still counts); `insertVisit` returning `"duplicate"` (race) → `already-visited-today` (Review Focus 1); Dec 31 23:30 PT redeem then Jan 1 00:30 PT redeem → second is `recorded, redeemed true` (Review Focus 2).
  - `newlyEarned`: milestones 5 and 10, 5 stops, none earned → `[5]`; 5 earned already → `[]`; 12 stops, nothing earned → `[5, 10]`.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card` → FAIL.
- [ ] **Step 3: Implement.** Use `TZDate` from `@date-fns/tz` (already a dependency) for the Pacific conversions; no hand-written offset math.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): card codes, Pacific day/year, check-in and milestone rules`.

### Task 3: Cookies, scanner devices and holder sessions (server)

**Files:**
- Create: `src/lib/tap-card/tapcard-cookies.server.ts`
- Create: `src/lib/tap-card/tapcard-auth.ts`, `src/lib/tap-card/tapcard-auth.test.ts`
- Modify: `src/lib/join/join-guards.server.ts` (widen `rateLimitMessage` namespace union with `"tapcard-activate" | "tapcard-signin" | "tapcard-card"`)

**Interfaces:**
- Consumes: `generateUploadToken`, `hashUploadToken` from `src/lib/media/upload-tokens.ts` (reuse for every Tap Card token).
- Produces:
  ```ts
  export const SCANNER_COOKIE = "iebg_scanner";    // raw device token, HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 400 days
  export const HOLDER_COOKIE = "iebg_tapcard";    // raw session token, same flags, Max-Age 90 days
  export const LOGIN_TOKEN_TTL_MINUTES = 60;
  // tapcard-auth.ts (pure, store-injected)
  export type ScannerDevice = { id: string; memberId: string; memberName: string; label: string };
  export function resolveScannerDevice(store: { byHash(hash: string): Promise<(ScannerDevice & { revokedAt: string | null; memberPublished: boolean; trailEligible: boolean }) | null> }, rawToken: string | undefined):
    Promise<{ kind: "none" } | { kind: "blocked"; device: ScannerDevice } | { kind: "ok"; device: ScannerDevice }>;
  export function resolveHolderSession(store: { byHash(hash: string): Promise<{ holderId: string; expiresAt: string } | null> }, rawToken: string | undefined, now: Date): Promise<string | null>;
  // tapcard-cookies.server.ts
  export async function readScannerDevice(): Promise<ReturnType<typeof resolveScannerDevice>>; // also stamps last_used_at
  export async function readHolderId(): Promise<string | null>;
  export async function startHolderSession(holderId: string): Promise<void>; // inserts tap_card_sessions, sets cookie
  export async function endHolderSession(): Promise<void>;
  ```

- [ ] **Step 1: Write failing tests** for `resolveScannerDevice`: no cookie → `none`; unknown hash → `none`; revoked → `none`; member unpublished or `trailEligible false` → `blocked` (Review Focus 3); otherwise `ok`. `resolveHolderSession`: expired → `null`; valid → holder id.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/tapcard-auth.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files; cookies via `getCookie`/`setCookie` from `@tanstack/react-start/server`, matching how `age-gate.server.ts` reads its cookie.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(tap-card): scanner-device and holder-session cookies`.

### Task 4: Guild screen — card batches and test cleanup

**Files:**
- Create: `src/lib/tap-card/batches.server.ts`, `src/lib/tap-card/batch-csv.ts`, `src/lib/tap-card/batch-csv.test.ts`
- Create: `src/routes/guild.tap-card.tsx`, `src/components/guild/tap-card/CardBatchesPanel.tsx`
- Modify: `src/components/guild/GuildShell.tsx` (sidebar link "Tap Card" after Broadcast)

**Interfaces:**
- Consumes: `generateCardCode`, `formatCardCode`, `cardUrl` (Task 2); `requireGuildAdminSession`; the audit log writer in `src/lib/guild/audit-log.server.ts`.
- Produces:
  ```ts
  export const createCardBatch: ServerFn<{ label: string; memberId: string | null; count: number; isTest: boolean }, { batchId: string }>; // count 1..2000; retry a code on 23505
  export const listCardBatches: ServerFn<void, { id: string; label: string; memberName: string | null; count: number; activated: number; isTest: boolean; createdAt: string }[]>;
  export const downloadBatchCsv: ServerFn<{ batchId: string }, { filename: string; csv: string }>;
  export const deleteTestBatch: ServerFn<{ batchId: string }, { ok: true }>; // refuses unless is_test
  export function batchCsv(siteUrl: string, codes: string[]): string; // header "code,printed_code,url"
  ```

- [ ] **Step 1: Write failing test** `batchCsv("https://iscbrewersguild.org", ["ABCDEFGH"])` → `"code,printed_code,url\nABCDEFGH,ABCD-EFGH,https://iscbrewersguild.org/p/ABCDEFGH\n"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the CSV helper and server functions. `deleteTestBatch` deletes, in order: holders whose **every** card is in the batch (their visits/rewards cascade), then the batch (cards cascade). Every action writes an audit-log entry. The panel's help text says a card works at any stop; the assigned brewery only tracks where it was sold.
- [ ] **Step 4: Run** tests → PASS. **Step 5: Build the panel**: form (label, brewery picker of trail stops + "Not assigned", count, "Test cards" checkbox), table of batches with Download CSV and, for test batches only, Delete.
- [ ] **Step 6: Commit** `feat(tap-card): Guild card batches with printer CSV and test cleanup`.

### Task 5: Card activation (customer and staff)

**Files:**
- Create: `src/lib/tap-card/activate-core.ts`, `src/lib/tap-card/activate-core.test.ts`
- Create: `src/lib/tap-card/activate.server.ts`
- Modify: `src/lib/email/build-email-content.ts`, `src/lib/email/resolve-recipient.server.ts` (two triggers)

**Interfaces:**
- Consumes: `normalizeCardCode` (Task 2); `startHolderSession` (Task 3); `sendTransactionalEmail`; `isHoneypotTripped`; `rateLimitMessage("tapcard-activate")`.
- Produces:
  ```ts
  export type ActivateInput = { code: string; name: string; email: string; ageConfirmed: boolean; via: "customer" | "staff"; memberId: string | null };
  export type ActivateOutcome =
    | { kind: "activated"; holderId: string; joinedExisting: boolean }
    | { kind: "already-active" } | { kind: "unknown-card" }
    | { kind: "invalid"; errors: Partial<Record<"name" | "email" | "ageConfirmed", string>> };
  export function activateCore(store: ActivateStore, input: ActivateInput): Promise<ActivateOutcome>;
  export const activateCardAsCustomer: ServerFn<{ code; name; email; ageConfirmed; website /*honeypot*/ }, ActivateOutcome>; // starts holder session, sends "tap_card_welcome"
  export const activateCardAsStaff: ServerFn<{ code; name; email; idChecked: boolean }, ActivateOutcome>; // requires readScannerDevice() ok; sends "tap_card_welcome"
  // email payloads
  | { trigger: "tap_card_welcome"; email: string; name: string; cardUrl: string }
  | { trigger: "tap_card_signin_link"; email: string; link: string }
  ```
- Validation: name 1–80 chars after trimming; email must match the site's existing email check (reuse the one in `join-validation.ts`); `ageConfirmed` must be true (customer label "I am 21 or older"; staff label "I checked their ID").

- [ ] **Step 1: Write failing tests:** unknown code → `unknown-card`; already activated → `already-active`; new email → new holder, card linked, `joinedExisting false`; email `Pat@X.com` when holder `pat@x.com` exists → same holder, `joinedExisting true` (Review Focus 4); `ageConfirmed false` → `invalid` with `ageConfirmed` message; blank name → `invalid`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** core, server functions and both email templates (subject "Your Inland Tap Card is ready" / "Sign in to your Inland Tap Card"; the sign-in link email says it expires in 60 minutes). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): card activation by customer or staff, welcome email`.

### Task 6: The `/p/$code` page and the check-in screen

**Files:**
- Create: `src/lib/tap-card/card-view.server.ts`, `src/lib/tap-card/check-in.server.ts`
- Create: `src/routes/p.$code.tsx`, `src/components/tap-card/CheckInScreen.tsx`, `src/components/tap-card/ActivateForm.tsx`, `src/components/tap-card/CardLanding.tsx`
- Create: `src/routes/scanner.$token.tsx`, `src/routes/scanner.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3, 5; `effectiveOffer` (Task 8 — until Task 8 lands, use `STANDARD_OFFER`).
- Produces:
  ```ts
  export type CardView =
    | { view: "unknown" }
    | { view: "staff-blocked"; memberName: string }
    | { view: "staff-activate"; code: string; memberName: string }
    | { view: "staff-check-in"; code: string; memberName: string; firstName: string; offer: string; redemption: { available: true } | { available: false; redeemedOn: string }; visitedToday: boolean }
    | { view: "customer-activate"; code: string }
    | { view: "customer-active"; signedInAsOwner: boolean };
  export const getCardView: ServerFn<{ code: string }, CardView>;
  export const recordCheckIn: ServerFn<{ code: string; redeem: boolean }, CheckInOutcome | { kind: "not-allowed" }>; // re-checks the device; inserts tap_card_rewards for newlyEarned()
  export const claimScannerLink: ServerFn<{ token: string }, { ok: boolean; memberName?: string }>; // sets SCANNER_COOKIE
  ```

- [ ] **Step 1: Write failing tests** for a pure `pickCardView(device, card, holderSession)` helper in `card-view.server.ts`'s sibling `card-view.ts`: unknown card (any device state) → `unknown` (Review Focus 5); `blocked` device → `staff-blocked` (Review Focus 3); ok device + unactivated card → `staff-activate`; ok device + active card → `staff-check-in`; no device + unactivated → `customer-activate`; no device + active → `customer-active` (`signedInAsOwner` true only when the holder session matches the card's holder).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `card-view.ts` and the server functions. `getCardView` calls `rateLimitMessage("tapcard-card")` only when there's no ok scanner device (staff are never throttled) and returns `unknown` on throttle.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Build the screens** (follow `docs/design/` look; big touch targets, min 44px):
  - Check-in: brewery name at top; "**{firstName}**"; offer text; green "Nickel offer available" or gray "Offer used {Mon D}"; buttons **Record visit** and **Record visit + redeem offer** (redeem hidden when unavailable); result banner using exact copy: "Visit recorded", "Visit recorded — offer redeemed", "Already recorded today", "Offer already used this year ({date})". A reward earned shows "🎉 {firstName} just earned: {rewardText}".
  - Staff activate: name, email, "I checked their ID" checkbox, **Activate card**.
  - Customer activate: same plus honeypot and "I am 21 or older"; footer line linking `/terms` and `/privacy` (reuse `LegalNotice`).
  - Customer active: "This Inland Tap Card is active." + "See my card" (→ `/card`, or sign-in if no session).
  - `/scanner/$token`: claims the link, then redirects to `/scanner` ("This device is ready to check in Tap Cards for {brewery}. Tap a card on this phone, or scan its QR code with the camera app."). Tell staff to open the setup link in the phone's **default browser**.
- [ ] **Step 6: Age gate:** add `/scanner` to `OPEN_PREFIXES` in `src/lib/site/age-gate.ts`; leave `/p` behind the gate (customers confirm 21+; a staff device confirms once and keeps the cookie). Add both cases to `age-gate.test.ts`; run it → PASS.
- [ ] **Step 7: Commit** `feat(tap-card): card page, staff check-in screen and scanner setup link`.

### Task 7: Brewery screen — scanner devices and offer (portal + admin)

**Files:**
- Create: `src/lib/tap-card/brewery-tap-card.server.ts`
- Create: `src/components/portal/TapCardSection.tsx`
- Modify: `src/lib/portal/portal-sections.ts` (+ its test): new section `"tap-card"`, label `{ label: "Tap Card", short: "TapCard" }`, visible only to producers whose `trail_eligible` is true, roles owner/co_owner/editor
- Create: `src/routes/admin.tap-card.tsx` (renders the same `TapCardSection`)

**Interfaces:**
- Consumes: `generateUploadToken`/`hashUploadToken`; `requireMemberSession`; Task 8's `submitOffer`.
- Produces:
  ```ts
  export const listScannerDevices: ServerFn<{ memberId: string }, { id: string; label: string; createdAt: string; lastUsedAt: string | null }[]>; // not revoked
  export const createScannerDevice: ServerFn<{ memberId: string; label: string }, { setupUrl: string }>; // `${site}/scanner/${rawToken}`, shown once
  export const revokeScannerDevice: ServerFn<{ memberId: string; deviceId: string }, { ok: true }>;
  ```
  Each checks the caller is owner/co_owner/full editor of `memberId` (or a Guild admin editing as them), the same check `upload-tokens.server.ts` uses.

- [ ] **Step 1: Extend `portal-sections.test.ts`:** producer with `trailEligible` → sees `tap-card`; mobile → doesn't; producer `media_events` → doesn't.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the section rule (pass `trailEligible` in the viewer object), the server functions and `TapCardSection`: "Bar devices" list with Revoke, "Add a device" (label e.g. "Bar iPad") showing the setup link once with Copy; "Your offer" card (Task 8 fills it). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): brewery bar-device links on Portal and Admin`.

### Task 8: Offers — brewer submits, Guild approves, one resolver everywhere

**Files:**
- Create: `src/lib/tap-card/offers.ts`, `src/lib/tap-card/offers.test.ts`, `src/lib/tap-card/offers.server.ts`
- Create: `src/components/guild/tap-card/OfferApprovalsPanel.tsx`
- Modify: `src/components/portal/TapCardSection.tsx`, `src/routes/guild.tap-card.tsx`, `src/components/profile/MemberProfileTemplate.tsx` (producer + trail stop: a "On the Inland Tap Card — {offer}" line under the hero)

**Interfaces:**
- Produces:
  ```ts
  export function effectiveOffer(row: { offerText: string; status: "pending" | "approved" | "declined" } | null): string; // approved → its text, else STANDARD_OFFER
  export const submitOffer: ServerFn<{ memberId: string; offerText: string | null }, { status: "pending" | "standard" }>; // null = go back to standard (deletes row)
  export const listPendingOffers: ServerFn<void, { memberId: string; memberName: string; offerText: string; submittedAt: string }[]>;
  export const reviewOffer: ServerFn<{ memberId: string; approve: boolean }, { ok: true }>; // Guild admin; audit-logged
  export async function offersForMembers(service: SupabaseClient, memberIds: string[]): Promise<Map<string, string>>; // effective text per member
  ```

- [ ] **Step 1: Write failing tests** for `effectiveOffer`: `null` → `"Your first beer for a nickel"`; pending → standard; declined → standard; approved `"Free flight"` → `"Free flight"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; editing an approved offer sets it back to `pending` (standard shows meanwhile). Brewer UI shows status ("Waiting for Guild approval", "Approved", "Not approved — the standard offer is showing"). Wire `effectiveOffer` into Task 6's check-in view. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): brewer offers with Guild approval`.

### Task 9: Holder sign-in and the `/card` page

**Files:**
- Create: `src/lib/tap-card/holder.server.ts`, `src/lib/tap-card/holder-view.ts`, `src/lib/tap-card/holder-view.test.ts`
- Create: `src/routes/card.tsx`, `src/routes/card_.signin.tsx`, `src/routes/card_.login.$token.tsx`
- Modify: `src/lib/site/age-gate.ts` (`/card/login` joins `OPEN_PREFIXES`, as an emailed link)

**Interfaces:**
- Consumes: Task 3 session helpers; `tapCardYear`; `normalizeCardCode`; `rateLimitMessage("tapcard-signin")`.
- Produces:
  ```ts
  export const requestHolderSignIn: ServerFn<{ email: string; website: string }, { kind: "check-email" } | { kind: "error"; message: string }>; // always "check-email"; emails only when a holder exists
  export const consumeHolderLogin: ServerFn<{ token: string }, { ok: boolean }>; // single use, 60 min, then startHolderSession
  export const getHolderCard: ServerFn<void, HolderCardView | null>;
  export const addReplacementCard: ServerFn<{ code: string }, { kind: "added" } | { kind: "unknown-card" } | { kind: "already-active" }>;
  export const signOutHolder: ServerFn<void, { ok: true }>;
  export type HolderCardView = { firstName: string; year: number; stops: { memberId: string; name: string; slug: string; city: string | null; offer: string; visited: boolean; redeemedOn: string | null }[];
    visitedCount: number; totalStops: number; milestones: { stopsRequired: number; rewardText: string; earned: boolean; handedOut: boolean }[]; cards: string[] /* formatted codes */ };
  export function buildHolderView(input: {...raw rows...}): HolderCardView; // pure
  ```

- [ ] **Step 1: Write failing tests** for `buildHolderView`: visits from last year don't count as visited this year; stops sorted unvisited first then by name; `visitedCount` counts distinct stops; an unpublished member with old visits isn't listed.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** The page: "{firstName}'s Inland Tap Card — {visited} of {total} stops in {year}", progress bar, milestones list, stop list (name links to profile; offer; "Visited" / "Not yet"), "Lost your card? Add a new one" (code input), Sign out. `/card` without a session → redirect to `/card/signin`. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): holder email sign-in and card page`.

### Task 10: Guild — milestones, earned rewards, card price

**Files:**
- Create: `src/lib/tap-card/milestones.server.ts`, `src/components/guild/tap-card/MilestonesPanel.tsx`, `src/components/guild/tap-card/RewardsPanel.tsx`
- Modify: `src/routes/guild.tap-card.tsx` (tabs: Cards · Offers · Milestones · Rewards), `src/lib/guild/site-settings.ts` + `.server.ts` + `src/components/guild/SiteSettingsScreen.tsx` (suggested card price)

**Interfaces:**
- Produces:
  ```ts
  export const listMilestones / saveMilestone({ id?: string; stopsRequired: number; rewardText: string; active: boolean }) / deleteMilestone({ id });
  export const listEarnedRewards: ServerFn<{ year: number; show: "waiting" | "all" }, { rewardId: string; holderName: string; holderEmail: string; rewardText: string; earnedAt: string; handedOutAt: string | null }[]>;
  export const markRewardHandedOut: ServerFn<{ rewardId: string; handedOut: boolean }, { ok: true }>;
  export function saveTapCardPriceCore(service, cents: number): Promise<void>; // 0..10000
  ```
  Deleting a milestone that already has earned rewards is refused ("Turn it off instead").

- [ ] **Step 1: Extend `site-settings.test.ts`**: `toSiteSettingsView` exposes `tapCardPriceCents` (default 500); saving `-1` or `10001` throws.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the settings field ("Suggested Tap Card price") and both panels. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): Guild milestones, rewards to hand out, card price`.

### Task 11: Public Trail page

**Files:**
- Create: `src/lib/tap-card/trail.server.ts`, `src/routes/trail.tsx`
- Modify: `src/components/site/Header.tsx` (nav link "Tap Card" → `/trail`)

**Interfaces:**
- Consumes: `directoryPins`/`DirectoryMember` from `src/lib/members/directory.ts`; `MembersMap`; `offersForMembers` (Task 8).
- Produces: `getTrailStops: ServerFn<void, { members: DirectoryMember[]; offers: Record<string, string>; cardPriceCents: number }>` (published + `trail_eligible` only).

- [ ] **Step 1: Build `/trail`**: hero "Inland Tap Card"; three steps ("Pick up a card at any stop — about ${price}", "Have the bartender tap it at every new taproom", "Earn Guild rewards as you go"); `MembersMap` of stops; list of stops with city and offer; link "Already have a card? See your progress" → `/card`.
- [ ] **Step 2: Verify** locally with `npm run dev`: `/trail` shows only published trail stops; Sample Brewery (draft) is absent.
- [ ] **Step 3: Commit** `feat(tap-card): public Trail page and header link`.

### Task 12: Policies, guide and docs

**Files:**
- Modify: `src/components/site/PrivacyPolicy.tsx`, `src/components/site/TermsOfUse.tsx`, `src/lib/site/legal.ts` (`effectiveDate` = release date), their tests
- Modify: `docs/member-profiles.md` ("The Guild Trail" → describe what's built; replace the `trail_visits` sketch with the real tables)
- Modify: `docs/member-guide/member-profile-guide.html` + rebuild PDFs (`npm run build:guides`) — Producer guide: "Tap Card" section (adding a bar device, offers and approval, what staff see)

- [ ] **Step 1: Privacy:** add what the Tap Card program stores (name, email, card code, visits with brewery and date, redemptions, rewards), who sees it (Guild admins; the holder; brewers see counts only), the two cookies (`iebg_scanner`, `iebg_tapcard`) and why, retention (until the holder asks to delete via `legal@`), and that wallet passes/analytics are **not** yet used. Terms: Tap Card rules (one offer per brewery per calendar year, offers set by each brewery and approved by the Guild, cards non-transferable for redemptions, Guild may change rewards).
- [ ] **Step 2: Run** `npx vitest run src/components/site` → PASS (update copy assertions).
- [ ] **Step 3: Update docs and guide; run** `npm run build:guides`; re-take screenshots per the member-guide memory (generic sample brewery, example.com addresses).
- [ ] **Step 4: Commit** `docs(tap-card): privacy, terms, member guide and spec notes`.

### Task 13: Staging walkthrough

- [ ] **Step 1:** `npm run build` → succeeds. Check `git log origin/staging..HEAD`, push to staging, confirm the deploy by behavior (`/trail` loads).
- [ ] **Step 2:** In `/guild/tap-card`, create a **Test cards** batch of 3 for Sample Brewery; download CSV. Encode one code on a blank NFC tag (or just open the URL) for the walkthrough.
- [ ] **Step 3:** With Sample Brewery still a draft, open the scanner setup link and tap a card → `staff-blocked` (Review Focus 3). Then **ask the owner** before publishing Sample Brewery behind Maintenance Mode for the rest of the walkthrough; unpublish it again at the end.
- [ ] **Step 4:** On an iPhone and an Android: open the scanner setup link in the default browser → tap/scan card → staff activate with `boblelle77+tapcard@gmail.com` → Record visit + redeem → second redeem shows "Offer already used this year" → customer phone opens the card → sign in by email → `/card` shows 1 of N.
- [ ] **Step 5:** Delete the test batch; confirm the holder and visits are gone.
- [ ] **Step 6:** Report to the owner with the remaining pre-launch items: attorney/ABC review, trademark search, card print order (CSV), domain on cards, Member Guide check, then merge to main on the owner's go.
