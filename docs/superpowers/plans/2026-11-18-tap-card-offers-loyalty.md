# Tap Card Offers & Loyalty Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Tap Card into a loyalty card: Guild-locked Beer Trail offer, brewery Member Offers (3 ladder steps + 1 repeating, Guild-approved, built from Guild templates), banked expiring rewards, and a one-tap bar screen.

**Architecture:** New server-only tables for member offers, templates, a per-brewery expiry setting and earned rewards; pure rule modules (`loyalty.ts`, `bar-core.ts`) hold every rule and are unit-tested with in-memory stores, like phase 1's `check-in-core.ts`. The bar screen stops having "Record visit" buttons: the card page loads read-only (GET), then the check-in screen POSTs once to record the visit and get the bar state.

**Tech Stack:** TanStack Start (`createServerFn`, file routes) on Cloudflare Workers; Supabase Postgres + pgTAP (`npm run test:db`); Vitest; React.

**Spec:** `docs/superpowers/specs/2026-11-17-tap-card-offers-loyalty-design.md` (builds on `docs/superpowers/specs/2026-11-17-inland-tap-card-design.md`).

## Global Constraints

- Work on the `staging` branch; nothing merges to main until phase 1 + this ship together (owner, 2026-11-17).
- Staging and live share one database. Test only with Sample Brewery and **test** card batches. No emails from anything in this plan.
- `npx supabase db push` only after the owner says go. Before asking, confirm `tap_card_offers` holds only test rows.
- Every new table: RLS on, no policies, `revoke all ... from anon, authenticated` (same loop as `20261120100000_inland_tap_card.sql`).
- Every file exporting `createServerFn` that a page imports goes into `vite.config.ts` `importProtection.client.excludeFiles`. Plain exported helpers live in separate `.server.ts` files that are NOT allowlisted.
- Build check: `VITE_SUPABASE_URL=https://placeholder.supabase.co VITE_SUPABASE_ANON_KEY=placeholder VITE_GOOGLE_MAPS_API_KEY=placeholder npm run build` before every push.
- Repo mixes LF/CRLF: edit with the Edit tool; scripted edits use `newline=""`.
- US spelling, plain words for members.
- Pacific time for "today" (`tapCardDay`, `tapCardYear` in `src/lib/tap-card/tap-card-time.ts`).
- Fixed values: ladder slots `step1`, `step2`, `step3`; repeating slot `repeat`; visit numbers / every-N ≥ 2; reward 3–140 characters; terms 0–300; expiry choices 30, 60, 90, 365 days; default 90; template title 1–60.
- Beer Trail offer text stays `STANDARD_OFFER` from `src/lib/tap-card/tap-card-copy.ts`.

## Review Focus

1. The same card opened twice on one day at one brewery (refresh, second tap, two bar devices): one visit, no second repeating reward, the screen says "Already checked in today". → bar-core test `opening twice the same day records one visit and earns nothing new` (Task 6).
2. A reward that expires while banked: it must not show at the bar or on /card, and **Use it** on a stale screen must be refused. → loyalty test `pickBarRewards drops expired rewards`; bar-core test `using an expired reward is refused` (Tasks 2, 6).
3. A brewery removes Step 1 and adds a new Step 1 (or changes its visit number): someone who already earned Step 1 never earns it again. → pgTAP `a step is earned once per person per brewery` (Task 1) + loyalty test `earnedOnVisit skips steps already earned` (Task 2).
4. Undo from a different brewery's device, or for yesterday's visit: refused. Undo then use a different reward the same visit: allowed. → bar-core tests (Task 6).
5. A photographed plate used away from the bar: with no staff code nothing is recorded, and guessing the code stops after 5 tries for 15 minutes. → Task 7b (`confirmAtPlate` locks; `getPlateView` records nothing).
6. Two ladder steps ending up on the same visit number through a pending edit approved after another step changed: approval must re-check and refuse. → loyalty test `validateMemberOffer rejects a visit number another step uses`, used by `reviewMemberOffer` (Tasks 2, 4).

---

### Task 1: Database — member offers, templates, expiry setting, earned rewards

**Files:**
- Create: `supabase/migrations/20261121100000_tap_card_loyalty.sql`
- Create: `supabase/tests/tap_card_loyalty.test.sql`
- Modify: `supabase/tests/tap_card.test.sql` (drop `tap_card_offers` from the table list and the offer-status test; plan count 26 → 24)
- Modify: `src/lib/supabase/types.ts` (remove `TapCardOfferStatus`, `TapCardOfferRow`; add row types below)

