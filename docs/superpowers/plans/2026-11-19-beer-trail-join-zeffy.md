# Beer Trail sign-up at the counter (Zeffy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell the yearly Beer Trail Pass through Zeffy from the counter plate, credit the brewery (50% commission), gate trail rewards on a paid pass, collect per-brewery email opt-ins, and print codes under both QR images.

**Architecture:** Pure cores with injected stores (the Tap Card pattern: `*-core.ts` + `*.server.ts`). Zeffy is read through its REST API with the owner's key; a webhook and the return page both call one idempotent recorder, which never trusts a webhook body.

**Tech Stack:** TanStack Start server functions + file routes on Cloudflare Workers, Supabase (service role, RLS on, no policies), Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-11-19-beer-trail-join-zeffy-design.md`

## Global Constraints

- Staging only. Main needs the owner's go. `npm run build` (placeholder VITE_ vars) before every staging push; fetch and compare with origin first.
- `npx supabase db push` only after the owner says "yes"; show `--dry-run` first. Staging shares the live database.
- No email from testing. Never print or commit `ZEFFY_API_KEY` / `ZEFFY_WEBHOOK_SECRET`.
- US spelling. Line endings: use Edit, or Python with `newline=""`.
- Zeffy: base `https://api.zeffy.com/api/v1`, header `Authorization: Bearer <key>`. `GET /payments` filters: `campaign`, `status`, `created[gte]`, `created[lte]`, `limit` (≤100), `starting_after`. Payment fields used: `id, created (unix s), amount (cents), status ("succeeded"), refund_status ("none" | other), campaign_id, buyer.{email,first_name,last_name}, items[].{id, type:"ticket", rate_title, amount, questions[].{type:"name"|"email", answer}}`.
- Commission 50% (stored, not hard-coded). One Zeffy campaign per trail year.
- Routes under `/trail/...` must be `trail_.join.tsx` / `trail_.joined.tsx` (no Outlet in `trail.tsx`).

## Review Focus

1. Customer types a different email on Zeffy than on our join page → account is still created from Zeffy's data, sale is unassigned (Guild assigns), return page offers the email code — never signs in the wrong person.
2. Webhook and return page race on the same payment → exactly one pass row per (payment id, item id); both callers see the same holder.
3. A December purchase of next year's pass does not unlock this year's trail (pass year comes from the campaign, not the purchase date).
4. A refund after the pass was used → trail offer/milestones stop for that year; past visits and loyalty untouched.
5. Someone pays using an existing cardholder's email → no automatic sign-in into that account.

---

### Task 1: Bartender code (8 characters) and codes under both QR images

**Files:**
- Modify: `src/lib/tap-card/staff-qr.ts`, `src/lib/tap-card/card-app.ts`, `src/lib/tap-card/plate.server.ts` (ensurePlate, resetStaffQr, CounterPlate), `src/lib/tap-card/setup-qr.ts`, `src/components/portal/CounterPlateCard.tsx`
- Create: `supabase/migrations/20261123100000_tap_card_staff_qr_code.sql`
- Test: `src/lib/tap-card/staff-qr.test.ts`, `src/lib/tap-card/card-app.test.ts`, `src/lib/tap-card/setup-qr.test.ts`

**Interfaces:**
- Produces: `isStaffQrToken(raw): raw is string` now matches `/^[0-9A-HJKMNP-TV-Z]{8}$/`; `CounterPlate` gains `staffQrPrinted: string` (`formatCardCode(staffQr)`); `qrCaptionLines(kind: "plate" | "bartender", printed: string): [string, string]` in `setup-qr.ts` → `["Counter plate", "ABCD-1234"]` / `["Bartender QR", "ABCD-1234"]`.

- [ ] Step 1: Tests. `isStaffQrToken("ABCD1234")` true; old 43-char token false; lowercase false. `scannedTapCardPath("https://x/s/ABCD1234")` → `"/s/ABCD1234"`; 43-char `/s/` path → null. `qrCaptionLines("bartender","ABCD-1234")` → `["Bartender QR","ABCD-1234"]`.
- [ ] Step 2: `npx vitest run src/lib/tap-card` → those fail.
- [ ] Step 3: Implement. New staff QR = `generateCardCode()` (ensurePlate insert/backfill and resetStaffQr). Migration: drop the old check, `update tap_card_plates set staff_qr = null`, add `check (staff_qr ~ '^[0-9A-HJKMNP-TV-Z]{8}$')` (ensurePlate refills on next portal view). In `CounterPlateCard`, draw each QR onto a canvas 300×360 with the two caption lines centered under it (bold code, 22px) and use that data URL for both the `<img>` and the download; show "Bartender code ABCD-1234" under the bartender QR like the plate.
- [ ] Step 4: Tests pass; `npx tsc --noEmit -p .` clean.
- [ ] Step 5: Ask owner for db push "yes" (dry-run shown), push, commit `feat(tap-card): 8-character bartender code; codes printed under both QR images`.

