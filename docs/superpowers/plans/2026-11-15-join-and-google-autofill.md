# Join the Guild + Fill from Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Google-backed profile filler, used by Guild admins on `/admin` Basics ("Fill from Google") and by prospects on a public `/join` flow that creates an Applied roster entry with a ready draft.

**Architecture:** A pure mapper turns a Google Place Details response into profile fields; a thin server client calls Places API (New) with tight field masks. The admin path writes only empty fields into the member's draft. The Join path renders an in-memory preview, then creates an `applied` member (own rows filled), links the email as owner, emails the Guild and the prospect, and sends the prospect to a short `/join/finish` page. Approve on an applicant moves it to Draft; its first publish sends a one-time welcome email.

**Tech Stack:** TanStack Start (React, `createServerFn`) on Cloudflare Workers; Supabase (Postgres, RLS, pgTAP in `supabase/tests`); Vitest; Resend via `sendTransactionalEmail`; Google Places API (New) REST.

**Spec:** `docs/superpowers/specs/2026-11-15-join-and-google-autofill-design.md`

## Global Constraints

- All user-facing text in US English (color, center, canceled).
- Google data never includes images; no Apify, no scraping, no AI text.
- Search calls use field mask exactly `places.id,places.displayName,places.formattedAddress`; only the details call asks for `displayName,addressComponents,formattedAddress,location,nationalPhoneNumber,websiteUri,regularOpeningHours,editorialSummary,businessStatus`.
- Show "Powered by Google" on the `/join` preview and the admin fill panel.
- Admin fill: Guild admins only; writes the draft only; fills only empty fields; sends no email.
- The Join page never reveals whether an email has a login; it always ends on "Check your email".
- Nothing becomes public without a Guild admin: applicants are `status = 'applied'`.
- Public server functions use `CREATOR_UPLOAD_RATE_LIMITER` (5 per 60 s, fails closed) with keys `join-search:<ip>`, `join-submit:<ip>`, plus the existing `isHoneypotTripped`.
- Staging shares the live database: test applicants must be deleted after testing; don't publish test applicants.
- `db push` only with the owner's explicit go-ahead, before any code that reads the new columns is pushed.
- `npm run build` (with placeholder `VITE_*` env for that one command) before every push to staging; don't print or commit keys.
- Member Guide (HTML + PDF) updated before merging to main.

## Review Focus

1. Google returns a place with no `regularOpeningHours` (common for small breweries) → hours stay untouched (admin) / empty (join), no crash. Test in Task 2.
2. A business already on the roster applies again with a slightly different name ("Mars Brewing Co." vs "Mars Brewing Company") → blocked with the contact message, nothing created. Test in Task 5.
3. The same prospect submits twice (double-click or comes back next day) → one roster entry, a fresh link, no second Guild email within the same day. Test in Task 7.
4. Admin presses Fill on a member who already typed some fields → those fields are untouched and listed under "Kept yours". Test in Task 4.
5. A declined applicant or a non-applicant signs in and visits `/join/finish` → sees the "isn't active" or is sent to `/portal`, never an editable form. Test in Task 9.

---

### Task 1: Database columns

**Files:**
- Create: `supabase/migrations/20261119100000_join_applications.sql`
- Create: `supabase/tests/join_applications.test.sql`
- Modify: `src/lib/supabase/types.ts` (`MemberRow`)

**Interfaces:**
- Produces: `members.google_place_id text null`, `members.applied_via_join_at timestamptz null`, `members.join_welcomed_at timestamptz null`, `members.join_details_notified_at timestamptz null`; partial index on `google_place_id` where not null. `MemberRow` gains the four fields (`string | null`).