**Interfaces:**
- Produces tables:
  - `tap_card_member_offers` — `id uuid pk`, `member_id uuid not null → members on delete cascade`, `slot text check in ('step1','step2','step3','repeat')`, `unique (member_id, slot)`; live (approved) version: `live_visit_number int check >= 2`, `live_reward text check 3..140`, `live_terms text check <= 300`, `live_approved_at timestamptz`, `live_approved_by uuid → auth.users set null`; draft version: `draft_visit_number int check >= 2`, `draft_reward text check 3..140`, `draft_terms text check <= 300`, `draft_status text check in ('pending','declined')`, `draft_submitted_at`, `draft_submitted_by`, `decline_note text check <= 300`; check: `(live_reward is null) = (live_visit_number is null)` and `(draft_status is null) = (draft_reward is null)`; check: at least one of live/draft present.
  - `tap_card_offer_templates` — `id`, `title text 1..60`, `reward text 3..140`, `terms text <= 300 default ''`, `sort_order int not null default 0`, `hidden boolean not null default false`, `created_at`.
  - `tap_card_member_settings` — `member_id uuid pk → members cascade`, `reward_expiry_days int not null default 90 check in (30,60,90,365)`.
  - `tap_card_earned_rewards` — `id`, `holder_id → tap_card_holders cascade`, `member_id → members cascade`, `slot text check in (...)`, `reward text not null`, `terms text not null default ''`, `earned_visit_id uuid not null → tap_card_visits cascade`, `earned_at timestamptz not null default now()`, `expires_at timestamptz not null`, `used_at timestamptz`, `used_visit_id uuid → tap_card_visits set null`, `used_device_id uuid → scanner_devices set null`; check `(used_at is null) = (used_visit_id is null)`.
  - Unique indexes: `(earned_visit_id, slot)`; partial `(holder_id, member_id, slot) where slot <> 'repeat'` (a step earned once ever); partial `(used_visit_id) where used_visit_id is not null` (one member reward per visit); index `(holder_id, member_id) where used_at is null`.
  - `tap_card_plates` — `member_id uuid pk → members cascade`, `code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$')`, `staff_code text check (staff_code ~ '^[0-9]{4}$')`, `created_at`, `updated_at`.
  - Drops `public.tap_card_offers`.
- Produces TS types: `TapCardOfferSlot`, `TapCardMemberOfferRow`, `TapCardOfferTemplateRow`, `TapCardEarnedRewardRow`.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/tap_card_loyalty.test.sql` (same frame as `tap_card.test.sql`: `begin; \ir _fixtures.psql; ... rollback;`), plan 14:
  - `has_table` × 5 for the new tables (incl. `tap_card_plates`); `hasnt_table('public','tap_card_offers', ...)`; `throws_ok` 23514 for `staff_code '12a4'` (plan count +2 → 16).
  - `throws_ok` 23514: member offer with `slot 'step4'`; with `live_visit_number 1`; with `live_reward 'ab'`; settings with `reward_expiry_days 45`.
  - `throws_ok` 23505 `a step is earned once per person per brewery`: two earned rows, same holder/member/`step1`, different visits.
  - `lives_ok` `the repeating reward can be earned on many visits`: two `repeat` rows on different visits.
  - `throws_ok` 23505 `one member reward used per visit`: two rows with the same `used_visit_id`.
  - Client roles: `throws_ok` 42501 for `authenticated` reading `tap_card_earned_rewards`, and `anon` reading `tap_card_offer_templates`.
- [ ] **Step 2: Run** `npm run test:db -- supabase/tests/tap_card_loyalty.test.sql` → FAIL (tables don't exist; the runner splices the unpushed migration, so failures are the test's own assertions once the migration exists).
- [ ] **Step 3: Write the migration** with the header comment style of `20261120100000_inland_tap_card.sql` (why, and which rules the database enforces). Update `tap_card.test.sql` and `types.ts` as listed.
- [ ] **Step 4: Run** `npm run test:db -- supabase/tests/tap_card_loyalty.test.sql supabase/tests/tap_card.test.sql` → all pass.
- [ ] **Step 5: Commit** `feat(tap-card): loyalty tables (member offers, templates, expiry, earned rewards)`. Do NOT push the migration to the database yet — Task 11 asks the owner.

### Task 2: Loyalty rules (pure)

**Files:**
- Create: `src/lib/tap-card/loyalty.ts`, `src/lib/tap-card/loyalty.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OfferSlot = "step1" | "step2" | "step3" | "repeat";
  export const STEP_SLOTS: readonly OfferSlot[];            // ["step1","step2","step3"]
  export const EXPIRY_CHOICES: readonly [30, 60, 90, 365];
  export const DEFAULT_EXPIRY_DAYS = 90;
  export const REWARD_MIN = 3, REWARD_MAX = 140, TERMS_MAX = 300, TEMPLATE_TITLE_MAX = 60;
  export type LiveOffer = { slot: OfferSlot; visitNumber: number; reward: string; terms: string };
  export type OfferInput = { slot: OfferSlot; visitNumber: number; reward: string; terms: string };
  export function validateMemberOffer(input: OfferInput, otherStepNumbers: number[]):
    { ok: true; value: OfferInput } | { ok: false; message: string };
  export function earnedOnVisit(visitNumber: number, live: LiveOffer[], stepsAlreadyEarned: Set<OfferSlot>):
    { slot: OfferSlot; reward: string; terms: string }[];
  export function expiresAt(earnedAt: Date, days: number): Date;
  export type BarReward =
    | { kind: "trail"; reward: string }
    | { kind: "member"; id: string; reward: string; terms: string; expiresAt: string };
  export function pickBarRewards(input: { trailAvailable: boolean;
    banked: { id: string; reward: string; terms: string; expiresAt: string; earnedAt: string }[]; now: Date }):
    { featured: BarReward | null; others: BarReward[] };
  export function offerLabel(slot: OfferSlot, visitNumber: number): string;
  ```
- `validateMemberOffer` trims and collapses whitespace in reward/terms. Messages (exact): visit < 2 on a step → `"Visit numbers start at 2 — visit 1 is the Beer Trail offer."`; every-N < 2 on `repeat` → `"Pick every 2 visits or more."`; non-integer → `"Use a whole number."`; step number in `otherStepNumbers` → `` `Another step already uses visit ${n}.` `` (ignored for `repeat`); reward length → `` `Write at least ${REWARD_MIN} characters.` `` / `` `Keep the reward to ${REWARD_MAX} characters or fewer.` ``; terms → `` `Keep the terms to ${TERMS_MAX} characters or fewer.` ``.
- `offerLabel`: step → `` `Visit ${n}` ``; repeat → `` `Every ${n} visits` ``.

- [ ] **Step 1: Write the failing tests** in `loyalty.test.ts`:
  - `validateMemberOffer`: accepts `{step1, 3, "Free soft pretzel", ""}`; rejects visit 1 with the exact message; rejects `repeat` every 1; rejects 2.5; `rejects a visit number another step uses` (`otherStepNumbers [3]`, visit 3) and allows the same for `repeat`; reward `"ab"` and 141 chars; terms 301 chars; collapses `"  Free   pretzel "` to `"Free pretzel"`.
  - `earnedOnVisit`: visit 3 with step1@3 → `[step1]`; visit 4 with step1@3 → `[]`; `earnedOnVisit skips steps already earned` (step1@3, set has step1 → `[]`); repeat every 5: visits 5 and 10 earn, 7 doesn't; step2@10 + repeat every 5 at visit 10 → both, steps first.
  - `expiresAt(new Date("2026-03-01T20:00:00Z"), 90)` → `2026-05-30T20:00:00.000Z`.
  - `pickBarRewards`: trail available + two banked → featured trail, others sorted by `expiresAt` then `earnedAt`; trail not available → featured is soonest-expiring; `pickBarRewards drops expired rewards` (expiresAt ≤ now excluded from both); nothing → `{ featured: null, others: [] }`.
  - `offerLabel("step1", 3)` → `"Visit 3"`, `offerLabel("repeat", 5)` → `"Every 5 visits"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/loyalty.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `loyalty.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): loyalty rules — validation, earning, expiry, bar pick order`.