### Task 2: Pass, sign-up, subscriber and campaign tables

**Files:**
- Create: `supabase/migrations/20261123100100_tap_card_trail_passes.sql`, `supabase/tests/tap_card_trail_passes.test.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces (produces, all server-only, RLS on, no policies):**
- `tap_card_trail_campaigns(year int primary key, zeffy_campaign_id text unique not null, form_url text not null, commission_pct int not null default 50 check (between 0 and 100), created_at)`
- `tap_card_trail_joins(id uuid pk, member_id uuid null → members on delete set null, email text not null, email_lower generated, opt_in bool not null, created_at)`; index `(email_lower, created_at desc)`
- `tap_card_trail_passes(id uuid pk, zeffy_payment_id text not null, zeffy_item_id text not null, unique(zeffy_payment_id, zeffy_item_id), holder_id → tap_card_holders on delete set null, member_id → members on delete set null, year int not null, amount_cents int not null, paid_at timestamptz not null, refunded_at timestamptz null, assigned_by uuid null → auth.users, created_at)`; index `(holder_id, year)`
- `tap_card_member_subscribers(member_id → members on delete cascade, holder_id → tap_card_holders on delete cascade, opted_in_at timestamptz not null, unsubscribed_at timestamptz null, primary key(member_id, holder_id))`

- [ ] Step 1: pgTAP test: tables exist, RLS enabled, duplicate (payment, item) rejected, commission_pct 101 rejected.
- [ ] Step 2: `npm run test:db` → fails (tables missing) — run only after Step 3's push; until then, review the SQL.
- [ ] Step 3: Write migration; owner "yes"; dry-run; push; seed staging campaign row (year 2027, campaign id from the API `GET /campaigns` title "2027 Beer Trail", form_url `https://www.zeffy.com/en-US/ticketing/2027-beer-trail`, 50) — seed only after owner "yes".
- [ ] Step 4: `npm run test:db` passes. Regenerate/extend `types.ts` by hand to match.
- [ ] Step 5: Commit `feat(tap-card): trail pass, sign-up, subscriber and campaign tables`.

### Task 3: Zeffy payment → pass lines (pure)

**Files:** Create `src/lib/tap-card/zeffy.ts`, `src/lib/tap-card/zeffy.test.ts` (fixture with fake values shaped like the real payment above).

**Interfaces (produces):**
```ts
export type ZeffyPayment = { id: string; createdAt: Date; campaignId: string; succeeded: boolean; refunded: boolean;
  buyer: { email: string; name: string }; items: { id: string; amountCents: number; email: string | null; name: string | null }[] };
export function parseZeffyPayment(raw: unknown): ZeffyPayment | null;
export type PassLine = { itemId: string; email: string; name: string; amountCents: number };
export function passLines(p: ZeffyPayment): PassLine[]; // ticket items only; item email/name, else buyer's; email trimmed
```
- [ ] Step 1: Tests: one-item fixture → one line with item answers; two items, second without answers → buyer fallback; `refund_status:"full"` → `refunded:true`; `status:"failed"` → `succeeded:false`; missing `id` → null; name = `first_name + " " + last_name` for buyer, "name" answer for item.
- [ ] Steps 2–4: fail → implement → pass. Step 5: commit `feat(tap-card): read Zeffy payments into pass lines`.

### Task 4: Record a payment (core with injected store)

**Files:** Create `src/lib/tap-card/trail-pass-core.ts`, `trail-pass-core.test.ts`, `trail-pass-store.server.ts`.