- [ ] **Step 1: Write pgTAP test** `join_applications.test.sql`: `has_column` for all four; a Guild admin (fixture) can update `google_place_id`; a member owner **cannot** set `applied_via_join_at` or `join_welcomed_at` on their own row (follow the pattern in `live_locks.test.sql`).
- [ ] **Step 2: Run** `npm run test:db` → new file FAILS (columns missing).
- [ ] **Step 3: Write the migration.** Add the columns; extend the existing live-row lock (`20260925210100_lock_live_profile_writes.sql` trigger) so non-admin sessions can't change the three `*_at` columns or `google_place_id`.
- [ ] **Step 4: Run** `npm run test:db` locally → PASS (ignore the known `event_hosts` failures).
- [ ] **Step 5: Update `MemberRow`; run** `npx tsc --noEmit` → no new errors.
- [ ] **Step 6: Commit** `feat(join): member columns for Google place and Join applications`.
- [ ] **Step 7: STOP — ask the owner for the go-ahead to `db push`.** Push, then confirm the columns exist on the hosted DB before any later task is pushed to staging.

### Task 2: Google place → profile mapper (pure)

**Files:**
- Create: `src/lib/google/place-profile.ts`
- Test: `src/lib/google/place-profile.test.ts`

**Interfaces:**
- Consumes: `parsePlaceAddress` from `src/lib/geo/places-address.ts`; `DraftHours` from `src/lib/drafts/sections.ts`.
- Produces:
  ```ts
  export type GooglePlaceDetails = { id: string; displayName?: { text: string }; formattedAddress?: string;
    addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
    location?: { latitude: number; longitude: number }; nationalPhoneNumber?: string; websiteUri?: string;
    regularOpeningHours?: { periods?: { open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number } }[] };
    editorialSummary?: { text: string }; businessStatus?: string };
  export type PlaceProfile = { placeId: string; businessName: string | null; street_address: string | null;
    city: string | null; state: string | null; postal_code: string | null; latitude: number | null;
    longitude: number | null; phone: string | null; website: string | null; tagline: string | null;
    hours: DraftHours[] | null; permanentlyClosed: boolean };
  export function mapPlaceToProfile(place: GooglePlaceDetails): PlaceProfile;
  export function mapOpeningHours(periods: NonNullable<GooglePlaceDetails["regularOpeningHours"]>["periods"]): DraftHours[] | null;
  export const TAGLINE_MAX = 70; // matches validate-patch.ts:151 — export it from there and reuse
  ```