### Task 3: Offer templates — Guild screen

**Files:**
- Create: `src/lib/tap-card/offer-templates.server.ts` (RPC; allowlist in `vite.config.ts`)
- Create: `src/components/guild/tap-card/TemplatesPanel.tsx`
- Modify: `src/components/guild/tap-card/TapCardTabs.tsx` (tabs: `cards, offers, templates, milestones, rewards`; label `"Templates"`)
- Modify: `src/routes/guild.tap-card.tsx` (loader case `templates` → `{ templates: await listOfferTemplates() }`; header copy: "Cards that bartenders tap to record visits, the Beer Trail offer, and each stop's loyalty rewards.")
- Test: `src/lib/tap-card/loyalty.test.ts` gains `validateTemplate` cases

**Interfaces:**
- Consumes: `REWARD_MIN/MAX`, `TERMS_MAX`, `TEMPLATE_TITLE_MAX` (Task 2); `requireTapCardGuildAdmin` (`guild-admin.server.ts`).
- Produces:
  ```ts
  // loyalty.ts
  export function validateTemplate(input: { title: string; reward: string; terms: string }):
    { ok: true; value: { title: string; reward: string; terms: string } } | { ok: false; message: string };
  // offer-templates.server.ts
  export type OfferTemplate = { id: string; title: string; reward: string; terms: string; hidden: boolean; sortOrder: number };
  export const listOfferTemplates: () => Promise<OfferTemplate[]>;        // Guild admin; all, by sort_order then created_at
  export const saveOfferTemplate: (d: { id: string | null; title: string; reward: string; terms: string }) => Promise<{ id: string }>;
  export const setTemplateHidden: (d: { id: string; hidden: boolean }) => Promise<{ ok: true }>;
  export const moveOfferTemplate: (d: { id: string; direction: "up" | "down" }) => Promise<{ ok: true }>;
  ```
- New templates get `sort_order = max + 1`.

