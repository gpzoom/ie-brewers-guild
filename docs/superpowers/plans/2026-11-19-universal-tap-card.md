# Universal Tap Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every published Guild member take Tap Card check-ins with loyalty rewards, add a free loyalty-only card, a visit-1 welcome reward for non-trail members, and safe upgrades to the Beer Trail Pass.

**Architecture:** Split today's single "trail stop" rule into two: *takes check-ins* (any published member) and *is a trail stop* (producer + trail_eligible). The bar core asks the store whether the member is a trail stop before offering the Beer Trail offer; milestones count trail-stop visits only. Free sign-up reuses the holder session and email-code machinery.

**Tech Stack:** TanStack Start server functions + file routes on Cloudflare Workers, Supabase (service role), Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-11-19-universal-tap-card-design.md`

## Global Constraints

- Staging only; main needs the owner's go. `npm run build` (placeholder VITE_ vars) before each staging push; fetch first.
- `db push` only after the owner says "yes" (dry-run first). Staging shares the live database. No email from testing.
- A migration that new code depends on is pushed **before** that code reaches staging.
- US spelling. Line endings: Edit tool, or Python with `newline=""` run from a file (large bash heredocs break).
- New `*.server.ts` modules imported by routes/components go in the import-protection allowlist in `vite.config.ts`; plain helpers (cookies, stores) stay out and are only called inside handlers.
- Trail stop = `member_type === "producer" && trail_eligible`. Takes check-ins = `status === "published"` (or `"draft"` on staging), any member type.

## Review Focus

1. A pass holder checks in at a non-trail member (allied/mobile) → never offered the Beer Trail offer, and that visit never counts toward Guild milestones.
2. A free-card sign-up with an email that already has a card → no new card, no sign-in; the email code instead.
3. A trail stop tries to save a visit-1 loyalty step → refused ("visit 1 is the Beer Trail offer"); a non-trail member may.
4. A member taken off the trail keeps its plate working for loyalty (check-ins still recorded; trail offer gone).
5. "Move to another card" leaves the old empty card deleted only if it has no visits, cards, passes or rewards.

---

### Task 1: Check-ins at every member; Beer Trail only at trail stops

**Files:**
- Modify: `src/lib/tap-card/staff-qr.ts` (`memberTakesCheckIns`, new `isTrailStop`), `src/lib/tap-card/bar-core.ts` (`BarStore.isTrailStop(memberId)`), `src/lib/tap-card/bar-store.server.ts`, `src/lib/tap-card/tap-card-store.server.ts` (`distinctStopsInYear` counts trail stops only), `src/lib/tap-card/tap-card-auth.ts` + `tap-card-cookies.server.ts` (scanner devices at any member), `src/lib/tap-card/tap-card-editor.server.ts` (any member type), `src/lib/portal/portal-sections.ts` (Tap Card tab for every member type), `src/lib/tap-card/brewery-tap-card.server.ts` (`isTapCardStop` → `hasTapCard`, true for any member; keep a `trailStop` flag where the UI needs it), `src/routes/admin.tsx`, `src/components/portal/TapCardOffersSection.tsx` (Beer Trail offer box only for trail stops)
- Test: `staff-qr.test.ts`, `bar-core.test.ts`, `portal-sections.test.ts`, `tap-card-auth.test.ts`

**Interfaces (produces):**
```ts
export function memberTakesCheckIns(m: { status: string }, stagingSite: boolean): boolean;
export function isTrailStop(m: { memberType: string; trailEligible: boolean }): boolean;
// BarStore gains:
isTrailStop(memberId: string): Promise<boolean>;
```
- [ ] Step 1: Tests. `memberTakesCheckIns({status:"published"}, false)` true for producer/mobile/allied alike; draft only on staging. `isTrailStop` true only for producer + trailEligible. bar-core: with a pass but `isTrailStop` false → `featured` never trail, `useBarReward({kind:"trail"})` → not-available, loyalty steps still earned (**Review 1, 4**). portal-sections: `tap-card` open for allied/mobile owners. tap-card-auth: a scanner device at an allied member resolves.
- [ ] Step 2: run → fail. Step 3: implement (bar-core: `trailAvailable = trailStop && pass && !redeemed`; `useBarReward` trail branch checks `isTrailStop` first). `distinctStopsInYear` joins members and counts only trail stops (**Review 1**).
- [ ] Step 4: `npx vitest run src/lib` + `npx tsc --noEmit -p .` pass. Step 5: commit `feat(tap-card): check-ins at every Guild member; Beer Trail offer only at trail stops`.

### Task 2: Visit-1 welcome reward for non-trail members

**Files:** Modify `src/lib/tap-card/loyalty.ts` (`validateMemberOffer` gains `{ trailStop: boolean }`), `member-offers.server.ts` (passes it), `TapCardOffersSection.tsx` (min visit 1 for non-trail, copy), create `supabase/migrations/20261123100300_tap_card_offer_visit_one.sql` (live/draft visit number checks `>= 1`). Test `loyalty.test.ts`.
- [ ] Step 1: Tests: step with visitNumber 1 → ok for `{trailStop:false}`; refused for `{trailStop:true}` with "Visit numbers start at 2 — visit 1 is the Beer Trail offer." (**Review 3**); repeat still needs ≥ 2 for both; `earnedOnVisit(1, [step at 1], ∅)` earns it.
- [ ] Steps 2–4. Owner "yes" → dry-run → push migration before deploying. Step 5: commit `feat(tap-card): visit-1 welcome reward for non-trail members`.

### Task 3: Free loyalty-only card

**Files:** Create `src/lib/tap-card/free-card.ts` (+ test), `src/lib/tap-card/free-card.server.ts`, `src/routes/card_.join.tsx`, `src/components/tap-card/FreeCardForm.tsx`; Modify `vite.config.ts` allowlist, `src/lib/site/maintenance.ts` (+ `/card/join` is already under `/card` — verify test).

**Interfaces (produces):**
```ts
export function validateFreeCard(i: { name: string; email: string; ageConfirmed: boolean }): Partial<Record<"name" | "email" | "ageConfirmed", string>>;
export function freeCardUrl(plateCode: string | null): string; // "/card/join?plate=CODE" | "/card/join"
export const startFreeCard: ServerFn<{ plateCode: string | null; name: string; email: string; ageConfirmed: boolean; optIn: boolean; website: string },
  { kind: "signed-in"; next: string } | { kind: "need-code"; email: string; next: string } | { kind: "error"; message: string; field?: "name" | "email" | "ageConfirmed" }>;