**Interfaces:**
- Consumes: `ZeffyPayment`, `passLines` (Task 3).
- Produces:
```ts
export type TrailPassStore = {
  campaignByZeffyId(id: string): Promise<{ year: number } | null>;
  findHolderByEmail(email: string): Promise<{ id: string; createdAt: string } | null>;
  createHolder(h: { name: string; email: string }): Promise<{ id: string }>; // age_confirmed_via 'customer'
  latestJoin(email: string, before: Date): Promise<{ id: string; memberId: string | null; optIn: boolean } | null>;
  insertPass(p: { paymentId: string; itemId: string; holderId: string; memberId: string | null; year: number; amountCents: number; paidAt: Date }): Promise<"ok" | "duplicate">;
  markRefunded(paymentId: string, at: Date): Promise<void>;
  addSubscriber(memberId: string, holderId: string, at: Date): Promise<void>; // upsert, keeps earliest opted_in_at, clears nothing
};
export type RecordedPass = { itemId: string; holderId: string; email: string; holderExisted: boolean; memberId: string | null };
export async function recordZeffyPayment(store: TrailPassStore, p: ZeffyPayment, now: Date): Promise<{ kind: "ignored" } | { kind: "refunded" } | { kind: "recorded"; passes: RecordedPass[] }>;
export async function hasTrailPass(store: { passYears(holderId: string): Promise<number[]> }, holderId: string, year: number): Promise<boolean>;
```
Rules: unknown campaign or not succeeded → ignored. Refunded → `markRefunded`, kind refunded. Otherwise per line: holder found-or-created (`holderExisted` = found **and** `createdAt` < `p.createdAt`); join = `latestJoin(line.email, p.createdAt + 5 min)`; insert pass (duplicate is fine — still returned); if join.optIn and join.memberId → addSubscriber. `hasTrailPass` counts only unrefunded passes for that exact year.
- [ ] Step 1: Tests (fake in-memory store): records one pass credited to the join's brewery; email match is case-insensitive; two lines → two holders, only matching join credited; second call with same payment → no new rows, same holders; wrong campaign → ignored; refunded → pass marked; opt-in false → no subscriber; existing holder → `holderExisted:true`; **Review 3:** pass year 2027 → `hasTrailPass(…, 2026)` false; **Review 4:** refunded pass → `hasTrailPass` false.
- [ ] Steps 2–4. `trail-pass-store.server.ts` implements the store on Supabase (`insertPass` maps unique violation 23505 → "duplicate").
- [ ] Step 5: commit `feat(tap-card): record Zeffy passes and credit the brewery`.

### Task 5: Zeffy client + webhook

**Files:** Create `src/lib/tap-card/zeffy.server.ts`, `src/routes/api.zeffy.webhook.ts`; Test `src/lib/tap-card/zeffy.test.ts` (webhook body id extraction).

**Interfaces (produces):**
```ts
export async function zeffyGetPayment(id: string): Promise<ZeffyPayment | null>; // GET /payments/{id}; if 404 on that path, list ?campaign=…&created[gte]=… and find by id
export async function zeffyPaymentsSince(campaignId: string, since: Date): Promise<ZeffyPayment[]>; // pages via starting_after
export function webhookPaymentId(body: unknown): string | null; // data.id | data.object.id | payment.id | id starting "pay"/any string
export async function recordPaymentById(id: string): Promise<Awaited<ReturnType<typeof recordZeffyPayment>> | null>;
```
Webhook: POST only; read raw text; parse JSON; `webhookPaymentId`; if `ZEFFY_WEBHOOK_SECRET` set and Zeffy's signature header is identified, verify (HMAC-SHA256 of raw body, timing-safe) — otherwise skip (the API re-fetch is the check); `recordPaymentById`; always 200 unless the API call fails (then 500 so Zeffy retries). Log event type + payment id only, never buyer data. First deploy: log header **names** once to identify the signature header (wrangler tail), then remove.
- [ ] Step 1: Tests for `webhookPaymentId` on `{type:"payment.completed",data:{id:"x"}}`, `{data:{object:{id:"x"}}}`, garbage → null.
- [ ] Steps 2–4. Set staging secrets without printing: `[Environment]::GetEnvironmentVariable('ZEFFY_API_KEY','User') | npx wrangler secret put ZEFFY_API_KEY --name <staging worker>` (owner adds `ZEFFY_WEBHOOK_SECRET` as a Windows user variable first, same pattern). Check SITE_ORIGIN survived after.
- [ ] Step 5: commit `feat(tap-card): Zeffy webhook records passes`.

### Task 6: Join from the plate

**Files:** Create `src/lib/tap-card/trail-join.server.ts`, `src/routes/trail_.join.tsx`, `src/components/tap-card/TrailJoinForm.tsx`; Modify `PlateScreen.tsx` (SignedOut + ReadyScreen), `plate.server.ts` (`ready` view gains `hasTrailPass: boolean`), `src/lib/site/maintenance.ts` (+ `/trail/join`, `/trail/joined`), `src/routes/card.tsx` (Join link when no pass).