- [ ] **Step 1: Failing tests** for `validateTemplate`: empty title → `"Give the template a name."`; 61-char title → `` `Keep the name to ${TEMPLATE_TITLE_MAX} characters or fewer.` ``; reward/terms reuse Task 2 messages.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/loyalty.test.ts` → FAIL.
- [ ] **Step 3: Implement** `validateTemplate`, the server functions, and `TemplatesPanel`: list (title, reward, terms; "Hidden" pill), **Edit** inline, **Hide/Show**, **↑/↓**, and an "Add a template" form (Name, Reward, Terms, **Save template**). Intro copy: "Members can start a loyalty reward from one of these and change every word. Hiding a template removes it from members' choices; rewards already made from it don't change."
- [ ] **Step 4: Run** the test file → PASS; build → succeeds.
- [ ] **Step 5: Commit** `feat(tap-card): Guild offer templates`.

### Task 4: Member offers — server

**Files:**
- Create: `src/lib/tap-card/member-offers.server.ts` (RPC; allowlist)
- Create: `src/lib/tap-card/member-offers-view.ts`, `src/lib/tap-card/member-offers-view.test.ts`
- Delete: `src/lib/tap-card/offers.ts`, `src/lib/tap-card/offers.server.ts` (and their tests, if any) once Tasks 5, 7 and 9 no longer import them — do the deletion in Task 9.

**Interfaces:**
- Consumes: Task 2 (`validateMemberOffer`, `OfferSlot`, `EXPIRY_CHOICES`, `DEFAULT_EXPIRY_DAYS`); the editor check pattern from `brewery-tap-card.server.ts` (`is_member_full_editor` RPC + producer + trail_eligible) — copy it as an un-exported function in this file.
- Produces:
  ```ts
  // member-offers-view.ts (pure)
  export type SlotView = {
    slot: OfferSlot;
    live: { visitNumber: number; reward: string; terms: string } | null;
    draft: { visitNumber: number; reward: string; terms: string; status: "pending" | "declined"; note: string | null } | null;
  };
  export function slotViews(rows: TapCardMemberOfferRow[]): SlotView[];   // always 4, in order step1, step2, step3, repeat
  export function otherStepNumbers(views: SlotView[], slot: OfferSlot, use: "live-and-draft" | "live"): number[];
  // member-offers.server.ts
  export type MemberOffersData = { trailOffer: string; slots: SlotView[]; expiryDays: number;
    templates: { id: string; title: string; reward: string; terms: string }[] };   // non-hidden templates, in order
  export const getMemberOffers: (d: { memberId: string }) => Promise<MemberOffersData>;
  export const submitMemberOffer: (d: { memberId: string; slot: OfferSlot; visitNumber: number; reward: string; terms: string }) => Promise<{ ok: true }>;
  export const removeMemberOffer: (d: { memberId: string; slot: OfferSlot }) => Promise<{ ok: true }>;
  export const withdrawMemberOfferDraft: (d: { memberId: string; slot: OfferSlot }) => Promise<{ ok: true }>;
  export const saveRewardExpiry: (d: { memberId: string; days: number }) => Promise<{ ok: true }>;
  export type PendingMemberOffer = { id: string; memberId: string; memberName: string; slot: OfferSlot;
    draft: { visitNumber: number; reward: string; terms: string }; live: { visitNumber: number; reward: string; terms: string } | null; submittedAt: string };
  export const listPendingMemberOffers: () => Promise<PendingMemberOffer[]>;   // Guild admin
  export const reviewMemberOffer: (d: { id: string; approve: boolean; note: string }) => Promise<{ ok: true }>;
  ```
- Rules: `submitMemberOffer` validates against `otherStepNumbers(views, slot, "live-and-draft")`, then upserts the draft (`draft_status 'pending'`, clears `decline_note`); the live version is untouched. `removeMemberOffer` deletes the row (earned rewards keep their own text). `withdrawMemberOfferDraft` clears the draft; deletes the row if there's no live version. `reviewMemberOffer` approve: re-validates the draft against `otherStepNumbers(views, slot, "live")` for that member, throwing the validation message if it now collides; then copies draft → live and clears the draft. Decline: `draft_status 'declined'`, `decline_note` = trimmed note or null. `saveRewardExpiry` upserts `tap_card_member_settings`; refuses values outside `EXPIRY_CHOICES` with `"Pick one of the listed lengths."`.

- [ ] **Step 1: Failing tests** in `member-offers-view.test.ts`: `slotViews([])` → four empty slots in order; a row with live + pending draft maps both; declined draft carries the note; `otherStepNumbers` for `step2` with step1 live@3 and step3 draft@5 → `[3, 5]` in `live-and-draft`, `[3]` in `live`; never includes `repeat` or the slot itself.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/member-offers-view.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files; add `member-offers.server.ts` to the allowlist.
- [ ] **Step 4: Run** → PASS; build → succeeds.
- [ ] **Step 5: Commit** `feat(tap-card): member offers — submit, approve, remove, expiry setting`.

### Task 5: Offers section — Portal and /admin

**Files:**
- Create: `src/components/portal/TapCardOffersSection.tsx`
- Modify: `src/components/portal/TapCardSection.tsx` (render `TapCardOffersSection` in place of `TapCardOfferCard`; header copy: "You're a stop on the Inland Tap Card trail. Customers' cards are tapped on a bar device to record each visit and hand out rewards.")
- Delete: `src/components/portal/TapCardOfferCard.tsx`

**Interfaces:**
- Consumes: Task 4 server functions and `SlotView`; `offerLabel` (Task 2); `EXPIRY_CHOICES`.

Layout (spec "Member's Offers section"):
- `<h2>Offers</h2>`.
- **Guild Offers**: one row — "Beer Trail · Visit 1 · {trailOffer}" and "Set by the Guild. Once per customer each calendar year."
- **Member Offers**: rows for Step 1–3 and Repeating. Each filled row: `offerLabel`, reward, terms (small), status pill — live only: "Approved"; live + pending: "Approved · change waiting for approval"; pending only: "Waiting for approval"; declined: "Not approved" + the note. Buttons: **Edit**, **Remove** (confirm: "Remove this reward? Customers who already earned it keep it."), and for a waiting/declined draft **Withdraw change**. Empty step: **+ Add a step**; empty repeating: **+ Add a repeating reward**.
- The add/edit form (inline, one at a time): **Start from** select (`Start from scratch` + each template title; choosing one fills Reward and Terms), **Visit number** (or "Every ___ visits" for repeating), **Reward**, **Terms (optional)**, **Submit for approval**, **Cancel**. Intro line: "The Guild checks every reward before it goes live. Your approved version stays live while a change waits."
- **Unused rewards last:** select of `30 days / 60 days / 90 days / 1 year`; saves on change with a "Saved" note.

- [ ] **Step 1: Build the component**; it has no pure logic of its own (rules are tested in Tasks 2 and 4).
- [ ] **Step 2: Verify** `npx tsc --noEmit -p .` clean and the build succeeds. Grep: no remaining import of `TapCardOfferCard`.
- [ ] **Step 3: Commit** `feat(tap-card): Offers section with Guild and Member offers`.

### Task 6: Bar rules (pure)

**Files:**
- Create: `src/lib/tap-card/bar-core.ts`, `src/lib/tap-card/bar-core.test.ts`
- Delete in Task 7: `src/lib/tap-card/check-in-core.ts` and its test (replaced).

**Interfaces:**
- Consumes: `earnedOnVisit`, `expiresAt`, `pickBarRewards`, `BarReward`, `OfferSlot`, `LiveOffer` (Task 2); `tapCardDay`, `tapCardYear`; `STANDARD_OFFER`.
- Produces:
  ```ts
  export type BarStore = {
    findVisit(holderId: string, memberId: string, day: string): Promise<{ id: string; redeemedYear: number | null } | null>;
    insertVisit(v: { holderId: string; memberId: string; cardId: string | null; deviceId: string | null; day: string }): Promise<"ok" | "duplicate">;
    countVisits(holderId: string, memberId: string): Promise<number>;
    trailRedeemedIn(holderId: string, memberId: string, year: number): Promise<{ visitId: string; day: string } | null>;
    setTrailRedeemed(visitId: string, year: number | null): Promise<"ok" | "duplicate">;
    liveOffers(memberId: string): Promise<LiveOffer[]>;
    stepsEarned(holderId: string, memberId: string): Promise<Set<OfferSlot>>;
    expiryDays(memberId: string): Promise<number>;
    insertEarned(r: { holderId: string; memberId: string; slot: OfferSlot; reward: string; terms: string; visitId: string; earnedAt: Date; expiresAt: Date }): Promise<"ok" | "duplicate">;
    banked(holderId: string, memberId: string): Promise<{ id: string; reward: string; terms: string; expiresAt: string; earnedAt: string }[]>;  // unused
    memberRewardUsedOn(visitId: string): Promise<{ id: string; reward: string; terms: string; expiresAt: string } | null>;
    markUsed(rewardId: string, visitId: string, deviceId: string | null, at: Date): Promise<"ok" | "taken">;   // only if unused and the visit has none
    clearUse(rewardId: string, visitId: string): Promise<void>;
  };
  export type BarState = {
    visitNumber: number;
    firstToday: boolean;
    used: BarReward | null;
    featured: BarReward | null;
    others: BarReward[];
    newlyEarned: string[];
  };
  export type VisitInput = { holderId: string; memberId: string; cardId: string | null; deviceId: string | null; at: Date };  // null device = counter plate
  export async function checkInVisit(store: BarStore, input: VisitInput): Promise<BarState>;
  export async function useBarReward(store: BarStore, input: VisitInput & { choice: { kind: "trail" } | { kind: "member"; id: string } }):
    Promise<{ outcome: "used" | "already-used-today" | "not-available"; state: BarState }>;
  export async function undoBarReward(store: BarStore, input: VisitInput): Promise<{ outcome: "undone" | "nothing-to-undo"; state: BarState }>;
  export async function barState(store: BarStore, input: VisitInput & { firstToday: boolean; newlyEarned: string[] }): Promise<BarState>;
  ```
- `checkInVisit`: finds today's visit; if none, inserts (a `"duplicate"` result means another device just did → treat as existing). Only a newly inserted visit earns: `visitNumber = countVisits`, earn via `earnedOnVisit(visitNumber, liveOffers, stepsEarned)`, insert each with `expiresAt(at, expiryDays)` (`"duplicate"` → skip, don't list). Returns `barState`.
- `barState`: `used` = trail if today's visit has `redeemedYear`, else `memberRewardUsedOn(todayVisit)`; when `used` is set, `featured = null` and `others = []`. Otherwise `pickBarRewards({ trailAvailable: !trailRedeemedIn(year), banked, now: at })`. Trail reward text = `STANDARD_OFFER`.
- `useBarReward`: needs today's visit (else `not-available`); if `used` already → `already-used-today`; trail: refuse if redeemed this year; `setTrailRedeemed(visitId, year)`; member: the id must be in `banked` and not expired at `at`, then `markUsed` (`"taken"` → `already-used-today`).
- `undoBarReward`: only today's visit at this brewery: trail → `setTrailRedeemed(visitId, null)`; member → `clearUse`. Nothing used → `nothing-to-undo`.

- [ ] **Step 1: Failing tests** with an in-memory `BarStore` (model it on `check-in-core.test.ts`):
  - first visit records, `visitNumber 1`, `firstToday true`, featured = trail.
  - `opening twice the same day records one visit and earns nothing new` (store seeded with one earlier-day visit and step1@2 + repeat every 2: the first open today is visit 2 and earns both; the second open → `firstToday false`, `visitNumber 2`, `newlyEarned []`, still two earned rows).
  - visit 3 with step1@3 → `newlyEarned ["Free soft pretzel"]`, banked row has expiry = at + 90 days.
  - trail used this year → featured is the soonest-expiring banked reward.
  - use trail → `used` trail, featured null; use again → `already-used-today`.
  - use member reward → marked with this visit and device; then using trail the same visit → `already-used-today`.
  - `using an expired reward is refused` → `not-available`.
  - undo after using → reward back in `featured`/`others`; then use a different one → `used`.
  - undo with nothing used → `nothing-to-undo`; undo on a day with no visit → `nothing-to-undo`.
  - a member reward from brewery A is never offered or usable at brewery B (`banked` is per brewery; `useBarReward` with A's id at B → `not-available`).
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/bar-core.test.ts` → FAIL.
- [ ] **Step 3: Implement** `bar-core.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(tap-card): bar rules — tap records the visit, one reward per visit, undo`.