- [ ] **Step 1: Write failing tests:**
  - `maps address via parsePlaceAddress` (Google `location.latitude/longitude` passed as `{lat,lng}`).
  - `mapOpeningHours` — Fri 15:00→Sat 01:00 gives weekday 5 `opens_at "15:00"`, `closes_at "01:00"`, `closes_next_day true`; a weekday with no period → `is_closed true, opens_at null`; always 7 rows sorted 0..6; two periods on one day → earliest open, latest close; `undefined` periods → `null`.
  - `tagline from editorialSummary only when ≤ TAGLINE_MAX`, else `null`.
  - `businessStatus "CLOSED_PERMANENTLY"` → `permanentlyClosed true`.
  - `no regularOpeningHours → hours null` (Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run src/lib/google/place-profile.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Find `TAGLINE_MAX` from the existing tagline validation and export/reuse it rather than inventing a number. Times as `"HH:MM"` to match `hours.opens_at`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `feat(google): map Place Details onto profile fields`.

### Task 3: Places client (server)

**Files:**
- Create: `src/lib/google/places-client.server.ts`
- Test: `src/lib/google/places-client.server.test.ts`

**Interfaces:**
- Consumes: `GooglePlaceDetails` (Task 2); `INLAND_EMPIRE_BIAS` from `places-address.ts`; env `GOOGLE_PLACES_API_KEY` via `import("cloudflare:workers")`.
- Produces:
  ```ts
  export type PlaceCandidate = { placeId: string; name: string; address: string };
  export async function searchPlaces(name: string, city: string, fetchImpl?: typeof fetch): Promise<PlaceCandidate[]>; // ≤ 5
  export async function getPlaceDetails(placeId: string, fetchImpl?: typeof fetch): Promise<GooglePlaceDetails>;
  export const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";
  export const DETAILS_FIELD_MASK = "id,displayName,addressComponents,formattedAddress,location,nationalPhoneNumber,websiteUri,regularOpeningHours,editorialSummary,businessStatus";
  ```

- [ ] **Step 1: Write failing tests** with a fake `fetch`: search POSTs to `https://places.googleapis.com/v1/places:searchText` with header `X-Goog-FieldMask === SEARCH_FIELD_MASK`, body `textQuery "<name> <city>"`, `maxResultCount 5`, `locationBias.circle` from `INLAND_EMPIRE_BIAS`; details GETs `https://places.googleapis.com/v1/places/<id>` with `DETAILS_FIELD_MASK`; non-2xx throws `"Google lookup failed"` without echoing the key; missing key throws `"Google lookup isn't set up"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify the key exists** on both Workers: `npx wrangler secret list` (and for the staging Worker per `project_staging_environment` notes). If missing, give the owner step-by-step instructions to add it and enable Places API (New) and a daily quota cap in Google Cloud. Don't print the key.
- [ ] **Step 6: Commit** `feat(google): Places API (New) search and details client`.

### Task 4: Admin "Fill from Google"

**Files:**
- Create: `src/lib/google/fill-patch.ts`, `src/lib/google/fill-patch.test.ts`
- Create: `src/lib/google/admin-fill.server.ts`
- Create: `src/components/admin/basics/FillFromGooglePanel.tsx`
- Modify: `src/components/admin/BasicsForm.tsx` (render the panel near the identity fields when the viewer is a Guild admin, directly or via Edit as them), `src/routes/admin.basics.tsx` (pass `isGuildAdmin`)

**Interfaces:**
- Consumes: `PlaceProfile`, `mapPlaceToProfile` (Task 2); `searchPlaces`, `getPlaceDetails` (Task 3); `BasicsDraft`, `LinksDraft` (`sections.ts`); `saveDraftSection` semantics (`drafts.server.ts`); `requireMemberSession` (guild-admin check).
- Produces:
  ```ts
  export type FillField = "address" | "phone" | "tagline" | "hours" | "website";
  export type FillPatch = { basics: Partial<BasicsDraft>; links: LinksDraft | null; filled: FillField[]; kept: FillField[] };
  export function computeFillPatch(basics: BasicsDraft, links: LinksDraft, profile: PlaceProfile): FillPatch;
  export const adminSearchPlaces: ServerFn<{ memberId: string; query: string; city: string }, PlaceCandidate[]>;
  export const adminFillFromGoogle: ServerFn<{ memberId: string; placeId: string }, { filled: FillField[]; kept: FillField[]; permanentlyClosed: boolean; dirtySections: DraftSection[] }>;
  ```

- [ ] **Step 1: Write failing `computeFillPatch` tests:**
  - empty draft → all five filled; address block written together (street, city, state, postal_code, latitude, longitude).
  - `street_address` already set → address in `kept`, none of the six address keys in `basics`.
  - draft `hours` non-empty → `hours` kept; Google `hours null` → `hours` neither filled nor kept.
  - existing link `kind "website"` → website kept; otherwise appended `{kind:"website", label:null, url, sort_order: links.length}`.
  - phone / tagline kept when non-empty (Review Focus 4).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `computeFillPatch`.** **Step 4: Run** → PASS.
- [ ] **Step 5: Implement the server fns.** Both refuse unless the session user is a Guild admin (`"Only Guild admins can fill from Google."`). `adminFillFromGoogle`: load the draft bundle, compute the patch, save `basics` then `links` through the same RPC `save_member_draft_section` (skip empty patches), update `members.google_place_id`, return the summary. No email.
- [ ] **Step 6: Build the panel:** "Fill from Google" button → search box prefilled with business name + city → up to 5 results → "That's us" → summary "Filled: … Kept yours: …", warning when `permanentlyClosed`, "Powered by Google" line. Match existing admin styles (design canvas, `docs/design/`).
- [ ] **Step 7: Manual check** on `npm run dev` with a real key, using test member **Sample Brewery** (draft): fill, see fields appear in the form, preview, then discard the draft changes. Don't publish.
- [ ] **Step 8: Commit** `feat(admin): Fill from Google on Basics for Guild admins`.

### Task 5: Already-a-member check (pure + query)

**Files:**
- Create: `src/lib/join/duplicate-check.ts`, `src/lib/join/duplicate-check.test.ts`
- Create: `src/lib/join/duplicate-check.server.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeBusinessName(name: string): string;
  export type RosterCandidate = { id: string; business_name: string; city: string; status: MemberStatus; google_place_id: string | null; applied_via_join_at: string | null };
  export type DuplicateResult = { kind: "none" } | { kind: "existing"; memberId: string } | { kind: "own-application"; memberId: string };
  export function findDuplicate(input: { businessName: string; city: string; placeId: string | null; ownerEmailMatches: (memberId: string) => boolean }, roster: RosterCandidate[]): DuplicateResult;
  export async function loadRosterCandidates(serviceClient: SupabaseClient, city: string, placeId: string | null): Promise<RosterCandidate[]>;
  ```

- [ ] **Step 1: Failing tests:** `normalizeBusinessName("Mars Brewing Co.") === normalizeBusinessName("mars brewing company")`; strips punctuation, "LLC", "Inc", "Co", "Company", "The" prefix, extra spaces; place-id match wins regardless of name/city; city compared case-insensitively; `declined` entries never match; an `applied` + `applied_via_join_at` entry whose owner email matches → `own-application`, otherwise `existing` (Review Focus 2).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** `loadRosterCandidates` selects by `ilike city` or `google_place_id = placeId` with the service-role client. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(join): already-a-member check`.

### Task 6: Email triggers

**Files:**
- Modify: `src/lib/email/build-email-content.ts` (+ test), `src/lib/email/resolve-recipient.server.ts` (+ test)

**Interfaces:**
- Produces four `TransactionalEmailPayload` variants:
  ```ts
  | { trigger: "membership_application"; memberId: string; businessName: string; memberType: MemberType; city: string; email: string }
  | { trigger: "application_details_added"; memberId: string; businessName: string }
  | { trigger: "join_draft_link"; email: string; businessName: string; link: string }
  | { trigger: "application_approved"; memberId: string; businessName: string; email: string; profileUrl: string }
  ```
  Recipients: the first two → `[guildInboxFor(siteUrl)]`; the last two → `[payload.email]`.

- [ ] **Step 1: Failing tests** for subjects and key lines, exact copy:
  - `membership_application`: subject `"[Membership Application] {businessName}"`; lines Business, Type (via `MEMBER_TYPE_EMAIL_LABEL`), City, Email, `Review it: {siteUrl}/guild/roster`.
  - `application_details_added`: subject `"{businessName} added details to their application"`; roster link.
  - `join_draft_link`: subject `"Your Guild profile draft is ready"`; body `"Add your logo, a cover photo and your links, then preview your page: {link}"`, plus "This link works once. To come back later, sign in at {siteUrl}/signin with this email."
  - `application_approved`: subject `"Welcome to the Guild — your page is live"`; body includes `profileUrl` and `"Sign in any time at {siteUrl}/signin with {email}."`
  - Recipient tests for all four.
- [ ] **Step 2: Run** `npx vitest run src/lib/email` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(email): Join application emails`.

### Task 7: Join submit (core + server fn)

**Files:**
- Create: `src/lib/join/submit-join-core.ts`, `src/lib/join/submit-join-core.test.ts`
- Create: `src/lib/join/join.server.ts`
- Create: `src/lib/join/join-validation.ts` (+ test)

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6; `generateUniqueMemberSlug`; `isHoneypotTripped`; invite pattern from `invite-member-core.ts` (create-or-find user, link `owner`, roll back only a newly created user).
- Produces:
  ```ts
  export type JoinInput = { email: string; businessName: string; city: string; memberType: MemberType; placeId: string | null; honeypot: string };
  export type JoinFieldErrors = Partial<Record<"email" | "businessName" | "city" | "memberType", string>>;
  export function validateJoinInput(input: JoinInput): { ok: true; value: JoinInput } | { ok: false; errors: JoinFieldErrors };
  export type JoinDeps = { findDuplicate(...): Promise<DuplicateResult>; getProfile(placeId: string): Promise<PlaceProfile>;
    createApplicant(input: JoinInput, profile: PlaceProfile | null): Promise<string /* memberId */>;
    createOrFindUser(email: string): Promise<{ userId: string; created: boolean }>; linkOwner(memberId: string, userId: string): Promise<void>;
    deleteUser(userId: string): Promise<void>; deleteMember(memberId: string): Promise<void>;
    sendGuildEmail(memberId: string): Promise<void>; sendDraftLink(email: string, businessName: string): Promise<void> };
  export type JoinOutcome = { kind: "check-email" } | { kind: "already-member" };
  export async function submitJoinCore(deps: JoinDeps, input: JoinInput): Promise<JoinOutcome>;
  export const submitJoin: ServerFn<JoinInput, JoinOutcome | { kind: "invalid"; errors: JoinFieldErrors }>;
  export const joinSearchPlaces: ServerFn<{ businessName: string; city: string }, PlaceCandidate[]>;
  ```

- [ ] **Step 1: Failing tests** for `validateJoinInput` (valid email, non-empty name/city, type in producer/mobile/allied; Mobile forces `placeId null`) and `submitJoinCore`:
  - new business → creates applicant, links owner, sends Guild email then draft link, returns `check-email`.
  - `existing` → returns `already-member`, creates and sends nothing.
  - `own-application` → no new member, sends draft link only, returns `check-email` (Review Focus 3).
  - link failure with a newly created user → deletes that user and the member, rethrows; with an existing user → deletes only the member.
  - Guild email failure doesn't block the draft link (logged, still `check-email`).
  - an email that already has a login → still `check-email`, same as a new email (no reveal).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement core.**
- [ ] **Step 4: Implement `join.server.ts`:** rate limit (`join-submit:<ip>`, `join-search:<ip>`, fail closed as in `submit-contact-form.server.ts`); honeypot → return `check-email` silently; re-fetch Google details by `placeId` on the server (never trust browser data); `createApplicant` with the service-role client inserts `members` (`status 'applied'`, `applied_via_join_at now()`, `google_place_id`, slug, name, city, state, address, lat/lng, phone, tagline, `contact_email`), `hours` rows, a `website` link. `sendDraftLink` uses `supabase.auth.admin.generateLink({ type: "magiclink", email })` and emails `${siteUrl}/auth/confirm?token_hash=<hashed_token>&type=magiclink&next=/join/finish` via the `join_draft_link` trigger.
- [ ] **Step 5: Run** core tests → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(join): submit an application`.

### Task 8: `/join` page (step 1 + preview)

**Files:**
- Create: `src/routes/join.tsx`, `src/components/join/JoinForm.tsx`, `src/components/join/JoinPreview.tsx`
- Create: `src/lib/join/join-preview.ts`, `src/lib/join/join-preview.test.ts`
- Create: `src/lib/join/join-preview.server.ts`
- Modify: `src/routes/signin.tsx:301` and `src/routes/contact.tsx` (link "Ask us about joining" / a "Join the Guild" link to `/join`)

**Interfaces:**
- Consumes: `buildProfileObject`-compatible `MemberProfileData` (`profile-object.ts`), `MemberProfileTemplate` with `mediaMode="preview"`; Tasks 2, 3, 7.
- Produces:
  ```ts
  export function buildJoinPreviewProfile(input: { businessName: string; city: string; memberType: MemberType; profile: PlaceProfile | null; siteOrigin: string; now: Date }): MemberProfileData;
  export const getJoinPreview: ServerFn<{ businessName: string; city: string; memberType: MemberType; placeId: string | null }, MemberProfileData>; // rate-limited under join-search
  ```

- [ ] **Step 1: Failing tests for `buildJoinPreviewProfile`:** no photos (`coverAsset null`, `carouselSlides []`, `logoPublicUrl null`, `logoAsset null`); `isPreview true`, other flags false; `events [] , foodSlots []`; hours from profile with synthetic ids; website link present when profile has one; `member.status "applied"`, theme `"amber"`; Mobile with `profile null` renders name + city only.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Build the page.** Steps on one route: form (email, business, city, type radio with labels "Producer", "Mobile", "Affiliate Member", hidden honeypot) → for Producer/Affiliate "Is this you?" list + "Not listed — continue without Google" → preview with banner "This is a preview — nothing is public yet." and "Powered by Google" → "Submit to the Guild" → "Check your email" screen (also shown for `already-member`? No: `already-member` shows "We may already have {business}. Please contact us." with a link to `/contact`). Mobile skips the Google list.
- [ ] **Step 6: Manual check** in dev with a real key: Producer happy path to preview (don't submit on a DB shared with live unless you delete the row afterward), Mobile path, already-member path using an existing member name.
- [ ] **Step 7: Commit** `feat(join): public Join page with instant preview`.

### Task 9: `/join/finish` (step 2) and portal routing

**Files:**
- Modify: `src/lib/portal/portal-destination.ts` (+ its test), `src/lib/portal/portal-session.server.ts` (pass `status`), `src/routes/portal.index.tsx`
- Create: `src/routes/join.finish.tsx`, `src/components/join/FinishForm.tsx`
- Create: `src/lib/join/finish.server.ts`, `src/lib/join/details-notify.ts` (+ test)

**Interfaces:**
- Produces:
  ```ts
  // portal-destination.ts
  export type PortalDestination = { kind: "wizard"; step: WizardStepName } | { kind: "portal" } | { kind: "join-finish" } | { kind: "inactive" };
  export function resolvePortalDestination(input: { typeConfirmedAt: string | null; setupCompletedAt: string | null; role: PortalRole; status: MemberStatus }): PortalDestination;
  // details-notify.ts
  export function shouldNotifyDetails(lastNotifiedAt: string | null, now: Date): boolean; // false within 24 h
  // finish.server.ts
  export const getJoinFinishState: ServerFn<void, { kind: "form"; memberId: string; businessName: string } | { kind: "inactive" } | { kind: "not-applicant" }>;
  export const markApplicationDone: ServerFn<{ memberId: string }, { notified: boolean }>;
  ```

- [ ] **Step 1: Failing tests:** `resolvePortalDestination` → `applied` ⇒ `join-finish`, `declined` ⇒ `inactive` (before any wizard rule), others unchanged; `shouldNotifyDetails(null) true`, 23 h ago false, 25 h ago true.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; `/portal` redirects `join-finish` → `/join/finish`, `inactive` renders "Your application isn't active. Please contact us." with a `/contact` link.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Build `/join/finish`.** Requires sign-in (redirect to `/signin?next=/join/finish`). `getJoinFinishState` uses the portal's chosen member (same session logic as `requirePortalMember`); `not-applicant` → redirect `/portal`; `inactive` → message (Review Focus 5). Form sections reuse existing editors with `memberId`: logo (`uploadMemberLogo`, explain "PNG or WebP, at least 400 pixels tall"), cover (gallery upload + cover crop as in `LogoPhotosCoverSection`), tagline (draft `basics.tagline` via `saveDraftSection`), links (`LinksContactEditor`, or a trimmed copy if it pulls in more than links). "Update preview" opens the draft preview (`loadMemberPreviewData`, as `/portal/preview` does). "I'm done" → `markApplicationDone`: if `shouldNotifyDetails`, stamp `join_details_notified_at` (service role) and send `application_details_added`.
- [ ] **Step 6: Manual check** end to end with a throwaway applicant created in Task 8 (your own test email), then delete it from the roster.
- [ ] **Step 7: Commit** `feat(join): finish page and portal routing for applicants`.

### Task 10: Approve applicants and the welcome email

**Files:**
- Modify: `src/lib/guild/member-admin-actions.server.ts` (`approveMember`), `src/components/guild/RosterTable.tsx`
- Create: `src/lib/join/approval.ts` (+ test), `src/lib/join/welcome.server.ts`
- Modify: `src/lib/drafts/drafts.server.ts` (`publishDraft`)

**Interfaces:**
- Produces:
  ```ts
  export function approvalPatch(status: MemberStatus, userId: string, now: Date): { status: "draft" | "published"; approved_at: string; approved_by_user_id: string };
  export function shouldSendWelcome(m: { status: MemberStatus; applied_via_join_at: string | null; join_welcomed_at: string | null }): boolean;
  export async function sendJoinWelcomeIfDue(memberId: string): Promise<void>; // never throws
  ```

- [ ] **Step 1: Failing tests:** `approvalPatch("applied", …).status === "draft"`; any other status → `"published"` (unchanged behavior); `shouldSendWelcome` true only when `status "published"`, `applied_via_join_at` set and `join_welcomed_at` null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; `approveMember` uses `approvalPatch` and skips the geocode when the result is `draft`.
- [ ] **Step 4: `sendJoinWelcomeIfDue`:** service role; conditional `update members set join_welcomed_at = now() where id = $1 and join_welcomed_at is null and applied_via_join_at is not null and status = 'published' returning slug, business_name` — only when a row comes back, send `application_approved` to the owner's email with `profileUrl = {siteUrl}/members/{slug}` (route `src/routes/members_.$slug.tsx`). Call it at the end of `publishDraft` in try/catch.
- [ ] **Step 5: Roster:** applied rows sort to the top; on applied rows the Approve button's tooltip/label reads "Approve (moves to Draft — then publish from Edit as them)". 
- [ ] **Step 6: Run** `npx vitest run` → PASS (all).
- [ ] **Step 7: Commit** `feat(guild): approve applicants to Draft; welcome email on first publish`.

### Task 11: Ship to staging, guide, cleanup

**Files:**
- Modify: Member Guide HTML + PDF (see `project_member_guide_rebuild` notes: playwright-core + system Chrome), `docs/member-profiles.md` (Join + Fill sections)

- [ ] **Step 1:** `npm test` and `npx tsc --noEmit` → no new failures (known: `src/routes/survey.tsx` tsc error if still present).
- [ ] **Step 2:** `VITE_SUPABASE_URL=https://placeholder.supabase.co VITE_SUPABASE_ANON_KEY=placeholder VITE_GOOGLE_MAPS_API_KEY=placeholder npm run build` → succeeds.
- [ ] **Step 3:** `git fetch` and compare `git log origin/staging..staging` (other sessions/computers), then push `staging` (only with the owner's go-ahead), and confirm the deploy by behavior: `/join` loads on staging.
- [ ] **Step 4:** Owner test on staging: one application with their own spare email, finish page, roster Applied, Approve → Draft. Staging Guild emails go to `STAGING_GUILD_NOTIFICATION_EMAIL`. Then **delete the test applicant** (shared DB).
- [ ] **Step 5:** Update the Member Guide (admin "Fill from Google", applicants on the roster, Approve → Draft) with generic sample screenshots (Sample Brewery, example.com); rebuild the PDF.
- [ ] **Step 6:** Commit `docs: Join the Guild and Fill from Google in the Member Guide`; merging to main waits for the owner's "go".