**Interfaces (produces):**
```ts
export const startTrailJoin: ServerFn<{ plateCode: string | null; email: string; ageConfirmed: boolean; optIn: boolean; website: string },
  { kind: "go"; url: string } | { kind: "error"; message: string }>; // rate-limited "trailjoin"; saves join; sets cookie iebg_trailjoin (join id, 2 h, httpOnly); url = campaign form_url (+ prefill param if Zeffy honors one — builder tests `?email=`)
export function joinPageUrl(plateCode: string | null): string; // "/trail/join" or "/trail/join?plate=CODE"
```
Copy: signed-out plate buttons "Join the Beer Trail" (primary) and "I have a Tap Card: sign in" (secondary, opens today's form). Ready screen without pass: link "Join this year's Beer Trail" under the choices. Join page: brewery name eyebrow when plate given; email; 21+ checkbox (reuse activation wording); unchecked "Let {brewery} email me news and offers." (hidden without plate); button "Continue to payment".
- [ ] Step 1: Tests for `joinPageUrl`, and for a pure `validateTrailJoin` (bad email, missing 21+).
- [ ] Steps 2–4. Step 5: commit `feat(tap-card): join the Beer Trail from the counter plate`.

### Task 7: Back from Zeffy

**Files:** Create `src/routes/trail_.joined.tsx`, `src/components/tap-card/TrailJoined.tsx`; Modify `trail-join.server.ts`, `trail-pass-core.ts` (+ `decideJoinedView`).

**Interfaces:**
```ts
export function decideJoinedView(i: { join: { email: string; memberId: string | null; plateCode: string | null } | null;
  recorded: RecordedPass[] | null }): { kind: "no-join" } | { kind: "waiting" } | { kind: "signed-in"; next: string } | { kind: "need-code"; email: string };
export const finishTrailJoin: ServerFn<void, ReturnType<typeof decideJoinedView>>;
```
`finishTrailJoin`: read cookie → join; `zeffyPaymentsSince(campaign, join.createdAt − 5 min)`; first succeeded payment with a line whose email matches (case-insensitive) → `recordZeffyPayment`. Signed-in only when that line's `holderExisted` is false → `startHolderSession`, next = `/t/{plate}` or `/card`. Existing holder → need-code (UI: send code + `SignInCodeForm`). Not found → waiting; UI retries every 5 s for 60 s, then "We'll email you a sign-in code" button. Clear the cookie once signed in.
- [ ] Step 1: Tests for `decideJoinedView`: no cookie; nothing yet; new holder with plate → `/t/CODE`; without plate → `/card`; **Review 5** existing holder → need-code; **Review 1** recorded lines none matching join email → waiting.
- [ ] Steps 2–4. Step 5: commit `feat(tap-card): finish joining after Zeffy`.

### Task 8: Trail rewards need this year's pass

**Files:** Modify `bar-core.ts` (`BarStore.hasTrailPass(holderId, year)`), `bar-store.server.ts`, `tap-card-store.server.ts` (`awardMilestones` returns [] without a pass), `bar-core.test.ts` fakes, holder card view (trail section shows join link instead of progress when no pass).
- [ ] Step 1: Tests: no pass → `featured` never trail and `useBarReward({kind:"trail"})` → not-available; with pass → unchanged behavior; loyalty steps earned either way.
- [ ] Steps 2–4. Step 5: commit `feat(tap-card): Beer Trail rewards need this year's pass`.

### Task 9: Commission report and subscriber counts

**Files:** Create `src/lib/tap-card/trail-pass-report.ts` (+ test), `src/lib/tap-card/trail-pass-admin.server.ts`, `src/components/guild/tap-card/PassesPanel.tsx`, `src/components/portal/TapCardPassesCard.tsx`; Modify `TapCardTabs.tsx` (tab "Passes"), `TapCardSection.tsx` (card under the plate).

**Interfaces:**
```ts
export type PassRow = { memberId: string | null; amountCents: number; paidAt: string; refundedAt: string | null };
export function monthlyCommission(rows: PassRow[], pct: number): { month: string; memberId: string | null; sold: number; refunded: number; grossCents: number; commissionCents: number }[];
// month "YYYY-MM" Pacific; refunded rows count in `refunded`, not in sold/gross; commission = round(gross*pct/100)
```
Server fns: `getPassReport({year})` (Guild admin: campaign settings, monthly rows with brewery names, unassigned sales), `saveTrailCampaign`, `assignPassToMember({passId, memberId})` (Guild only, sets assigned_by), `getMemberPassSummary({memberId})` (member editor or Guild: own monthly rows + subscriber count; no names/emails).
- [ ] Step 1: `monthlyCommission` tests: 2 sales $20 at 50% → 2000 cents; refunded excluded; Pacific month boundary (2027-02-01T05:00Z counts in January).
- [ ] Steps 2–4. Step 5: commit `feat(tap-card): pass commission report and subscriber counts`.

### Task 10: Staging walkthrough + before-main items

- [ ] Build, push staging, confirm deploy by behavior; owner sets Zeffy redirect (done) and runs: scan plate signed out → Join → Zeffy $0 → back signed in → check in with trail offer; Guild Passes tab shows the sale credited to Sample Brewery.
- [ ] Before main (owner's go): Privacy + Terms text (Zeffy payments, brewery opt-in), `LEGAL.effectiveDate`, Member Guide + PDF, Zeffy redirect switched to live, live Worker secrets, live campaign row.