### Task 7: Bar screen

**Files:**
- Create: `src/lib/tap-card/bar-store.server.ts` (`barStore(service): BarStore` — not allowlisted)
- Modify: `src/lib/tap-card/card-view.server.ts` (replace `recordCheckIn` with `checkInCard`, `useCardReward`, `undoCardReward`; `getCardView` staff-check-in returns only `{ view, code, memberName, firstName }` and records nothing)
- Modify: `src/lib/tap-card/card-view.ts` (`CardView` staff-check-in shape; drop `RedemptionView`)
- Modify: `src/components/tap-card/CheckInScreen.tsx` (rewrite), `src/routes/p.$code.tsx` (staff activation: after "Card activated" call `router.invalidate()` automatically instead of the "Check them in now" button)
- Modify: `src/lib/tap-card/tap-card-store.server.ts` (drop `checkInStore`; keep `distinctStopsInYear`, `awardMilestones`)
- Delete: `src/lib/tap-card/check-in-core.ts`, `check-in-core.test.ts`

**Interfaces:**
- Consumes: Task 6; `awardMilestones` (milestone rewards still announced: add `milestoneRewards: string[]` to the server results, filled only when `firstToday`).
- Produces (server fns, POST, each re-reads the scanner cookie and refuses unless `device.kind === "ok"`):
  ```ts
  export type BarResult = { kind: "ok"; state: BarState; milestoneRewards: string[]; outcome?: string } | { kind: "not-allowed" } | { kind: "unknown-card" };
  export const checkInCard: (d: { code: string }) => Promise<BarResult>;
  export const useCardReward: (d: { code: string; choice: { kind: "trail" } | { kind: "member"; id: string } }) => Promise<BarResult>;
  export const undoCardReward: (d: { code: string }) => Promise<BarResult>;
  ```