```
Rules: rate limit `"tapcard-join"`; honeypot → pretend need-code; existing email (`email_lower`) → need-code, nothing written (**Review 2**); else insert holder (`age_confirmed_via:"customer"`, `activated_by_member_id` = plate member), subscriber row if opt-in and plate given, `startHolderSession`, next = `/t/CODE` or `/card`. Page: name, email, 21+, opt-in (only with plate), button "Get my free card"; need-code → `CodeSignIn`-style email code (reuse the component from `TrailJoined.tsx`, export it).
- [ ] Step 1: Tests for `validateFreeCard` and `freeCardUrl`. Steps 2–4. Step 5: commit `feat(tap-card): free loyalty-only Tap Card`.

### Task 4: Plate sign-up screen per member kind

**Files:** Modify `plate.server.ts` (`signed-out` and `ready` views gain `trailStop: boolean`), `PlateScreen.tsx`. Pure helper in `src/lib/tap-card/plate.ts`:
```ts
export type SignedOutButtons = { primary: "join-trail" | "free-card"; secondary: ("join-trail" | "free-card")[] };
export function signedOutButtons(i: { trailStop: boolean; canJoinTrail: boolean }): SignedOutButtons;
```
Trail stop → primary join-trail, secondary [free-card]; non-trail → primary free-card, secondary [join-trail] (omitted when `canJoinTrail` false); trail stop with no pass on sale → primary free-card, secondary []. Copy: "Join the Beer Trail", "Just get the free loyalty card" / "Get your free Tap Card", "Join the Beer Trail"; always "I have a Tap Card: sign in". Ready screen: "Join this year's Beer Trail" link at both kinds when `canJoinTrail`.
- [ ] Step 1: Tests for the three cases. Steps 2–4. Step 5: commit `feat(tap-card): plate sign-up buttons per member kind`.

### Task 5: Upgrade safety — locked email and Move to another card

**Files:** Modify `trail-join.server.ts` (`TrailJoinPage.emailLocked: boolean`, `startTrailJoin` uses the signed-in card's email when signed in, ignoring the typed one), `TrailJoinForm.tsx` (read-only email + "Use this same email on the payment page."), `trail-pass-admin.server.ts` (+ `listPasses({year})` latest 100 with holder name/email/brewery; + `movePassToCard({passId, email})`), `PassesPanel.tsx` (Recent passes table with "Move to another card"). Pure helper in `trail-pass-core.ts`:
```ts
export function emptyCard(c: { visits: number; cards: number; passes: number; earned: number; milestones: number }): boolean; // all zero
```
`movePassToCard`: Guild only; target holder found by email (error "No Tap Card uses that email." otherwise); set pass `holder_id`; if the old holder is now `emptyCard` → delete it (**Review 5**).
- [ ] Step 1: Tests for `emptyCard` (all zero → true; any one non-zero → false). Steps 2–4. Step 5: commit `feat(tap-card): locked email on upgrade; move a pass to another card`.

### Task 6: Card page for loyalty-only customers + walkthrough

**Files:** Modify `src/routes/card.tsx` (when `canJoinTrail` and no pass this trail year: Join box replaces progress, milestones and stops list; visits and waiting rewards stay), `holder-view.ts` (+ `hasTrailPass: boolean` input/view) + test.
- [ ] Step 1: Test: view passes `hasTrailPass` through (default false). Steps 2–4. Step 5: commit.
- [ ] Build, push staging (after Task 2's migration), confirm deploy by behavior. Owner walkthrough: an allied test member (draft) with a plate → free card → visit-1 reward → upgrade to pass at Sample Brewery → trail offer later at the first stop; pass holder at the allied plate sees no Beer Trail offer.