- `CheckInScreen` copy (exact):
  - On mount, POST `checkInCard` once (guard against React strict double-invoke with a ref). While waiting: "Checking in…".
  - Heading: `firstToday` → `` `✓ Visit #${n} recorded — ${firstName}` ``; else `` `Already checked in today — visit #${n} — ${firstName}` ``.
  - `newlyEarned` and `milestoneRewards`: `` `🎉 ${firstName} just earned: ${reward}` ``.
  - Featured: trail → label "Beer Trail offer", text `STANDARD_OFFER`; member → reward, terms (small), `` `Use by ${shortDate(expiresAt)}` ``. Big button **Use it**.
  - `others.length > 0`: link `` `${others.length} more waiting` `` toggling a list with **Use this instead** per item.
  - `used`: "Used: {reward}" + **Undo**; no other buttons.
  - No featured, nothing used: "Nothing waiting today."
  - Footer: "Tap the next card to check someone else in."
  - Errors: "That didn't save. Check the connection and try again." Outcomes: `already-used-today` → "One reward per visit — already used today."; `not-available` → "That reward isn't available any more."

- [ ] **Step 1: Implement** `bar-store.server.ts` (the unique-index errors `23505` map to `"duplicate"`/`"taken"`; `banked` filters `used_at is null` and orders by `expires_at`; `countVisits` uses `count: "exact", head: true`).
- [ ] **Step 2: Update** `card-view.ts` and its test for the new staff-check-in shape; run `npx vitest run src/lib/tap-card` → PASS.
- [ ] **Step 3: Implement** the server functions and `CheckInScreen`; update `p.$code.tsx`.
- [ ] **Step 4: Verify** `npx tsc --noEmit -p .` clean; build succeeds; `npx vitest run src/lib/tap-card` passes; grep finds no `recordCheckIn`, `checkInCore`, `redemptionStatus`.
- [ ] **Step 5: Commit** `feat(tap-card): one-tap bar screen with banked rewards and undo`.

### Task 7b: Counter plate

**Files:**
- Create: `src/lib/tap-card/plate.ts`, `src/lib/tap-card/plate.test.ts` (pure)
- Create: `src/lib/tap-card/plate.server.ts` (RPC; allowlist)
- Create: `src/routes/t.$code.tsx`, `src/components/tap-card/PlateScreen.tsx`, `src/components/portal/CounterPlateCard.tsx`
- Modify: `src/components/portal/TapCardSection.tsx` (render `CounterPlateCard` between Bar devices and Offers)
- Modify: `src/lib/tap-card/setup-qr.ts` (generalize: `qrDataUrl(url)`, `qrFilename(prefix, label)`; keep the old names as thin wrappers or update callers + tests)
- Modify: `src/lib/site/maintenance.ts` + test (`"/t"` open like `"/p"`), `src/lib/site/age-gate.ts` + test (`/t` treated like `/p`)
- Modify: `src/lib/join/join-guards.server.ts` (namespace `tapcard-staffcode`)
- Modify: `src/components/guild/tap-card/CardBatchesPanel.tsx` + `batches.server.ts` (**Download counter plate links** → CSV `brewery,code,printed_code,url` for every trail stop, creating missing plates)
- Modify: `src/lib/tap-card/holder.server.ts` / `card_.signin.tsx` (sign-in link may carry a `next` of `/t/<code>`; only `/t/` and `/card` paths accepted)

**Interfaces:**
- Consumes: Task 6 (`checkInVisit`, `useBarReward`, `undoBarReward`, `barState`, `BarState`) with `deviceId: null`, `cardId: null`; `generateCardCode`, `formatCardCode` (`card-code.ts`); `readHolderId`; `rateLimitMessage`.
- Produces:
  ```ts
  // plate.ts
  export function validateStaffCode(raw: string): { ok: true; code: string } | { ok: false; message: string };  // "Use 4 digits."
  export function staffCodeMatches(entered: string, stored: string | null): boolean;  // false when stored is null
  export function plateUrl(siteUrl: string, code: string): string;                       // `${siteUrl}/t/${code}`
  // plate.server.ts
  export type PlateView =
    | { view: "unknown" } | { view: "closed"; memberName: string }          // no staff code set / not a published trail stop
    | { view: "signed-out"; code: string; memberName: string }
    | { view: "ready"; code: string; memberName: string; firstName: string; nextVisitNumber: number; checkedInToday: boolean;
        state: BarState | null };                                            // state of today's visit if any; else preview of waiting rewards
  export const getPlateView: (d: { code: string }) => Promise<PlateView>;     // GET, records nothing
  export const confirmAtPlate: (d: { code: string; staffCode: string; choice: { kind: "none" } | { kind: "trail" } | { kind: "member"; id: string } }) =>
    Promise<{ kind: "ok"; state: BarState; outcome: string } | { kind: "wrong-code"; triesLeft: number } | { kind: "locked" } | { kind: "signed-out" } | { kind: "closed" }>;
  export const undoAtPlate: (d: { code: string; staffCode: string }) => Promise<same as confirmAtPlate>;
  export const getCounterPlate: (d: { memberId: string }) => Promise<{ url: string; printedCode: string; staffCode: string | null }>;  // creates the plate if missing
  export const saveStaffCode: (d: { memberId: string; staffCode: string }) => Promise<{ ok: true }>;
  export const resetPlateLink: (d: { memberId: string }) => Promise<{ url: string; printedCode: string }>;
  ```
- `confirmAtPlate`: holder from the holder-session cookie; plate's brewery must be a published trail stop with a staff code; wrong code counts against `rateLimitMessage("tapcard-staffcode")` keyed per holder + brewery (5 tries / 15 min → `locked`); right code → `checkInVisit`, then `useBarReward` when a choice was made. `undoAtPlate` needs the code too.
- Member editor check (portal functions): same `is_member_full_editor` + producer + trail_eligible check as `brewery-tap-card.server.ts`.

Copy:
- `PlateScreen` ready: eyebrow brewery; heading `` `Hi ${firstName} — this will be visit #${n}` `` (or `` `Checked in today — visit #${n}` ``); "Use now:" radio list (Beer Trail offer first, then waiting rewards by expiry, plus "Just check in"; first option pre-selected); "Bartender: staff code" 4-digit numeric input (`inputMode="numeric"`, `autocomplete="off"`); **Confirm**. Success: `` `✓ Visit #${n} recorded` `` + `` `${reward} used` `` + "Undo (bartender's code)" link. Wrong code: `` `That code isn't right. ${triesLeft} tries left.` ``; locked: "Too many tries. Ask your bartender to try again in 15 minutes."
- signed-out: "Sign in to your Tap Card" → email field → "We sent a sign-in link to that email. Open it on this phone." (uses the existing sign-in sender; returns to `/t/<code>`).
- closed: "Ask your bartender to tap your card."
- `CounterPlateCard` (portal): heading "Counter plate"; "Customers with a smartphone tap or scan this plate at your bar. Your bartender confirms with the staff code. Customers with only a plastic card still need a bar device."; QR (300 px) + **Download QR code** + printed code; "Staff code" 4-digit field + **Save** (shows the current code); **Make a new plate link** (confirm: "Your current plate will stop working.").

- [ ] **Step 1: Failing tests** in `plate.test.ts`: `validateStaffCode("0420")` ok; `"420"`, `"12a4"`, `"12345"` → `"Use 4 digits."`; `staffCodeMatches("0420","0420")` true, `("0421","0420")` false, `("0420", null)` false; `plateUrl("https://x.org","ABCD2345")` → `"https://x.org/t/ABCD2345"`. Plus maintenance/age-gate tests for `/t/ABCD2345` open.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/plate.test.ts src/lib/site` → FAIL.
- [ ] **Step 3: Implement** the files above; allowlist `plate.server.ts`.
- [ ] **Step 4: Run** the tests → PASS; full suite; typecheck; build.
- [ ] **Step 5: Commit** `feat(tap-card): counter plate — customer taps their phone, bartender confirms with a staff code`.

### Task 8: Guild approvals for Member Offers

**Files:**
- Modify: `src/components/guild/tap-card/OfferApprovalsPanel.tsx` (rewrite for `PendingMemberOffer`)
- Modify: `src/routes/guild.tap-card.tsx` (`listPendingMemberOffers` for the badge and the Offers tab)

**Interfaces:**
- Consumes: Task 4 (`listPendingMemberOffers`, `reviewMemberOffer`, `PendingMemberOffer`); `offerLabel`.

Copy: intro "Breweries' loyalty rewards wait here for your OK. Check each one against the alcohol rules the Guild follows. A brewery's approved version stays live while a change waits." Each item: brewery · `offerLabel` · sent date; reward (bold), terms; when `live` exists: "Now live: {label} — {reward}". Buttons **Approve**, **Decline**; Decline reveals "Note to the brewery (optional)" + **Send decline**. Empty: "No offers waiting."

- [ ] **Step 1: Implement**; errors from `reviewMemberOffer` (e.g. a step-number collision) show in the panel's `StatusMessage`.
- [ ] **Step 2: Verify** typecheck + build.
- [ ] **Step 3: Commit** `feat(tap-card): Guild approves member loyalty offers`.

### Task 9: Customer card page, public pages, old offer code removed

**Files:**
- Modify: `src/lib/tap-card/holder-view.ts` + its test; `src/lib/tap-card/holder.server.ts` (`getHolderCard`); `src/routes/card.tsx`
- Modify: `src/lib/tap-card/trail.server.ts` (`getStopOffer` → `getStopTapCard`), `src/lib/tap-card/trail-stops.server.ts` (offer = `STANDARD_OFFER`), `src/routes/members_.$slug.tsx`, `src/components/profile/MemberProfileTemplate.tsx` (`TapCardStopNote`)
- Delete: `src/lib/tap-card/offers-db.server.ts`, `offers.ts`, `offers.server.ts`; remove their allowlist entries

**Interfaces:**
- `HolderViewInput` gains `waiting: { memberName: string; reward: string; terms: string; expiresAt: string }[]` and `visitCounts: { memberId: string; name: string; count: number }[]`; `buildHolderView` passes `waiting` sorted by `expiresAt` (expired already excluded by the query: `used_at is null and expires_at > now()`), and `visitCounts` sorted by count desc then name, all-time.
- `getStopTapCard(d: { slug }) → Promise<{ trailOffer: string; memberOffers: { label: string; reward: string; terms: string }[] } | null>` — live versions only, steps by visit number then repeating; null when not a published trail stop.
- `TapCardStopNote({ trailOffer, memberOffers })`: existing "On the Inland Tap Card" + trail offer; when `memberOffers` exist, a list "Come back for more:" with `label — reward`.

- [ ] **Step 1: Failing tests** in `holder-view.test.ts`: `waiting` keeps order by expiry; `visitCounts` counts every year's visits (a 2025 visit counts), sorted by count.
- [ ] **Step 2: Run** `npx vitest run src/lib/tap-card/holder-view.test.ts` → FAIL.
- [ ] **Step 3: Implement**; on `/card` add a "Waiting for you" card (reward, brewery, terms, "Use by {date}") above progress, shown only when non-empty, and "Your visits" (`{name} — {count} visit(s)`).
- [ ] **Step 4: Run** `npx vitest run` (whole suite) → PASS; typecheck clean; build succeeds; grep finds no `offers-db`, `effectiveOffer`, `tap_card_offers`, `getStopOffer`.
- [ ] **Step 5: Commit** `feat(tap-card): rewards on the card page and member profiles; retire per-brewery trail offers`.

### Task 10: Words — Terms, Privacy, Member Guide, docs

**Files:**
- Modify: `src/components/site/TermsOfUse.tsx`, `src/components/site/PrivacyPolicy.tsx` and their tests
- Modify: `docs/member-guide/member-profile-guide.html` (Tap Card section C "Your offer" → "Offers"), `docs/member-profiles.md` (Tap Card paragraph + data list), `docs/superpowers/specs/2026-11-17-inland-tap-card-design.md` (one line: brewer-replaced trail offer superseded by the loyalty design)

Content:
- Terms (Tap Card section) adds: breweries may offer loyalty rewards for return visits; each is set by the brewery and approved by the Guild; earned rewards wait on the card until used and expire after the period the brewery shows; one reward per visit; rewards have no cash value and can't be transferred; the brewery honors its rewards. Keep "21 and over".
- Privacy adds: for each brewery, how many times you've visited and which rewards you've earned and used, kept with your card.
- Guide: new "Counter plate" part (download the QR, NFC plates from the Guild or an NFC sticker, set and change the staff code, plastic-card customers still need a bar device). Terms: check-ins at a plate need the bartender's code.
- Guide section C: Guild Offers (Beer Trail, set by the Guild); Member Offers (up to 3 steps + 1 repeating, start from a template or scratch, Guild approves, the approved version stays live during a change, removing keeps earned rewards); "Unused rewards last"; section B (checking in) rewritten: tapping records the visit, **Use it**, "N more waiting", **Undo**.
- Do NOT change `LEGAL.effectiveDate` (bumped at the merge to main).

- [ ] **Step 1: Update tests first** (`TermsOfUse.test.tsx`, `PrivacyPolicy.test.tsx`) to expect `"loyalty rewards"` and `"no cash value"` (Terms) and `"which rewards you've earned"` (Privacy); run → FAIL.
- [ ] **Step 2: Edit** the components and docs; run the two tests → PASS.
- [ ] **Step 3: Commit** `docs(tap-card): Terms, Privacy and Member Guide for loyalty rewards`.

### Task 11: Database push and staging walkthrough (owner)

- [ ] **Step 1:** Run a read-only query: `select count(*) from public.tap_card_offers;` and list any rows' member names. Tell the owner what's there.
- [ ] **Step 2: Ask the owner** for the go-ahead to `npx supabase db push` (adds the loyalty tables, removes `tap_card_offers`). Push only on a yes; then `npm run test:db` (all files) → pass.
- [ ] **Step 3:** Full suite, typecheck, build; push `staging`; confirm the deploy by behavior (a bar-device card page shows "Checking in…" → the new heading).
- [ ] **Step 4: Walkthrough with the owner** (Sample Brewery published behind Maintenance Mode, test card batch):
  1. Guild → Tap Card → Templates: add two placeholder templates.
  2. Portal → Tap Card → Offers: Step 1 at visit 2 from a template, edit the wording; a repeating reward every 3 visits from scratch; set "Unused rewards last" to 30 days.
  3. Guild → Offers: approve Step 1; decline the repeating one with a note; member sees the note, edits, resubmits; approve.
  4. Bar device: tap a test card → "Visit #1 recorded", Beer Trail offer featured → **Use it** → **Undo** → **Use it**.
  5. Visits 2 and 3 need different days: ask the owner before inserting back-dated test visits for the test holder with a read-write query; otherwise check earning in the unit tests and stop here.
  6. Customer /card shows "Waiting for you" and "Your visits".
  6b. Counter plate: set a staff code, download the plate QR, scan it with a signed-in customer phone (a different test card holder than step 4), enter a wrong code once, then the right code → visit recorded; Undo with the code.
  7. Profile page shows "Come back for more".
  8. Clean up: unpublish Sample Brewery, Maintenance Mode off, delete the test batch.
