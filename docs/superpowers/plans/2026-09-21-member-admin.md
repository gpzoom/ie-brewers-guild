# Member Admin (`/admin`, `/signin`, `/send/[token]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the member-facing admin panel behind Supabase Auth magic-link sign-in — `/admin` (one member's own profile: basics, hours, media/crop, publish gate, phone/desktop layout, theme, events, links/contact, Allied discount), the one shared `/signin` route (magic link, role-based redirect), and the no-auth `/send/[token]` creator-upload page — on top of the schema, RLS, and public-profile contracts the previous three phases already established.

**Architecture:** A session-aware Supabase client (new) sits alongside the two existing anon/service-role server clients, backed by `@supabase/ssr` and per-request cookies via `@tanstack/react-start/server`. `/admin` is a layout route guarded by a shared role-routing helper, with one child route per admin section (basics, hours, media, events, links, theme, discount), each section persisting via its own small `createServerFn` mutations on a field-level autosave model — no page-wide Save button anywhere except the explicit Publish gate. `/send/[token]` and a 15-minute + daily Cloudflare Cron Trigger both run entirely on the service-role client, since neither has a user session. Every pure-logic piece (crop math, EXIF stripping, file-signature checks, ICS parsing/reconciliation, the hours-confirmation three-way distinction, token signing) is a hand-tested module with no I/O.

**Tech Stack:** TanStack Start / TanStack Router (file-based routes, `createServerFn`, `server.handlers`), `@supabase/ssr` (new dependency) alongside the existing `@supabase/supabase-js`, Vitest (existing), `file-type` (new, magic-byte signature detection), `ical.js` (new, ICS parsing), Cloudflare Workers Cron Triggers and the native `ratelimits` binding (new `wrangler.jsonc`/`wrangler.staging.jsonc` config), Web Crypto (`crypto.subtle`, built in — no new dependency) for token hashing and signing.

**Spec:** `docs/member-profiles.md` — "Media model", "Hours and the publish gate", "Logos and assets", "Allied Member discount", "Profile hero and theme" (theme picker), "Events", "Layout and breakpoints" (admin paragraph), "Accounts, sign-in and joining", "Transactional email". Schema: `docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md`. Contracts this plan builds on: `docs/superpowers/plans/2026-09-21-public-member-profile.md`.

## Global Constraints

- One profile template, one admin, switched by `member_type` — never forked per type. (Spec, "Member types".)
- Switching `member_type` must never delete data from a module the new type doesn't render. (Spec, "Member types".) Enforced here by never sending a whole-form payload on save — every mutation patches only the field(s) the member actually touched, so a hidden field's stored value is simply never overwritten.
- A non-guild-admin can never write `members.slug`, `.dues_received_at`, `.approved_at`, `.approved_by_user_id`, `.trail_eligible`, and `.status` can only move between `draft` and `published` — enforced today by the `members_enforce_owner_write_limits` trigger (schema plan, Task 3). This plan's UI must never expose those columns as editable fields, full stop — not "disabled inputs," not present in the DOM at all.
- Gate **publish**, not save. Every field autosaves on change/blur; only the Publish action is behind a confirmation gate. (Spec, "Hours and the publish gate".)
- `hours_confirmed_at` is a timestamp, not a boolean, and `null` means "never asked," never "stale." (Spec, same section.)
- A re-sync of calendar events must reconcile on `(calendar_connection_id, external_event_id)` and must **never** write `overlay_status`, `overlay_starts_at`, `overlay_note`, or `overlay_set_at`. (Spec, "Events"; schema plan Task 8.)
- PNG or SVG only for logos, transparent background, minimum 400px tall (PNG only — see Decisions), reject JPG with an explanatory message, validated by real file signature, never by extension or claimed MIME type. (Spec, "Logos and assets".)
- EXIF/metadata stripped from every uploaded photo, for both `member-media` and `member-logos`. (Spec, same section.)
- Never inline a member-uploaded SVG — always `<img src="...">`. (Spec, same section; carried over from Phase 3's own constraint.)
- Google Calendar OAuth is out of scope for this phase — build ICS-subscription sync and hand entry only. `calendar_connections.provider = 'google'` remains a valid check-constraint value for later; no OAuth flow, no Calendar API calls, no Vault wiring for `google_refresh_token` in this phase's code.
- The Guild Trail (progress strip, visited count) renders nothing in this build. (Spec, "The Guild Trail.")
- 44px minimum on every tap target; real `<button>`/`<a href>`/`<input><label>`; `aria-label` on icon-only controls; 4.5:1 text contrast; `tel:`/`mailto:`/maps-link-out for contact fields. (Spec, "Layout and breakpoints".)
- Mobile-first: the admin's phone layout (tab strip, stacked radios, side-by-side hour fields with Closed on its own line, Publish pinned to the bottom) is built first; the desktop rail adaptation comes after. (Spec, same section.)
- `getSupabaseServerClientForRequest()` (introduced in this plan) is bound to one request's cookies and is **never** memoized or cached at module scope — see Task 2's own warning, restated at that function's definition, for why caching it the way its two siblings are cached is a cross-user account-takeover bug.
- Use the path alias `@/*` → `./src/*`. (Codebase convention, `tsconfig.json`.)
- `cloudflare:workers` env access only resolves reliably inside a `createServerFn` handler or a file route's `server.handlers`, never in a route `loader` and never at bare module scope outside a handler. (Phase 3 constraint, carried over.)

## Decisions made while filling gaps the spec and schema left open

1. **Fallback for a signed-in user with neither a `profiles.is_guild_admin` row nor a `member_users` row:** redirect to `/signin?notice=no-account`, which renders a plain-language banner ("We couldn't find an account for that link — contact the Guild if you think this is a mistake"). This is an edge case the spec doesn't cover explicitly; a silent redirect to the homepage would leave the person with no idea what happened.
2. **Guild-admin-over-member-editor precedence:** if a user somehow has both a `profiles.is_guild_admin = true` row and a `member_users` row, Guild-admin routing wins — they land on `/guild`, not `/admin`. Not stated in the spec; there's no other way to resolve the conflict, and Guild admin is the more powerful role.
3. **A user with multiple `member_users` rows** (editor on more than one business — the schema allows it, the spec's admin description assumes "one member's own profile") uses the first membership found, ordered by `created_at`. A business-switcher UI is a reasonable future addition the spec doesn't describe; out of scope here.
4. **Session-aware Supabase client function is named `getSupabaseServerClientForRequest()`**, lives in `src/lib/supabase/server.ts` alongside the two existing exports, is a plain exported `async function` — deliberately **not** wrapped in `createServerOnlyFn` and **not** memoized. Unlike its two siblings, it depends on `getCookies()`/`setCookie()` from `@tanstack/react-start/server`, which only resolve inside the request-bound `AsyncLocalStorage` context a real request establishes — so an accidental client-side call fails loudly and immediately (a `cloudflare:workers` resolution error) rather than silently misbehaving, which is an acceptable safety margin given the explicit instruction that this function must never be cached. It still reuses the existing `getWorkerEnv()` helper for secrets, which is safe to keep memoized/wrapped since env vars carry no per-user state.
5. **Every admin mutation authenticates via `getSupabaseServerClientForRequest()` (the anon-key, session-bound client) and relies on RLS's existing `is_member_editor()`/`is_guild_admin()` policies for authorization** — never the service-role client. Service-role is reserved for exactly two contexts that have no user session at all: the `/send/[token]` creator-upload endpoint (no auth by design) and the two scheduled Cron Trigger jobs. This is what makes the plumbing impersonation-compatible without building impersonation: a future Guild-admin "Edit as them" session is just another authenticated caller for whom `is_guild_admin()` already grants the same write access via the schema's existing "guild admins can update any row" policies — no mutation function needs to change. Full write-attribution audit logging ("every write is logged against the real actor") needs a new audit table this schema doesn't have; that's flagged here as a real gap for the Guild Admin/impersonation phase to close, not something invented without spec guidance in this one.
6. **The admin's field-level autosave is one `createServerFn` per section, patching only the field(s) that changed**, not one function per keystroke and not one big per-section object save. A text field debounces ~400ms then calls its section's mutation with `{ memberId, patch: { tagline: "..." } }`; a checkbox/select calls it immediately on change. This is also what satisfies the "switching type must never delete other modules' data" constraint above: a hidden field's value is never part of any patch, so it's never touched.
7. **`/admin`'s eight artboard-F/G/H/I/K/M/R sections are separate child routes** (`admin.basics.tsx`, `admin.hours.tsx`, `admin.media.tsx`, `admin.events.tsx`, `admin.links.tsx`, `admin.theme.tsx`, `admin.discount.tsx`) under one `admin.tsx` layout route, rather than client-side tab state on a single page. This matches the codebase's existing flat file-route convention, gives each section its own URL (bookmarkable, browser-back works between tabs), and lets the phone tab strip and desktop rail both be pure navigation — a horizontal scroller of `<Link>`s on phone, a vertical list of the same `<Link>`s on desktop.
8. **Basics (F) vs. Links & contact (R) field placement:** `business_name`, `tagline`, `city`/`state`, the type-specific location field (`street_address`/`service_area`/both for Allied), `lead_time`, `member_since_year`, `timezone`, and the member-type switch live in Basics. `phone` and `contact_email`, plus all of `member_links`, live in Links & Contact — artboard R is literally titled "links **and contact**," and putting phone/email there instead of duplicating them in Basics avoids two editors ever disagreeing about the same column.
9. **EXIF/metadata stripping is a hand-written, dependency-free byte-level stripper** (`src/lib/media/strip-exif.ts`) rather than an image-processing library. Cloudflare Workers' runtime is not Node — most JS image libraries either need Node's `fs`/native bindings or ship as WASM whose Workers-compatibility isn't guaranteed without individually verifying each one. Byte-level JPEG APP1/PNG ancillary-chunk stripping needs nothing but `Uint8Array`, which behaves identically in Workers, Node, and the browser, so there is no compatibility question to verify at all.
10. **File-signature validation uses `file-type`'s `fileTypeFromBuffer()`** (never `fileTypeFromFile`/stream variants, which need Node `fs`) — its docs state explicit browser/Workers support for the buffer-based API, and it only pattern-matches bytes, no filesystem access. SVG has no magic-byte signature at all (it's XML text), so it's validated separately by content-sniffing for a root `<svg>` element, with a reject-on-`<script>` check as defense-in-depth. This is not the deferred full SVG sanitization Phase 3 already decided against for inline rendering — SVGs here are still only ever served via `<img src>`, never inlined; the script-tag check is just cheap insurance at the storage boundary.
11. **The 400px-minimum-height check applies to PNG only.** SVG is vector and has no inherent pixel height — a member's SVG logo intentionally scales to whatever size it's placed at. This is stated explicitly rather than left as a silent gap.
12. **"Scan uploads" (spec) is implemented as: per-token rate limiting (Cloudflare's native `ratelimits` binding), a file-size cap (25MB), and real file-signature validation.** Malware/virus scanning against an external scanning service is explicitly out of scope for this phase, per the task brief — no fake scanner is built to look like one exists.
13. **ICS parsing uses `ical.js`** — a pure-JS RFC 5545 parser with no Node-specific dependencies (originally built for Thunderbird/Lightning), so it runs identically in the Cloudflare Workers runtime.
14. **Rate limiting on `/send/[token]` uses Cloudflare's native `ratelimits` Worker binding** (`wrangler.jsonc`'s `ratelimits` array, keyed by the token's hash), not a hand-rolled KV/D1 counter — it's a first-class Workers primitive that needs no additional infrastructure.
15. **The hours-stale-past-90-days email needs a way to avoid re-sending every cron run.** The frozen schema has no column for this, so this plan adds one narrowly-scoped migration: `members.hours_stale_notice_sent_at timestamptz`. A daily cron sends the notice only when `hours_confirmed_at` is more than 90 days old **and** (`hours_stale_notice_sent_at` is null or older than the current `hours_confirmed_at`) — so exactly one notice fires per staleness episode, and it naturally re-arms the next time the member confirms hours. This column isn't in the trigger's write-guard blocklist, so no trigger change is needed.
16. **The one-click hours-confirmation email link is a stateless, HMAC-signed token** (`src/lib/hours/confirm-token.ts`), not a new database row — "the link itself sets the timestamp, no login" needs no persisted state beyond what's already being confirmed, and a signed token needs no new table.
17. **The email-trigger seam is `src/lib/email/send.ts`, exporting `sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void>`, which throws** with a message naming the trigger and pointing at the next phase, rather than silently succeeding as a no-op. This is a deliberate cross-phase seam, not a placeholder: the spec's five triggers split across three phases (two are Guild Admin's/Contact Form's to *fire*, and this plan only *fires* two of the remaining three — see item 18), and the actual Resend call doesn't exist until the very next phase. A silent no-op would look like working code and isn't; a loud, named failure is honest about what's unimplemented. Call sites wrap it in `try/catch` and log-and-continue, so a creator's upload or a stale-hours cron run still succeeds today even though the email itself doesn't yet.
18. **Of the spec's five transactional-email triggers, exactly two are this phase's to fire:** "Creator uploads to a gallery → the member" (fired from `/send/[token]`'s handler) and "Hours stale past 90 days → the member" (fired from the daily cron). "Member invited → the new member" is Guild Admin's. Both "Contact form submitted" rows are the Contact Form + Resend phase's.
19. **Every admin mutation lives in its own small `.server.ts` file, one file per admin section**, matching the codebase's existing `member-profile.server.ts` naming convention — not one giant `admin.server.ts`.
20. **A "Move back to draft" action is added to the publish gate** beyond what the spec explicitly asks for, since the `members_enforce_owner_write_limits` trigger already permits a `published → draft` transition for a non-guild-admin and the spec's flow otherwise leaves a published member with no way to take their own page temporarily offline.

## File Structure

Pure logic (Vitest, no I/O):
- `src/lib/auth/role-routing.ts` — shared role-routing decision (dependency-injected Supabase client, unit-testable with a fake).
- `src/lib/timezone/timezones.ts` — real IANA zone list via `Intl.supportedValuesOf`.
- `src/lib/members/type-fields.ts` — which basics fields render per `member_type`.
- `src/lib/media/strip-exif.ts` — JPEG APP1/PNG ancillary-chunk metadata stripper.
- `src/lib/media/validate-file.ts` — magic-byte + SVG-sniff validation, PNG height read.
- `src/lib/media/crop-interaction.ts` — pan/zoom/initial-crop math on top of Phase 3's `CropRect`.
- `src/lib/media/upload-tokens.ts` — creator-upload token generation + hashing.
- `src/lib/hours/publish-gate.ts` — the three-way hours-confirmation distinction + appearance-in-the-past check.
- `src/lib/hours/confirm-token.ts` — signed one-click hours-confirmation token.
- `src/lib/events/ics-sync.ts` — ICS parsing by sync tag + overlay-safe upsert row builder.

Data access / mutations (server-only, one `createServerFn` file per admin section):
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/types.ts` — modified (Tasks 1–2).
- `src/lib/auth/require-member-session.server.ts`
- `src/lib/members/member-basics.server.ts`
- `src/lib/hours/hours-editor.server.ts`
- `src/lib/media/media-gallery.server.ts`, `carousel.server.ts`, `cover.server.ts`, `logo.server.ts`, `upload-tokens.server.ts`, `review-tray.server.ts`, `creator-upload.server.ts`
- `src/lib/hours/publish-gate.server.ts`
- `src/lib/theme/member-theme.server.ts`
- `src/lib/events/events.server.ts`, `calendar-connection.server.ts`, `ics-refresh-cron.server.ts`
- `src/lib/hours/hours-stale-cron.server.ts`
- `src/lib/links/member-links.server.ts`
- `src/lib/members/discount.server.ts`
- `src/lib/email/send.ts`

Routes:
- `src/routes/auth.callback.tsx`, `src/routes/signin.tsx`
- `src/routes/admin.tsx` (layout), `admin.index.tsx`, `admin.basics.tsx`, `admin.hours.tsx`, `admin.media.tsx`, `admin.events.tsx`, `admin.links.tsx`, `admin.theme.tsx`, `admin.discount.tsx`
- `src/routes/send.$token.tsx`
- `src/routes/api.confirm-hours.$token.ts`

Presentation (`src/components/admin/`):
- `AdminShell.tsx`, `BasicsForm.tsx`, `HoursEditor.tsx`, `MediaGallery.tsx`, `CropEditor.tsx`, `CarouselEditor.tsx`, `CoverEditor.tsx`, `LogoUploader.tsx`, `CreatorLinkPanel.tsx`, `ReviewTray.tsx`, `PublishGateDialog.tsx`, `ThemePicker.tsx`, `EventsEditor.tsx`, `CalendarConnectionPanel.tsx`, `LinksContactEditor.tsx`, `DiscountEditor.tsx`.

Existing files modified: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/types.ts`, `src/components/site/Footer.tsx`, `src/server.ts`, `wrangler.jsonc`, `wrangler.staging.jsonc`, `package.json`.

---
### Task 1: Extend Supabase row types for admin use

**Files:**
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `ProfileRow`, `MemberUserRow`, `CalendarConnectionRow`, `UploadTokenRow`, `MemberCategoryRow`; extends `MediaAssetRow` (adds `original_filename`, `byte_size`, `source`, `uploaded_by_user_id`, `upload_token_id`, `creator_name`, `creator_credit`, `permission_accepted_at`, `created_at`) and `EventRow` (adds `calendar_connection_id`, `source`, `external_event_id`, `overlay_set_at`); extends `MemberRow` (adds `hours_stale_notice_sent_at`, added by Task 28's migration).
- Consumes: nothing new — this is the same hand-written-types file Phase 3 created, extended rather than duplicated.

Every later admin task imports its row shapes from here. This task has no test — it's type declarations only, matching Phase 3's own "no test" treatment of this file.

- [ ] **Step 1: Add the new row types and extend the existing ones**

Open `src/lib/supabase/types.ts`. Replace the existing `MediaAssetRow` definition with:

```ts
export type MediaAssetRow = {
  id: string;
  member_id: string;
  storage_path: string;
  kind: "image" | "video";
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  original_filename: string | null;
  source: "member_upload" | "creator_upload";
  uploaded_by_user_id: string | null;
  upload_token_id: string | null;
  creator_name: string | null;
  creator_credit: boolean;
  permission_accepted_at: string | null;
  review_status: "pending" | "approved" | "rejected";
  created_at: string;
};
```

Replace the existing `EventRow` definition with:

```ts
export type EventRow = {
  id: string;
  member_id: string;
  calendar_connection_id: string | null;
  source: "google" | "ics" | "manual";
  external_event_id: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  city: string | null;
  address: string | null;
  overlay_status: EventOverlayStatus | null;
  overlay_starts_at: string | null;
  overlay_note: string | null;
  overlay_set_at: string | null;
  is_hidden: boolean;
};
```

Add `hours_stale_notice_sent_at: string | null;` as a new field on `MemberRow` (anywhere after `hours_confirmed_at`).

Append these new types at the end of the file:

```ts
export type ProfileRow = {
  id: string;
  is_guild_admin: boolean;
};

export type MemberUserRow = {
  id: string;
  member_id: string;
  user_id: string;
  role: "owner" | "editor";
  created_at: string;
};

export type CalendarConnectionRow = {
  id: string;
  member_id: string;
  provider: "google" | "ics";
  google_calendar_id: string | null;
  ics_url: string | null;
  sync_tag: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  sync_status: "ok" | "failing" | "disconnected";
};

export type UploadTokenRow = {
  id: string;
  member_id: string;
  token_hash: string;
  created_by_user_id: string;
  expires_at: string;
  max_files: number;
  used_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type MemberCategoryRow = {
  id: string;
  member_id: string;
  category_id: string;
};
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors. (If Phase 3's own files aren't literally present in this checkout yet, this step instead confirms the file is syntactically valid TypeScript in isolation — don't block on pre-existing unrelated errors.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: extend Supabase row types for the member admin panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Session-aware Supabase client (browser + server) — the critical-path task

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `package.json` (add `@supabase/ssr`)

**Interfaces:**
- Produces: `getSupabaseBrowserClient()` — same name/signature as Phase 3, now `createBrowserClient`-backed. `getSupabaseServerClientForRequest()` — **new**, session-aware, per-request, never memoized. `getSupabaseServerClient()`/`getSupabaseServiceRoleClient()` — unchanged from Phase 3.
- Consumes: `@supabase/ssr`'s `createBrowserClient`/`createServerClient`; `@tanstack/react-start/server`'s `getCookies`/`setCookie`.

This is the task the whole phase's auth depends on, and the one place a memoization mistake becomes a cross-user account-takeover bug — read Decision 4 above before touching this file.

- [ ] **Step 1: Install `@supabase/ssr`**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: Rewrite the browser client to be session-aware**

Replace the contents of `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side, session-aware Supabase client. Same exported name and
 * signature as Phase 3 left it — every existing caller keeps working
 * unchanged — but now backed by createBrowserClient (from @supabase/ssr)
 * instead of a bare anon-key createClient with persistSession: false. This
 * is what lets the browser track a signed-in session via cookies at all;
 * Phase 3 had no auth, so it didn't need to.
 *
 * Safe to memoize as a module-level singleton, UNLIKE the new per-request
 * server client in server.ts: there is exactly one browser session per
 * page load in this JS runtime, so there is no cross-user leak risk here.
 * That risk is specific to a single Worker isolate serving many different
 * users' requests over its lifetime, which simply doesn't describe a
 * browser tab.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set both in .env locally and as " +
        "Cloudflare Workers Builds build variables in production/staging.",
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
```

- [ ] **Step 3: Add the session-aware server client, alongside the existing two**

Open `src/lib/supabase/server.ts`. Add these imports at the top, alongside the existing ones:

```ts
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";
```

Append this function at the end of the file (after `getSupabaseServiceRoleClient`):

```ts
/**
 * Session-aware, per-request Supabase server client. getSupabaseServerClient()
 * above is anon-key-only and carries no user session at all (Phase 3 had no
 * auth); this is the client every admin route and mutation uses instead, so
 * RLS's is_member_editor()/is_guild_admin() policies see the real signed-in
 * user.
 *
 * Bound to getCookies()/setCookie() from @tanstack/react-start/server,
 * which read/write the current request's cookies via an AsyncLocalStorage-held
 * h3 event — that context only exists while a real request is in flight, so
 * this must only ever be called from inside a createServerFn handler or a
 * file route's server.handlers, never from a route loader or module scope.
 * Uses getAll/setAll, never a single-cookie get/set adapter, because
 * Supabase chunks large session JWTs across multiple cookies and a
 * single-cookie adapter silently drops the overflow chunks.
 *
 * CRITICAL — read before "cleaning this up": this function is deliberately
 * a plain async function, NOT wrapped in createServerOnlyFn and NOT
 * memoized, unlike getSupabaseServerClient/getSupabaseServiceRoleClient
 * above. Those two are safe to cache at module scope because the anon key
 * carries no per-user state — the same cached client is correct for every
 * request. This client is bound to ONE request's cookies. If it were cached
 * the same way, the FIRST request's signed-in session would leak into every
 * later request this Worker isolate happens to handle for its lifetime —
 * a severe cross-user account-takeover bug, not a theoretical one. Call
 * this fresh, every single time, and never store its return value anywhere
 * that outlives the request that created it.
 */
export async function getSupabaseServerClientForRequest() {
  const env = await getWorkerEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the Worker environment.");
  }

  return createServerClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value: value ?? "" }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          setCookie(name, value, options as Parameters<typeof setCookie>[2]);
        }
      },
    },
  });
}
```

- [ ] **Step 4: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Manually verify no memoization was introduced**

```bash
grep -n "getSupabaseServerClientForRequest" -A 3 src/lib/supabase/server.ts | grep -i "let \|cache\|=== undefined"
```

Expected: no output. If this prints anything, a caching variable was added by mistake — remove it before committing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/client.ts src/lib/supabase/server.ts package.json package-lock.json
git commit -m "feat: make the Supabase clients session-aware via @supabase/ssr

Adds getSupabaseServerClientForRequest(), a per-request, never-memoized
client bound to the current request's cookies -- see the warning at its
definition before changing how it's cached.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Shared role-routing helper (TDD)

**Files:**
- Create: `src/lib/auth/role-routing.ts`
- Create: `src/lib/auth/role-routing.test.ts`

**Interfaces:**
- Produces: `RoleRoutingResult` and `resolveUserRoleAndTarget(supabase, userId)`. Consumed by `/auth/callback` (Task 5) and the `/admin` auth guard (Task 4) — both call this exact function rather than reimplementing the role check.
- Consumes: a Supabase client with an active session (either kind, injected as a parameter — this is what makes the function unit-testable without a real database).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/role-routing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserRoleAndTarget } from "./role-routing";

function fakeSupabase(responses: {
  profile: { is_guild_admin: boolean } | null;
  memberUser: { member_id: string } | null;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: responses.profile, error: null }) }) }) };
      }
      if (table === "member_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: responses.memberUser, error: null }) }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("resolveUserRoleAndTarget", () => {
  it("routes a guild admin to /guild, even if they also have a member_users row", async () => {
    const supabase = fakeSupabase({ profile: { is_guild_admin: true }, memberUser: { member_id: "m1" } });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({ role: "guild_admin", redirectTo: "/guild" });
  });

  it("routes a member editor to /admin with their member_id", async () => {
    const supabase = fakeSupabase({ profile: null, memberUser: { member_id: "m1" } });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({
      role: "member_editor",
      memberId: "m1",
      redirectTo: "/admin",
    });
  });

  it("treats is_guild_admin: false the same as no profiles row", async () => {
    const supabase = fakeSupabase({ profile: { is_guild_admin: false }, memberUser: { member_id: "m1" } });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({
      role: "member_editor",
      memberId: "m1",
      redirectTo: "/admin",
    });
  });

  it("falls back to /signin when the user has neither role", async () => {
    const supabase = fakeSupabase({ profile: null, memberUser: null });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({ role: "none", redirectTo: "/signin" });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- role-routing
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/auth/role-routing.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type RoleRoutingResult =
  | { role: "guild_admin"; redirectTo: "/guild" }
  | { role: "member_editor"; memberId: string; redirectTo: "/admin" }
  | { role: "none"; redirectTo: "/signin" };

/**
 * The one place "where does this signed-in user land" is decided (spec:
 * "The magic link routes by role, not by URL"). /auth/callback and the
 * /admin route's own auth guard both call this rather than reimplementing
 * the check a second way.
 *
 * Precedence: if a user has both a profiles.is_guild_admin row and a
 * member_users row, Guild-admin routing wins (this plan's Decision 2 --
 * the spec doesn't state this explicitly).
 */
export async function resolveUserRoleAndTarget(
  supabase: SupabaseClient,
  userId: string,
): Promise<RoleRoutingResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_guild_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_guild_admin) {
    return { role: "guild_admin", redirectTo: "/guild" };
  }

  const { data: memberUser } = await supabase
    .from("member_users")
    .select("member_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberUser?.member_id) {
    return { role: "member_editor", memberId: memberUser.member_id, redirectTo: "/admin" };
  }

  return { role: "none", redirectTo: "/signin" };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- role-routing
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/role-routing.ts src/lib/auth/role-routing.test.ts
git commit -m "feat: add the shared role-routing helper for magic-link sign-in

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 4: Auth guard + `/admin` layout route + mobile-first shell

**Files:**
- Create: `src/lib/auth/require-member-session.server.ts`
- Create: `src/routes/admin.tsx`
- Create: `src/routes/admin.index.tsx`
- Create: `src/components/admin/AdminShell.tsx`

**Interfaces:**
- Produces: `requireMemberSession()` (a `createServerFn`, throws `redirect()` or returns `{ memberId, userId }`), `<AdminShell>` (nav + pinned Publish slot, mobile tab strip only — the desktop rail is Task 32).
- Consumes: `getSupabaseServerClientForRequest` (Task 2), `resolveUserRoleAndTarget` (Task 3).

- [ ] **Step 1: Implement the auth guard**

Create `src/lib/auth/require-member-session.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

/**
 * Runs once, in /admin's own beforeLoad, and is inherited by every child
 * route under it. Redirects to /signin if there's no session, to /guild if
 * the signed-in user is a Guild admin rather than a member editor (reusing
 * resolveUserRoleAndTarget rather than re-checking is_guild_admin a second
 * way), and to /signin?notice=no-account for the "neither role" edge case
 * (this plan's Decision 1).
 */
export const requireMemberSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ memberId: string; userId: string }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      throw redirect({ href: "/signin" });
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);

    if (routing.role === "guild_admin") {
      throw redirect({ href: "/guild" });
    }
    if (routing.role === "none") {
      throw redirect({ href: "/signin?notice=no-account" });
    }

    return { memberId: routing.memberId, userId: user.id };
  },
);
```

- [ ] **Step 2: Implement the admin layout route**

Create `src/routes/admin.tsx`:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await requireMemberSession();
    return { memberId: session.memberId, userId: session.userId };
  },
  head: () => ({ meta: [{ title: "Member admin — IE Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { memberId } = Route.useRouteContext();
  return (
    <AdminShell memberId={memberId}>
      <Outlet />
    </AdminShell>
  );
}
```

- [ ] **Step 3: Implement the index redirect**

Create `src/routes/admin.index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ href: "/admin/basics" });
  },
});
```

- [ ] **Step 4: Implement the mobile-first shell**

Create `src/components/admin/AdminShell.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/admin/basics", label: "Basics" },
  { to: "/admin/hours", label: "Hours" },
  { to: "/admin/media", label: "Media" },
  { to: "/admin/events", label: "Events" },
  { to: "/admin/links", label: "Links & contact" },
  { to: "/admin/theme", label: "Theme" },
  { to: "/admin/discount", label: "Discount" },
] as const;

/**
 * Mobile-first admin shell (spec, "Layout and breakpoints": "the admin
 * panel ships with phone and desktop layouts together, not desktop
 * first... on a phone the left rail becomes a horizontal tab strip... and
 * Publish pins to the bottom of the screen"). This task builds ONLY the
 * phone behavior -- every class below applies at every width until Task 32
 * adds the md: breakpoint overrides that turn the top strip into a left
 * rail and un-pin the Publish bar, per the spec's own stated build order.
 *
 * The Publish button itself is rendered by PublishGateDialog (Task 23),
 * passed in as `publishSlot` so this shell doesn't need to know about
 * publish-gate logic.
 */
export function AdminShell({
  memberId,
  publishSlot,
  children,
}: {
  memberId: string;
  publishSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col pb-24">
      <nav
        aria-label="Admin sections"
        className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted [&.active]:bg-primary/10 [&.active]:text-primary"
            activeProps={{ className: "active" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 px-4 py-6" data-member-id={memberId}>
        {children}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-3">
        {publishSlot}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify the dev server starts and the guard redirects correctly**

```bash
npm run dev
```

Visit `http://localhost:8080/admin` while signed out. Expected: redirected to `/signin`. (Full sign-in flow isn't wired until Tasks 5–6; for now, confirm the redirect happens rather than a crash or a blank page.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/require-member-session.server.ts src/routes/admin.tsx src/routes/admin.index.tsx src/components/admin/AdminShell.tsx
git commit -m "feat: add the /admin auth guard and mobile-first shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `/auth/callback` route

**Files:**
- Create: `src/routes/auth.callback.tsx`

**Interfaces:**
- Produces: the magic-link landing route.
- Consumes: `getSupabaseServerClientForRequest` (Task 2), `resolveUserRoleAndTarget` (Task 3).

- [ ] **Step 1: Implement the route**

Create `src/routes/auth.callback.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

/**
 * The magic-link landing page. A real request/response cycle (server.handlers,
 * not createServerFn) is needed here because exchangeCodeForSession must set
 * cookies on the actual response before the redirect happens.
 */
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const supabase = await getSupabaseServerClientForRequest();

        if (!code) {
          throw redirect({ href: "/signin?notice=missing-code" });
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) {
          throw redirect({ href: "/signin?notice=invalid-link" });
        }

        const routing = await resolveUserRoleAndTarget(supabase, data.user.id);
        throw redirect({ href: routing.redirectTo });
      },
    },
  },
});
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors. If the installed `@tanstack/react-router`/`@tanstack/react-start` version's `server.handlers` shape has changed since this plan was written, adjust the handler signature to match the actual generated types rather than fighting the type checker — the shape confirmed at plan-writing time is `{ server: { handlers: { GET: (ctx: { request: Request; ... }) => Promise<Response> } } }`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/auth.callback.tsx
git commit -m "feat: add the /auth/callback magic-link landing route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `/signin` route + footer link

**Files:**
- Create: `src/routes/signin.tsx`
- Modify: `src/components/site/Footer.tsx`

**Interfaces:**
- Produces: the one shared sign-in form the spec requires ("A single Member sign in link in the site footer... Not in the header").
- Consumes: `getSupabaseBrowserClient` (Task 2).

- [ ] **Step 1: Implement the sign-in route**

Create `src/routes/signin.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NOTICE_MESSAGES: Record<string, string> = {
  "no-account": "We couldn't find a member or Guild admin account for that sign-in link. Contact the Guild if you think this is a mistake.",
  "invalid-link": "That sign-in link is invalid or has expired. Request a new one below.",
  "missing-code": "That sign-in link is missing its code. Request a new one below.",
};

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>) => ({
    notice: typeof search.notice === "string" ? search.notice : undefined,
  }),
  head: () => ({ meta: [{ title: "Member sign in — IE Brewers Guild" }] }),
  component: SignInPage,
});

function SignInPage() {
  const { notice } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  };

  return (
    <section className="mx-auto max-w-md px-4 py-24">
      <h1 className="font-display text-3xl text-foreground">Member sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the email your Guild membership is registered under. We'll send you a one-click sign-in
        link — no password needed.
      </p>

      {notice && NOTICE_MESSAGES[notice] && (
        <p role="alert" className="mt-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-foreground">
          {NOTICE_MESSAGES[notice]}
        </p>
      )}

      {status === "sent" ? (
        <p role="status" className="mt-6 rounded-md border border-open/40 bg-open/10 p-3 text-sm text-foreground">
          Check your email for a sign-in link. It's good for a little while, then you'll need a fresh one.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="signin-email">Email address</Label>
            <Input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          {status === "error" && errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}
          <Button type="submit" disabled={status === "sending"} className="h-11 w-full">
            {status === "sending" ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add the footer link**

In `src/components/site/Footer.tsx`, find the closing copyright bar:

```tsx
      <div className="border-t border-border/60 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} IE Brewers Guild. All rights reserved.
      </div>
```

Replace it with:

```tsx
      <div className="flex flex-col items-center justify-between gap-2 border-t border-border/60 py-5 text-center text-xs text-muted-foreground sm:flex-row sm:px-6">
        <span>© {new Date().getFullYear()} IE Brewers Guild. All rights reserved.</span>
        <Link to="/signin" className="min-h-11 py-2 hover:text-primary">
          Member sign in
        </Link>
      </div>
```

(`Link` is already imported at the top of this file.) This is deliberately the only "sign in" link anywhere on the public site — not in `Header.tsx` — per the spec's own reasoning: two dozen members against thousands of visitors, and a header sign-in button tells every visitor they ought to have an account.

- [ ] **Step 3: Verify manually**

```bash
npm run dev
```

Visit `http://localhost:8080/`, scroll to the footer, confirm "Member sign in" is present and links to `/signin`. Visit `/signin` directly and confirm the form renders. Submitting requires a real Supabase project to observe the email; for this task, confirming the form renders and the button is disabled while `status === "sending"` is sufficient.

- [ ] **Step 4: Commit**

```bash
git add src/routes/signin.tsx src/components/site/Footer.tsx
git commit -m "feat: add /signin and the footer's Member sign in link

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 7: IANA timezone module (TDD)

**Files:**
- Create: `src/lib/timezone/timezones.ts`
- Create: `src/lib/timezone/timezones.test.ts`

**Interfaces:**
- Produces: `listIanaTimezones()`, `isValidIanaTimezone(value)`. Consumed by `BasicsForm.tsx` (Task 9).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/timezone/timezones.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isValidIanaTimezone, listIanaTimezones } from "./timezones";

describe("listIanaTimezones", () => {
  it("includes the schema's default timezone", () => {
    expect(listIanaTimezones()).toContain("America/Los_Angeles");
  });

  it("returns a large list with no duplicates", () => {
    const zones = listIanaTimezones();
    expect(zones.length).toBeGreaterThan(300);
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe("isValidIanaTimezone", () => {
  it("accepts a real zone", () => {
    expect(isValidIanaTimezone("America/Los_Angeles")).toBe(true);
  });

  it("rejects a made-up zone", () => {
    expect(isValidIanaTimezone("Mars/OlympusMons")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- timezones
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/timezone/timezones.ts`:

```ts
/**
 * Real IANA timezone list, sourced from the JS engine's own tz database via
 * Intl.supportedValuesOf -- never hardcode a static list, since the set of
 * valid IANA zone names changes over time. Standard ECMA-402, available
 * identically in the Cloudflare Workers runtime, Node, and every browser
 * this admin panel targets.
 */
export function listIanaTimezones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

export function isValidIanaTimezone(value: string): boolean {
  return listIanaTimezones().includes(value);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- timezones
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timezone/timezones.ts src/lib/timezone/timezones.test.ts
git commit -m "feat: add the real IANA timezone list for the basics editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Member-type field-visibility module (TDD)

**Files:**
- Create: `src/lib/members/type-fields.ts`
- Create: `src/lib/members/type-fields.test.ts`

**Interfaces:**
- Produces: `MemberFieldKey`, `visibleFieldsForMemberType(memberType)`, `isFieldVisibleForMemberType(memberType, field)`, `LOCATION_FIELD_LABEL`. Consumed by `BasicsForm.tsx` (Task 9) and `DiscountEditor.tsx` (Task 31).
- Consumes: `MemberType` from `src/lib/supabase/types.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/members/type-fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL, visibleFieldsForMemberType } from "./type-fields";

describe("visibleFieldsForMemberType", () => {
  it("a producer only shows street_address", () => {
    expect(visibleFieldsForMemberType("producer")).toEqual(["street_address"]);
  });

  it("a mobile member only shows service_area", () => {
    expect(visibleFieldsForMemberType("mobile")).toEqual(["service_area"]);
  });

  it("an allied member shows the full set, including discount", () => {
    expect(visibleFieldsForMemberType("allied")).toEqual([
      "street_address",
      "service_area",
      "lead_time",
      "contact_email",
      "discount",
    ]);
  });
});

describe("isFieldVisibleForMemberType", () => {
  it("service_area is not visible for a producer", () => {
    expect(isFieldVisibleForMemberType("producer", "service_area")).toBe(false);
  });

  it("discount is only visible for allied", () => {
    expect(isFieldVisibleForMemberType("producer", "discount")).toBe(false);
    expect(isFieldVisibleForMemberType("mobile", "discount")).toBe(false);
    expect(isFieldVisibleForMemberType("allied", "discount")).toBe(true);
  });
});

describe("LOCATION_FIELD_LABEL", () => {
  it("labels each type's location field per the spec's comparison table", () => {
    expect(LOCATION_FIELD_LABEL.producer).toBe("Street address");
    expect(LOCATION_FIELD_LABEL.mobile).toBe("Service area");
    expect(LOCATION_FIELD_LABEL.allied).toBe("Warehouse address");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- type-fields
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/members/type-fields.ts`:

```ts
import type { MemberType } from "@/lib/supabase/types";

export type MemberFieldKey = "street_address" | "service_area" | "lead_time" | "contact_email" | "discount";

const FIELDS_BY_TYPE: Record<MemberType, MemberFieldKey[]> = {
  producer: ["street_address"],
  mobile: ["service_area"],
  allied: ["street_address", "service_area", "lead_time", "contact_email", "discount"],
};

/**
 * Which type-specific fields render for a given member_type (spec, "Member
 * types" comparison table). This controls what's SHOWN only -- the mutation
 * layer (member-basics.server.ts) never nulls out a hidden field on a type
 * switch, only on an explicit edit of that field itself, which is what
 * actually satisfies "switching type must never delete data."
 */
export function visibleFieldsForMemberType(memberType: MemberType): MemberFieldKey[] {
  return FIELDS_BY_TYPE[memberType];
}

export function isFieldVisibleForMemberType(memberType: MemberType, field: MemberFieldKey): boolean {
  return FIELDS_BY_TYPE[memberType].includes(field);
}

export const LOCATION_FIELD_LABEL: Record<MemberType, string> = {
  producer: "Street address",
  mobile: "Service area",
  allied: "Warehouse address",
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- type-fields
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/members/type-fields.ts src/lib/members/type-fields.test.ts
git commit -m "feat: add member-type field-visibility rules for the basics editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Basics editor (artboard F — identity, location, type)

**Files:**
- Create: `src/lib/members/member-basics.server.ts`
- Create: `src/routes/admin.basics.tsx`
- Create: `src/components/admin/BasicsForm.tsx`

**Interfaces:**
- Produces: `updateMemberBasics(input: { memberId: string; patch: Partial<BasicsPatch> })`, a `createServerFn`. `BasicsPatch` covers `business_name`, `tagline`, `city`, `state`, `street_address`, `service_area`, `lead_time`, `member_since_year`, `timezone`, `member_type`.
- Consumes: `getSupabaseServerClientForRequest` (Task 2), `visibleFieldsForMemberType`/`LOCATION_FIELD_LABEL` (Task 8), `listIanaTimezones` (Task 7), `MemberRow`/`MemberType` (Task 1).

- [ ] **Step 1: Implement the mutation**

Create `src/lib/members/member-basics.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

export type BasicsPatch = Partial<
  Pick<
    MemberRow,
    | "business_name"
    | "tagline"
    | "city"
    | "state"
    | "street_address"
    | "service_area"
    | "lead_time"
    | "member_since_year"
    | "timezone"
    | "member_type"
  >
>;

/**
 * One mutation for the whole Basics section, called with only the field(s)
 * the member actually changed (this plan's Decision 6 -- the field-level
 * autosave model). tagline's 70-char cap is enforced here as well as
 * client-side, since the DB check constraint alone would only surface as an
 * opaque Postgres error.
 */
export const updateMemberBasics = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: BasicsPatch }) => data)
  .handler(async ({ data }) => {
    if (typeof data.patch.tagline === "string" && data.patch.tagline.length > 70) {
      throw new Error("Tagline must be 70 characters or fewer.");
    }
    if (
      data.patch.member_type &&
      !(["producer", "mobile", "allied"] as MemberType[]).includes(data.patch.member_type)
    ) {
      throw new Error("Invalid member type.");
    }

    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update(data.patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getMemberBasics = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as MemberRow;
  });
```

- [ ] **Step 2: Implement the route and form**

Create `src/routes/admin.basics.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { BasicsForm } from "@/components/admin/BasicsForm";

export const Route = createFileRoute("/admin/basics")({
  loader: async ({ context }) => getMemberBasics({ data: { memberId: context.memberId } }),
  component: BasicsRoute,
});

function BasicsRoute() {
  const member = Route.useLoaderData();
  return <BasicsForm member={member} />;
}
```

Create `src/components/admin/BasicsForm.tsx`:

```tsx
import { useState } from "react";
import { updateMemberBasics } from "@/lib/members/member-basics.server";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import { listIanaTimezones } from "@/lib/timezone/timezones";
import type { MemberRow, MemberType } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMEZONES = listIanaTimezones();

/**
 * Every field here autosaves via its own small patch (onBlur for text
 * fields, onValueChange for the radio/select), never a whole-form submit --
 * that's what keeps a member-type switch from ever clobbering a hidden
 * field's stored value (this plan's Decision 6 and Global Constraint 2).
 */
export function BasicsForm({ member }: { member: MemberRow }) {
  const [local, setLocal] = useState(member);

  function save(patch: Parameters<typeof updateMemberBasics>[0]["data"]["patch"]) {
    setLocal((prev) => ({ ...prev, ...patch }));
    void updateMemberBasics({ data: { memberId: member.id, patch } });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Label htmlFor="business_name">Business name</Label>
        <Input
          id="business_name"
          defaultValue={local.business_name}
          className="mt-1 h-11"
          onBlur={(e) => save({ business_name: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="tagline">Tagline</Label>
        <Textarea
          id="tagline"
          defaultValue={local.tagline ?? ""}
          maxLength={70}
          className="mt-1"
          onBlur={(e) => save({ tagline: e.target.value || null })}
        />
        <p className="mt-1 text-xs text-muted-foreground">Up to 70 characters — the one place you speak in your own words.</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Member type</legend>
        <RadioGroup
          defaultValue={local.member_type}
          className="mt-2 flex flex-col gap-2"
          onValueChange={(value) => save({ member_type: value as MemberType })}
        >
          {(["producer", "mobile", "allied"] as MemberType[]).map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2 rounded-md border border-border p-3">
              <RadioGroupItem value={type} id={`member_type_${type}`} />
              <span className="capitalize">{type}</span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" defaultValue={local.city} className="mt-1 h-11" onBlur={(e) => save({ city: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" defaultValue={local.state} className="mt-1 h-11" onBlur={(e) => save({ state: e.target.value })} />
        </div>
      </div>

      {isFieldVisibleForMemberType(local.member_type, "street_address") && (
        <div>
          <Label htmlFor="street_address">{LOCATION_FIELD_LABEL[local.member_type]}</Label>
          <Input
            id="street_address"
            defaultValue={local.street_address ?? ""}
            className="mt-1 h-11"
            onBlur={(e) => save({ street_address: e.target.value || null })}
          />
        </div>
      )}

      {isFieldVisibleForMemberType(local.member_type, "service_area") && (
        <div>
          <Label htmlFor="service_area">Service area</Label>
          <Input
            id="service_area"
            defaultValue={local.service_area ?? ""}
            className="mt-1 h-11"
            placeholder="e.g. Inland Empire and Coachella Valley"
            onBlur={(e) => save({ service_area: e.target.value || null })}
          />
        </div>
      )}

      {isFieldVisibleForMemberType(local.member_type, "lead_time") && (
        <div>
          <Label htmlFor="lead_time">Typical lead time</Label>
          <Input
            id="lead_time"
            defaultValue={local.lead_time ?? ""}
            className="mt-1 h-11"
            placeholder="e.g. 2–3 business days"
            onBlur={(e) => save({ lead_time: e.target.value || null })}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="member_since_year">Member since</Label>
          <Input
            id="member_since_year"
            type="number"
            defaultValue={local.member_since_year ?? ""}
            className="mt-1 h-11"
            onBlur={(e) => save({ member_since_year: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Select defaultValue={local.timezone} onValueChange={(value) => save({ timezone: value })}>
            <SelectTrigger id="timezone" className="mt-1 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the project type-checks and the route renders**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/basics` (signed in as a member editor). Expected: all fields render, the location field's label changes when you switch member type, and editing then blurring a field doesn't throw in the console.

- [ ] **Step 4: Commit**

```bash
git add src/lib/members/member-basics.server.ts src/routes/admin.basics.tsx src/components/admin/BasicsForm.tsx
git commit -m "feat: add the basics editor (artboard F identity/location/type)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Hours editor (artboard F — weekly hours + special hours)

**Files:**
- Create: `src/lib/hours/hours-editor.server.ts`
- Create: `src/routes/admin.hours.tsx`
- Create: `src/components/admin/HoursEditor.tsx`

**Interfaces:**
- Produces: `listHours(memberId)`, `upsertHoursRow`, `deleteHoursRow`, `upsertSpecialHoursRow`, `deleteSpecialHoursRow` — all `createServerFn`s.
- Consumes: `getSupabaseServerClientForRequest` (Task 2), `HoursRow`/`SpecialHoursRow` (Task 1, unchanged from Phase 3).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/hours/hours-editor.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";

export const listHours = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const [{ data: hours }, { data: specialHours }] = await Promise.all([
      supabase.from("hours").select("*").eq("member_id", data.memberId).order("weekday"),
      supabase.from("special_hours").select("*").eq("member_id", data.memberId).order("date"),
    ]);
    return { hours: (hours ?? []) as HoursRow[], specialHours: (specialHours ?? []) as SpecialHoursRow[] };
  });

type HoursPatch = Partial<Pick<HoursRow, "weekday" | "opens_at" | "closes_at" | "closes_next_day" | "is_closed">>;

/** Multiple rows per weekday are allowed (split hours) -- id is present for an update, absent for a new row. */
export const upsertHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id?: string; patch: HoursPatch }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    if (data.id) {
      const { error } = await supabase.from("hours").update(data.patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabase
      .from("hours")
      .insert({ member_id: data.memberId, ...data.patch })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("hours").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

type SpecialHoursPatch = Partial<
  Pick<SpecialHoursRow, "date" | "is_closed" | "opens_at" | "closes_at" | "closes_next_day" | "note">
>;

export const upsertSpecialHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id?: string; patch: SpecialHoursPatch }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    if (data.id) {
      const { error } = await supabase.from("special_hours").update(data.patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabase
      .from("special_hours")
      .insert({ member_id: data.memberId, ...data.patch })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteSpecialHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("special_hours").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the route and phone-first editor**

Create `src/routes/admin.hours.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { listHours } from "@/lib/hours/hours-editor.server";
import { HoursEditor } from "@/components/admin/HoursEditor";

export const Route = createFileRoute("/admin/hours")({
  loader: async ({ context }) => listHours({ data: { memberId: context.memberId } }),
  component: HoursRoute,
});

function HoursRoute() {
  const { hours, specialHours } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return <HoursEditor memberId={memberId} hours={hours} specialHours={specialHours} />;
}
```

Create `src/components/admin/HoursEditor.tsx`:

```tsx
import { useState } from "react";
import {
  deleteHoursRow,
  deleteSpecialHoursRow,
  upsertHoursRow,
  upsertSpecialHoursRow,
} from "@/lib/hours/hours-editor.server";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Phone layout (spec, "Layout and breakpoints"): the two time fields sit
 * side by side, and the Closed control is on its own line below them --
 * not squeezed into the same row, since a 44px checkbox target next to two
 * time inputs is where phone hour-editors usually get too cramped to tap
 * reliably.
 */
export function HoursEditor({
  memberId,
  hours,
  specialHours,
}: {
  memberId: string;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
}) {
  const [rows, setRows] = useState(hours);
  const [special, setSpecial] = useState(specialHours);

  async function addRowForWeekday(weekday: number) {
    const { id } = await upsertHoursRow({
      data: { memberId, patch: { weekday, opens_at: "09:00", closes_at: "17:00", is_closed: false } },
    });
    setRows((prev) => [...prev, { id, member_id: memberId, weekday, opens_at: "09:00", closes_at: "17:00", closes_next_day: false, is_closed: false }]);
  }

  function updateRow(id: string, patch: Parameters<typeof upsertHoursRow>[0]["data"]["patch"]) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    void upsertHoursRow({ data: { memberId, id, patch } });
  }

  async function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
    await deleteHoursRow({ data: { id } });
  }

  async function addHoliday() {
    const today = new Date().toISOString().slice(0, 10);
    const { id } = await upsertSpecialHoursRow({ data: { memberId, patch: { date: today, is_closed: true } } });
    setSpecial((prev) => [...prev, { id, member_id: memberId, date: today, is_closed: true, opens_at: null, closes_at: null, closes_next_day: false, note: null }]);
  }

  function updateSpecial(id: string, patch: Parameters<typeof upsertSpecialHoursRow>[0]["data"]["patch"]) {
    setSpecial((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    void upsertSpecialHoursRow({ data: { memberId, id, patch } });
  }

  async function removeSpecial(id: string) {
    setSpecial((prev) => prev.filter((row) => row.id !== id));
    await deleteSpecialHoursRow({ data: { id } });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-lg font-medium text-foreground">Weekly hours</h2>
        <div className="mt-3 space-y-4">
          {WEEKDAYS.map((label, weekday) => (
            <div key={weekday} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{label}</span>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => addRowForWeekday(weekday)}>
                  Add row
                </Button>
              </div>
              <div className="mt-2 space-y-3">
                {rows
                  .filter((row) => row.weekday === weekday)
                  .map((row) => (
                    <div key={row.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          defaultValue={row.opens_at ?? ""}
                          disabled={row.is_closed}
                          className="h-11"
                          aria-label={`${label} opening time`}
                          onBlur={(e) => updateRow(row.id, { opens_at: e.target.value })}
                        />
                        <span aria-hidden="true">–</span>
                        <Input
                          type="time"
                          defaultValue={row.closes_at ?? ""}
                          disabled={row.is_closed}
                          className="h-11"
                          aria-label={`${label} closing time`}
                          onBlur={(e) => updateRow(row.id, { closes_at: e.target.value })}
                        />
                        <Button type="button" variant="ghost" size="sm" aria-label={`Remove this ${label} row`} onClick={() => removeRow(row.id)}>
                          Remove
                        </Button>
                      </div>
                      <label className="flex min-h-11 items-center gap-2">
                        <Checkbox checked={row.is_closed} onCheckedChange={(checked) => updateRow(row.id, { is_closed: checked === true })} />
                        <span>Closed</span>
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">Holidays &amp; one-off changes</h2>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={addHoliday}>
            Add a holiday or one-off change
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {special.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Input type="date" defaultValue={row.date} className="h-11" onBlur={(e) => updateSpecial(row.id, { date: e.target.value })} />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeSpecial(row.id)}>
                  Remove
                </Button>
              </div>
              <label className="mt-2 flex min-h-11 items-center gap-2">
                <Checkbox checked={row.is_closed} onCheckedChange={(checked) => updateSpecial(row.id, { is_closed: checked === true })} />
                <span>Closed</span>
              </label>
              {!row.is_closed && (
                <div className="mt-2 flex items-center gap-2">
                  <Input type="time" defaultValue={row.opens_at ?? ""} className="h-11" onBlur={(e) => updateSpecial(row.id, { opens_at: e.target.value })} />
                  <span aria-hidden="true">–</span>
                  <Input type="time" defaultValue={row.closes_at ?? ""} className="h-11" onBlur={(e) => updateSpecial(row.id, { closes_at: e.target.value })} />
                </div>
              )}
              <div className="mt-2">
                <Label htmlFor={`note-${row.id}`}>Note (shown on the profile)</Label>
                <Input id={`note-${row.id}`} defaultValue={row.note ?? ""} className="mt-1 h-11" placeholder="e.g. Thanksgiving" onBlur={(e) => updateSpecial(row.id, { note: e.target.value || null })} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/hours`. Confirm: adding a row per weekday works, the Closed checkbox renders on its own line below the time inputs (not beside them), and "Add a holiday or one-off change" adds a special-hours row.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hours/hours-editor.server.ts src/routes/admin.hours.tsx src/components/admin/HoursEditor.tsx
git commit -m "feat: add the hours editor with phone-first split-hours layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 11: EXIF/metadata stripping (TDD)

**Files:**
- Create: `src/lib/media/strip-exif.ts`
- Create: `src/lib/media/strip-exif.test.ts`

**Interfaces:**
- Produces: `stripJpegExif(bytes)`, `stripPngMetadata(bytes)`, `stripImageMetadata(bytes, mimeType)`. Consumed by every upload path: `media-gallery.server.ts` (Task 14), `logo.server.ts` (Task 17), `creator-upload.server.ts` (Task 20).
- Consumes: nothing — pure `Uint8Array` manipulation (this plan's Decision 9: no image library, since only `Uint8Array` is guaranteed to behave identically in Workers, Node, and the browser without individually verifying a library's Workers compatibility).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/media/strip-exif.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stripJpegExif, stripPngMetadata } from "./strip-exif";

describe("stripJpegExif", () => {
  it("removes an APP1 Exif segment and keeps everything else", () => {
    const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xaa, 0xbb]; // "Exif\0\0" + fake TIFF bytes
    const app1Length = exifPayload.length + 2;
    const jpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...exifPayload, // APP1 Exif
      0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, // APP0 (unrelated, kept)
      0xff, 0xda, 0x00, 0x00, 0x11, 0x22, 0x33, // SOS + fake scan data
      0xff, 0xd9, // EOI
    ]);

    const result = stripJpegExif(jpeg);

    expect(Array.from(result)).toEqual([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
      0xff, 0xda, 0x00, 0x00, 0x11, 0x22, 0x33, 0xff, 0xd9,
    ]);
  });

  it("returns the input unchanged when it doesn't start with a JPEG SOI marker", () => {
    const notJpeg = new Uint8Array([0x00, 0x01, 0x02]);
    expect(stripJpegExif(notJpeg)).toBe(notJpeg);
  });
});

function pngChunk(type: string, data: number[]): number[] {
  const length = data.length;
  const typeBytes = Array.from(type).map((c) => c.charCodeAt(0));
  const lengthBytes = [(length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff];
  return [...lengthBytes, ...typeBytes, ...data, 0, 0, 0, 0]; // CRC unchecked by the stripper, placeholder is fine
}

describe("stripPngMetadata", () => {
  it("removes eXIf and tEXt chunks and keeps IHDR/IDAT/IEND", () => {
    const ihdr = [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0];
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk("IHDR", ihdr),
      ...pngChunk("eXIf", [0xaa, 0xbb, 0xcc]),
      ...pngChunk("tEXt", [0x41, 0x00, 0x42]),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    const expected = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk("IHDR", ihdr),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    expect(Array.from(stripPngMetadata(png))).toEqual(Array.from(expected));
  });

  it("returns the input unchanged when it doesn't start with the PNG signature", () => {
    const notPng = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(stripPngMetadata(notPng)).toBe(notPng);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- strip-exif
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/media/strip-exif.ts`:

```ts
/**
 * Hand-written, dependency-free EXIF/metadata stripping (spec, "Logos and
 * assets": "Strip EXIF from uploaded photos. Phone photos carry GPS
 * coordinates..."). Byte-level JPEG marker / PNG chunk parsing needs
 * nothing but Uint8Array, which behaves identically in the Cloudflare
 * Workers runtime, Node, and the browser -- unlike an image-processing
 * library, whose Workers compatibility would need to be individually
 * verified (this plan's Decision 9).
 */

export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes; // Not a JPEG (missing SOI) -- caller already validated the signature before calling this.
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      return bytes; // Not aligned on a marker -- bail out rather than risk corrupting the file.
    }
    const marker = bytes[offset + 1];

    if (marker === 0xd9) {
      chunks.push(bytes.subarray(offset, offset + 2)); // EOI
      offset += 2;
      break;
    }

    if (marker === 0xda) {
      chunks.push(bytes.subarray(offset)); // SOS -- scan data through EOI, copied through untouched.
      offset = bytes.length;
      break;
    }

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(bytes.subarray(offset, offset + 2)); // RSTn / TEM: no length field.
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const segmentEnd = offset + 2 + length;

    const isApp1Exif =
      marker === 0xe1 &&
      length >= 8 &&
      bytes[offset + 4] === 0x45 && // 'E'
      bytes[offset + 5] === 0x78 && // 'x'
      bytes[offset + 6] === 0x69 && // 'i'
      bytes[offset + 7] === 0x66; // 'f'

    if (!isApp1Exif) {
      chunks.push(bytes.subarray(offset, segmentEnd));
    }
    offset = segmentEnd;
  }

  return concatUint8Arrays(chunks);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_STRIPPED_CHUNK_TYPES = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return bytes;
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const chunkEnd = offset + 8 + length + 4; // + 4-byte CRC

    if (!PNG_STRIPPED_CHUNK_TYPES.has(type)) {
      chunks.push(bytes.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return concatUint8Arrays(chunks);
}

export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  if (mimeType === "image/jpeg") return stripJpegExif(bytes);
  if (mimeType === "image/png") return stripPngMetadata(bytes);
  return bytes; // SVG carries no binary EXIF; video is out of scope for this phase's metadata concern.
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- strip-exif
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/strip-exif.ts src/lib/media/strip-exif.test.ts
git commit -m "feat: add hand-written JPEG/PNG EXIF and metadata stripping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: File-signature validation (TDD)

**Files:**
- Create: `src/lib/media/validate-file.ts`
- Create: `src/lib/media/validate-file.test.ts`
- Modify: `package.json` (add `file-type`)

**Interfaces:**
- Produces: `validateUploadedImage({ bytes, claimedMimeType, allowSvg, maxBytes? })`, `readPngHeight(bytes)`. Consumed by `media-gallery.server.ts` (Task 14), `logo.server.ts` (Task 17), `creator-upload.server.ts` (Task 20).
- Consumes: `file-type`'s `fileTypeFromBuffer` (this plan's Decision 10 — buffer-based only, never the Node-`fs`-dependent variants).

- [ ] **Step 1: Install `file-type`**

```bash
npm install file-type
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/media/validate-file.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPngHeight, validateUploadedImage } from "./validate-file";

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // length=13, "IHDR"
  0x00, 0x00, 0x00, 0x01, // width = 1
  0x00, 0x00, 0x01, 0x90, // height = 400
  0x08, 0x06, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, // CRC, unchecked
]);

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

describe("validateUploadedImage", () => {
  it("accepts a real PNG by its magic bytes", async () => {
    const result = await validateUploadedImage({ bytes: PNG_1X1, claimedMimeType: "image/png", allowSvg: true });
    expect(result).toEqual({ valid: true, detectedMimeType: "image/png" });
  });

  it("rejects a JPEG renamed to claim it's a PNG, by checking the real signature", async () => {
    const result = await validateUploadedImage({ bytes: JPEG_MAGIC, claimedMimeType: "image/png", allowSvg: true });
    expect(result.valid).toBe(false);
  });

  it("accepts a real SVG by content-sniffing, since it has no magic-byte signature", async () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = await validateUploadedImage({ bytes: svg, claimedMimeType: "image/svg+xml", allowSvg: true });
    expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
  });

  it("rejects an SVG containing a <script> tag", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const result = await validateUploadedImage({ bytes: svg, claimedMimeType: "image/svg+xml", allowSvg: true });
    expect(result.valid).toBe(false);
  });

  it("rejects an oversized file", async () => {
    const big = new Uint8Array(10);
    const result = await validateUploadedImage({ bytes: big, claimedMimeType: "image/png", allowSvg: true, maxBytes: 5 });
    expect(result.valid).toBe(false);
  });

  it("rejects SVG when allowSvg is false", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = await validateUploadedImage({ bytes: svg, claimedMimeType: "image/svg+xml", allowSvg: false });
    expect(result.valid).toBe(false);
  });
});

describe("readPngHeight", () => {
  it("reads the height from IHDR", () => {
    expect(readPngHeight(PNG_1X1)).toBe(400);
  });

  it("returns null for a non-PNG buffer", () => {
    expect(readPngHeight(JPEG_MAGIC)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
npm test -- validate-file
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the module**

Create `src/lib/media/validate-file.ts`:

```ts
import { fileTypeFromBuffer } from "file-type";

export type FileValidationResult = { valid: true; detectedMimeType: string } | { valid: false; reason: string };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB cap (spec: "cap file size").
const RASTER_SIGNATURE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * SVG has no fixed magic-byte signature (it's XML text) -- file-type cannot
 * detect it, so content-sniff instead. containsScriptTag is a cheap
 * defense-in-depth check, not the full sanitization Phase 3 already
 * deferred for inline rendering -- SVGs here are still only ever served via
 * <img src>, never inlined (this plan's Decision 10).
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 2048)).replace(/^﻿/, "").trim();
  return /^(<\?xml[^>]*\?>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head);
}

function containsScriptTag(bytes: Uint8Array): boolean {
  return /<script[\s>]/i.test(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
}

export async function validateUploadedImage(params: {
  bytes: Uint8Array;
  claimedMimeType: string;
  allowSvg: boolean;
  maxBytes?: number;
}): Promise<FileValidationResult> {
  const { bytes, allowSvg, maxBytes = MAX_UPLOAD_BYTES } = params;

  if (bytes.byteLength === 0) {
    return { valid: false, reason: "The file is empty." };
  }
  if (bytes.byteLength > maxBytes) {
    return { valid: false, reason: `The file is larger than the ${Math.round(maxBytes / (1024 * 1024))}MB limit.` };
  }

  const detected = await fileTypeFromBuffer(bytes);

  if (detected && RASTER_SIGNATURE_MIME_TYPES.has(detected.mime)) {
    return { valid: true, detectedMimeType: detected.mime };
  }

  if (allowSvg && !detected && looksLikeSvg(bytes)) {
    if (containsScriptTag(bytes)) {
      return { valid: false, reason: "SVG files containing <script> are not allowed." };
    }
    return { valid: true, detectedMimeType: "image/svg+xml" };
  }

  return {
    valid: false,
    reason: allowSvg
      ? "This doesn't look like a real PNG or SVG file. Only PNG or SVG logos are accepted."
      : "This doesn't look like a real image file (its content doesn't match its extension).",
  };
}

/** PNG IHDR is always the first chunk: 8-byte signature + 4-byte length + 4-byte type + width(4) + height(4). */
export function readPngHeight(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 26) return null;
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  if (!isPng) return null;
  return ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npm test -- validate-file
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/validate-file.ts src/lib/media/validate-file.test.ts package.json package-lock.json
git commit -m "feat: add real file-signature validation for uploads

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Crop-interaction math (TDD)

**Files:**
- Create: `src/lib/media/crop-interaction.ts`
- Create: `src/lib/media/crop-interaction.test.ts`

**Interfaces:**
- Produces: `initialCropForAspect(naturalWidth, naturalHeight, targetAspect)`, `panCropRect(crop, deltaX, deltaY)`, `zoomCropRect(crop, scaleFactor)`. Consumed by `CropEditor.tsx` (Task 14).
- Consumes: `CropRect` from Phase 3's `src/lib/media/crop.ts` (reused, not redefined).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/media/crop-interaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialCropForAspect, panCropRect, zoomCropRect } from "./crop-interaction";

describe("initialCropForAspect", () => {
  it("crops the sides of a wider-than-target image", () => {
    const crop = initialCropForAspect(2000, 1000, 4 / 5); // 2:1 original, 4:5 target
    expect(crop.h).toBe(1);
    expect(crop.w).toBeCloseTo(0.4, 5);
    expect(crop.x).toBeCloseTo(0.3, 5);
    expect(crop.y).toBe(0);
  });

  it("crops the top/bottom of a taller-than-target image", () => {
    const crop = initialCropForAspect(1000, 2000, 4 / 5); // 0.5 original, 4:5 target
    expect(crop.w).toBe(1);
    expect(crop.h).toBeCloseTo(0.625, 5);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo(0.1875, 5);
  });

  it("returns the identity crop when the original already matches the target aspect", () => {
    expect(initialCropForAspect(400, 500, 4 / 5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("panCropRect", () => {
  it("pans within bounds", () => {
    expect(panCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 0.1, 0)).toEqual({ x: 0.4, y: 0, w: 0.4, h: 1 });
  });

  it("clamps panning at the right edge", () => {
    expect(panCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 10, 0).x).toBeCloseTo(0.6, 5);
  });

  it("clamps panning at the left edge", () => {
    expect(panCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, -10, 0).x).toBe(0);
  });
});

describe("zoomCropRect", () => {
  it("zooming in shrinks the crop window around its center", () => {
    const crop = zoomCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 2);
    expect(crop.w).toBeCloseTo(0.2, 5);
    expect(crop.x).toBeCloseTo(0.4, 5);
  });

  it("zooming out never exceeds the full original", () => {
    const crop = zoomCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 0.1);
    expect(crop.w).toBe(1);
    expect(crop.x).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- crop-interaction
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/media/crop-interaction.ts`:

```ts
import type { CropRect } from "@/lib/media/crop";

/**
 * The 4:5 slot is fixed (spec, "The slot") -- what the member actually
 * controls is which part of their original photo fills it. These are the
 * three operations CropEditor.tsx needs: an initial centered crop when an
 * image is first assigned to a slide/cover, panning, and zooming, all
 * expressed as the same fractional CropRect Phase 3's computeCropStyle
 * already renders.
 */
export function initialCropForAspect(naturalWidth: number, naturalHeight: number, targetAspect: number): CropRect {
  const naturalAspect = naturalWidth / naturalHeight;

  if (naturalAspect > targetAspect) {
    const w = targetAspect / naturalAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }

  const h = naturalAspect / targetAspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

export function panCropRect(crop: CropRect, deltaX: number, deltaY: number): CropRect {
  const x = Math.min(Math.max(crop.x + deltaX, 0), 1 - crop.w);
  const y = Math.min(Math.max(crop.y + deltaY, 0), 1 - crop.h);
  return { ...crop, x, y };
}

/** scaleFactor > 1 zooms in (shrinks the window); < 1 zooms out, capped so it can never exceed the full original. */
export function zoomCropRect(crop: CropRect, scaleFactor: number): CropRect {
  const centerX = crop.x + crop.w / 2;
  const centerY = crop.y + crop.h / 2;
  const w = Math.min(Math.max(crop.w / scaleFactor, 0.05), 1);
  const h = Math.min(Math.max(crop.h / scaleFactor, 0.05), 1);
  const x = Math.min(Math.max(centerX - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(centerY - h / 2, 0), 1 - h);
  return { x, y, w, h };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- crop-interaction
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/crop-interaction.ts src/lib/media/crop-interaction.test.ts
git commit -m "feat: add pan/zoom/initial-crop math for the media crop editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 14: Media gallery + generic upload pipeline (artboard G, part 1)

**Files:**
- Create: `src/lib/media/media-gallery.server.ts`
- Create: `src/routes/admin.media.tsx`
- Create: `src/components/admin/MediaGallery.tsx`
- Create: `src/components/admin/CropEditor.tsx`

**Interfaces:**
- Produces: `listMemberMedia(memberId)`, `uploadMemberMedia(formData)`, `deleteMemberMedia(id)` — `createServerFn`s. `<CropEditor>` — a pointer-driven crop UI over `computeCropStyle`/`CropRect` (Phase 3) and `initialCropForAspect`/`panCropRect`/`zoomCropRect` (Task 13).
- Consumes: `getSupabaseServerClientForRequest` (Task 2), `validateUploadedImage` (Task 12), `stripImageMetadata` (Task 11), `MediaAssetRow` (Task 1).

- [ ] **Step 1: Implement the gallery mutations**

Create `src/lib/media/media-gallery.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import type { MediaAssetRow } from "@/lib/supabase/types";

export const listMemberMedia = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: assets, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("member_id", data.memberId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return assets as MediaAssetRow[];
  });

/**
 * The generic gallery-upload path -- a member uploading a file they
 * already have (spec, "Where media comes from", path 1 of 2; path 2 is the
 * creator-upload link, Task 20). Writes with the session-bound anon-key
 * client, so RLS's "media_assets: owners and editors can insert" and
 * "member-media: owners and editors manage their folder" storage policy
 * are what actually authorize this -- no service-role client involved.
 */
export const uploadMemberMedia = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const memberId = String(formData.get("memberId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({ bytes, claimedMimeType: file.type, allowSvg: false });
    if (!validation.valid) throw new Error(validation.reason);

    const stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    const storagePath = `${memberId}/${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("member-media")
      .upload(storagePath, stripped, { contentType: validation.detectedMimeType });
    if (uploadError) throw new Error(uploadError.message);

    const { data: row, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        member_id: memberId,
        storage_path: storagePath,
        kind: "image",
        mime_type: validation.detectedMimeType,
        byte_size: stripped.byteLength,
        original_filename: file.name,
        source: "member_upload",
        uploaded_by_user_id: userData.user.id,
        review_status: "approved",
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    return row as MediaAssetRow;
  });

export const deleteMemberMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; storagePath: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await supabase.storage.from("member-media").remove([data.storagePath]);
    const { error } = await supabase.from("media_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the interactive crop editor**

Create `src/components/admin/CropEditor.tsx`:

```tsx
import { useRef, useState } from "react";
import { computeCropStyle, type CropRect } from "@/lib/media/crop";
import { panCropRect, zoomCropRect } from "@/lib/media/crop-interaction";
import { Button } from "@/components/ui/button";

/**
 * A pointer-drag-to-pan, button-to-zoom crop editor over a fixed-aspect
 * window. Fires onChange with each new CropRect; the caller (CarouselEditor,
 * CoverEditor) is responsible for persisting it via its own autosaving
 * mutation -- this component holds no server state itself.
 */
export function CropEditor({
  imageUrl,
  crop,
  aspectClassName,
  onChange,
}: {
  imageUrl: string;
  crop: CropRect;
  aspectClassName: string; // e.g. "aspect-[4/5]"
  onChange: (crop: CropRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    setDragStart({ x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = -(event.clientX - dragStart.x) / rect.width;
    const deltaY = -(event.clientY - dragStart.y) / rect.height;
    onChange(panCropRect(crop, deltaX * crop.w, deltaY * crop.h));
    setDragStart({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp() {
    setDragStart(null);
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-md bg-canvas-2 ${aspectClassName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label="Drag to reposition the crop"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" style={computeCropStyle(crop)} draggable={false} className="select-none" />
      </div>
      <div className="flex justify-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9" aria-label="Zoom out" onClick={() => onChange(zoomCropRect(crop, 0.9))}>
          −
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9" aria-label="Zoom in" onClick={() => onChange(zoomCropRect(crop, 1.1))}>
          +
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement the gallery route/component (carousel, cover, logo, tokens, and review tray sections are added into this same file by Tasks 15–21)**

Create `src/routes/admin.media.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { MediaGallery } from "@/components/admin/MediaGallery";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => listMemberMedia({ data: { memberId: context.memberId } }),
  component: MediaRoute,
});

function MediaRoute() {
  const assets = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return <MediaGallery memberId={memberId} initialAssets={assets} />;
}
```

Create `src/components/admin/MediaGallery.tsx`:

```tsx
import { useRef, useState } from "react";
import { deleteMemberMedia, uploadMemberMedia } from "@/lib/media/media-gallery.server";
import type { MediaAssetRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

/**
 * The plain gallery of originals (spec, "Media model": "Each member has a
 * media gallery holding original files"). Carousel-slot assignment,
 * cover-crop, logo upload, creator-upload links, and the pending-review
 * tray are each a separate section rendered alongside this one on
 * /admin/media (Tasks 15–21) -- kept in separate components/files per
 * section, all sharing this page.
 */
export function MediaGallery({ memberId, initialAssets }: { memberId: string; initialAssets: MediaAssetRow[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("file", file);
    const created = await uploadMemberMedia({ data: formData });
    setAssets((prev) => [created, ...prev]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onDelete(asset: MediaAssetRow) {
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    await deleteMemberMedia({ data: { id: asset.id, storagePath: asset.storage_path } });
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Gallery</h2>
      <div className="mt-3">
        <label htmlFor="gallery-upload" className="sr-only">
          Upload a photo
        </label>
        <input
          ref={fileInputRef}
          id="gallery-upload"
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={onFileSelected}
        />
        <Button type="button" className="h-11" onClick={() => fileInputRef.current?.click()}>
          Upload a photo
        </Button>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {assets
          .filter((asset) => asset.review_status === "approved")
          .map((asset) => (
            <li key={asset.id} className="relative aspect-square overflow-hidden rounded-md bg-canvas-2">
              {/* Served through whatever public/proxy URL Phase 3's profile page uses for member-media -- this
                  gallery thumbnail reuses that same URL-building logic rather than inventing a second one. */}
              <img src={`/api/member-media/${asset.id}`} alt="" className="h-full w-full object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute right-1 top-1 h-9"
                aria-label="Delete this photo"
                onClick={() => onDelete(asset)}
              >
                Delete
              </Button>
            </li>
          ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/media`, upload a PNG, confirm it appears in the gallery grid and deleting it removes it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/media-gallery.server.ts src/routes/admin.media.tsx src/components/admin/MediaGallery.tsx src/components/admin/CropEditor.tsx
git commit -m "feat: add the media gallery, generic upload pipeline, and crop editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Carousel slide assignment (artboard G, part 2)

**Files:**
- Create: `src/lib/media/carousel.server.ts`
- Create: `src/components/admin/CarouselEditor.tsx`
- Modify: `src/routes/admin.media.tsx` (render `<CarouselEditor>` alongside `<MediaGallery>`)

**Interfaces:**
- Produces: `listCarouselSlides(memberId)`, `assignCarouselSlide`, `unassignCarouselSlide`, `updateCarouselSlideCrop`, `updateCarouselSlideLink` — `createServerFn`s.
- Consumes: `CarouselSlideRow`/`MediaAssetRow` (Task 1/Phase 3), `CropEditor` (Task 14), `CropRect` (Phase 3's `crop.ts`).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/media/carousel.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { initialCropForAspect } from "@/lib/media/crop-interaction";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import type { CropRect } from "@/lib/media/crop";

const CAROUSEL_ASPECT = 4 / 5;

export const listCarouselSlides = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: slides, error } = await supabase
      .from("carousel_slides")
      .select("*")
      .eq("member_id", data.memberId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return slides as CarouselSlideRow[];
  });

/** Assigns a gallery asset to a slot (0-3), replacing whatever was there. */
export const assignCarouselSlide = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; sortOrder: number; assetId: string; asset: Pick<MediaAssetRow, "width" | "height"> }) => data)
  .handler(async ({ data }) => {
    if (data.sortOrder < 0 || data.sortOrder > 3) throw new Error("Carousel slots are 0-3 (max four slides).");

    const supabase = await getSupabaseServerClientForRequest();
    const crop: CropRect =
      data.asset.width && data.asset.height
        ? initialCropForAspect(data.asset.width, data.asset.height, CAROUSEL_ASPECT)
        : { x: 0, y: 0, w: 1, h: 1 };

    const { data: existing } = await supabase
      .from("carousel_slides")
      .select("id")
      .eq("member_id", data.memberId)
      .eq("sort_order", data.sortOrder)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("carousel_slides")
        .update({ asset_id: data.assetId, crop })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, crop };
    }

    const { data: created, error } = await supabase
      .from("carousel_slides")
      .insert({ member_id: data.memberId, asset_id: data.assetId, sort_order: data.sortOrder, crop })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string, crop };
  });

export const unassignCarouselSlide = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("carousel_slides").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateCarouselSlideCrop = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; crop: CropRect }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("carousel_slides").update({ crop: data.crop }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateCarouselSlideLink = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; outboundUrl: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("carousel_slides").update({ outbound_url: data.outboundUrl }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the component**

Create `src/components/admin/CarouselEditor.tsx`:

```tsx
import { useState } from "react";
import {
  assignCarouselSlide,
  unassignCarouselSlide,
  updateCarouselSlideCrop,
  updateCarouselSlideLink,
} from "@/lib/media/carousel.server";
import { CropEditor } from "@/components/admin/CropEditor";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SLOTS = [0, 1, 2, 3];

/** "Portrait" everywhere a member can see it -- "4:5" appears once, as small grey supporting text (spec, "The slot"). */
export function CarouselEditor({
  memberId,
  initialSlides,
  galleryAssets,
}: {
  memberId: string;
  initialSlides: CarouselSlideRow[];
  galleryAssets: MediaAssetRow[];
}) {
  const [slides, setSlides] = useState(initialSlides);

  function slideForSlot(slot: number) {
    return slides.find((slide) => slide.sort_order === slot);
  }

  async function onAssign(slot: number, asset: MediaAssetRow) {
    const { id, crop } = await assignCarouselSlide({
      data: { memberId, sortOrder: slot, assetId: asset.id, asset: { width: asset.width, height: asset.height } },
    });
    setSlides((prev) => [
      ...prev.filter((slide) => slide.sort_order !== slot),
      { id, member_id: memberId, asset_id: asset.id, crop, outbound_url: null, sort_order: slot },
    ]);
  }

  async function onUnassign(slide: CarouselSlideRow) {
    setSlides((prev) => prev.filter((s) => s.id !== slide.id));
    await unassignCarouselSlide({ data: { id: slide.id } });
  }

  function onCropChange(slide: CarouselSlideRow, crop: CarouselSlideRow["crop"]) {
    setSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, crop } : s)));
    void updateCarouselSlideCrop({ data: { id: slide.id, crop } });
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Portrait carousel</h2>
      <p className="text-xs text-muted-foreground">4:5 — up to four slides.</p>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SLOTS.map((slot) => {
          const slide = slideForSlot(slot);
          const asset = slide ? galleryAssets.find((a) => a.id === slide.asset_id) : undefined;
          return (
            <div key={slot} className="space-y-2">
              {slide && asset ? (
                <>
                  <CropEditor
                    imageUrl={`/api/member-media/${asset.id}`}
                    crop={slide.crop}
                    aspectClassName="aspect-[4/5]"
                    onChange={(crop) => onCropChange(slide, crop)}
                  />
                  <Label htmlFor={`slide-link-${slide.id}`}>Tap-through link (optional)</Label>
                  <Input
                    id={`slide-link-${slide.id}`}
                    defaultValue={slide.outbound_url ?? ""}
                    className="h-11"
                    onBlur={(e) => void updateCarouselSlideLink({ data: { id: slide.id, outboundUrl: e.target.value || null } })}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9 w-full" onClick={() => onUnassign(slide)}>
                    Remove from carousel
                  </Button>
                </>
              ) : (
                <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-2">
                  <span className="text-xs text-muted-foreground">Slot {slot + 1}</span>
                  <select
                    className="h-11 w-full rounded-md border border-border bg-background text-sm"
                    aria-label={`Choose a photo for slot ${slot + 1}`}
                    defaultValue=""
                    onChange={(e) => {
                      const asset = galleryAssets.find((a) => a.id === e.target.value);
                      if (asset) void onAssign(slot, asset);
                    }}
                  >
                    <option value="" disabled>
                      Choose from gallery…
                    </option>
                    {galleryAssets
                      .filter((a) => a.review_status === "approved")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.original_filename ?? a.id}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the media route**

In `src/routes/admin.media.tsx`, add a loader call for `listCarouselSlides` alongside `listMemberMedia`, and render `<CarouselEditor>` below `<MediaGallery>`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { listCarouselSlides } from "@/lib/media/carousel.server";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CarouselEditor } from "@/components/admin/CarouselEditor";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => {
    const [assets, slides] = await Promise.all([
      listMemberMedia({ data: { memberId: context.memberId } }),
      listCarouselSlides({ data: { memberId: context.memberId } }),
    ]);
    return { assets, slides };
  },
  component: MediaRoute,
});

function MediaRoute() {
  const { assets, slides } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <div className="space-y-8">
      <MediaGallery memberId={memberId} initialAssets={assets} />
      <CarouselEditor memberId={memberId} initialSlides={slides} galleryAssets={assets} />
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/media`, upload a photo, assign it to a carousel slot, drag to pan and confirm the crop updates, remove it from the slot.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/carousel.server.ts src/components/admin/CarouselEditor.tsx src/routes/admin.media.tsx
git commit -m "feat: add carousel slide assignment with crop editing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Cover photo crop (artboard G, part 3)

**Files:**
- Create: `src/lib/media/cover.server.ts`
- Create: `src/components/admin/CoverEditor.tsx`
- Modify: `src/routes/admin.media.tsx` (render `<CoverEditor>`)

**Interfaces:**
- Produces: `updateCoverAsset(memberId, assetId)`, `updateCoverCrop(memberId, crop)` — `createServerFn`s.
- Consumes: `CropEditor`/`initialCropForAspect` (Tasks 13–14), `MemberRow.cover_asset_id`/`.cover_crop` (Task 1).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/media/cover.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { initialCropForAspect } from "@/lib/media/crop-interaction";
import type { CropRect } from "@/lib/media/crop";

const COVER_ASPECT = 2.5; // phone: 2.5:1 (spec, "Profile hero and theme"). Desktop's 4:1 reuses this same rectangle (Phase 3's stated v1 limitation).

export const updateCoverAsset = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; assetId: string; assetWidth: number | null; assetHeight: number | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const crop: CropRect =
      data.assetWidth && data.assetHeight
        ? initialCropForAspect(data.assetWidth, data.assetHeight, COVER_ASPECT)
        : { x: 0, y: 0, w: 1, h: 1 };
    const { error } = await supabase
      .from("members")
      .update({ cover_asset_id: data.assetId, cover_crop: crop })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { crop };
  });

export const updateCoverCrop = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; crop: CropRect }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ cover_crop: data.crop }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the component**

Create `src/components/admin/CoverEditor.tsx`:

```tsx
import { useState } from "react";
import { updateCoverAsset, updateCoverCrop } from "@/lib/media/cover.server";
import { CropEditor } from "@/components/admin/CropEditor";
import type { CropRect } from "@/lib/media/crop";
import type { MediaAssetRow } from "@/lib/supabase/types";

export function CoverEditor({
  memberId,
  coverAssetId,
  coverCrop,
  galleryAssets,
}: {
  memberId: string;
  coverAssetId: string | null;
  coverCrop: CropRect | null;
  galleryAssets: MediaAssetRow[];
}) {
  const [assetId, setAssetId] = useState(coverAssetId);
  const [crop, setCrop] = useState<CropRect>(coverCrop ?? { x: 0, y: 0, w: 1, h: 1 });

  async function onChooseAsset(asset: MediaAssetRow) {
    const result = await updateCoverAsset({
      data: { memberId, assetId: asset.id, assetWidth: asset.width, assetHeight: asset.height },
    });
    setAssetId(asset.id);
    setCrop(result.crop);
  }

  function onCropChange(next: CropRect) {
    setCrop(next);
    void updateCoverCrop({ data: { memberId, crop: next } });
  }

  const asset = galleryAssets.find((a) => a.id === assetId);

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Cover photo</h2>
      <p className="text-xs text-muted-foreground">No cover photo? Your theme colour fills the band instead.</p>
      <div className="mt-3 max-w-md">
        {asset ? (
          <CropEditor imageUrl={`/api/member-media/${asset.id}`} crop={crop} aspectClassName="aspect-[5/2]" onChange={onCropChange} />
        ) : (
          <p className="text-sm text-muted-foreground">No cover photo set.</p>
        )}
        <select
          className="mt-2 h-11 w-full rounded-md border border-border bg-background text-sm"
          aria-label="Choose a cover photo"
          defaultValue=""
          onChange={(e) => {
            const chosen = galleryAssets.find((a) => a.id === e.target.value);
            if (chosen) void onChooseAsset(chosen);
          }}
        >
          <option value="" disabled>
            Choose from gallery…
          </option>
          {galleryAssets
            .filter((a) => a.review_status === "approved")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.original_filename ?? a.id}
              </option>
            ))}
        </select>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the media route**

Add `coverAssetId`/`coverCrop` to `admin.media.tsx`'s loader (via a small `getMemberBasics`-style select, or reuse `getMemberBasics` from Task 9) and render `<CoverEditor>` below `<CarouselEditor>`.

- [ ] **Step 4: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/media`, choose a cover photo, drag to reposition, confirm the crop persists across a page reload.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/cover.server.ts src/components/admin/CoverEditor.tsx src/routes/admin.media.tsx
git commit -m "feat: add cover photo selection and crop editing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: Logo upload (artboard G, part 4)

**Files:**
- Create: `src/lib/media/logo.server.ts`
- Create: `src/components/admin/LogoUploader.tsx`
- Modify: `src/routes/admin.media.tsx` (render `<LogoUploader>`)

**Interfaces:**
- Produces: `uploadMemberLogo(formData)` — `createServerFn`, PNG/SVG only, rejects JPG with an explanatory message, enforces the 400px-minimum-height rule on PNG only (this plan's Decision 11).
- Consumes: `validateUploadedImage`/`readPngHeight` (Task 12), `stripImageMetadata` (Task 11).

- [ ] **Step 1: Implement the mutation**

Create `src/lib/media/logo.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readPngHeight, validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";

const MIN_LOGO_HEIGHT_PX = 400;

export const uploadMemberLogo = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const memberId = String(formData.get("memberId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({ bytes, claimedMimeType: file.type, allowSvg: true });
    if (!validation.valid) {
      // "Reject at upload with a message that says why, rather than accepting and looking bad" (spec).
      throw new Error(
        validation.reason.includes("PNG or SVG")
          ? "Logos must be PNG or SVG — JPG can't have a transparent background, so it won't sit cleanly on the cross-link card. Export a PNG or SVG instead."
          : validation.reason,
      );
    }

    if (validation.detectedMimeType === "image/png") {
      const height = readPngHeight(bytes);
      if (height !== null && height < MIN_LOGO_HEIGHT_PX) {
        throw new Error(`This logo is ${height}px tall — logos need to be at least ${MIN_LOGO_HEIGHT_PX}px tall.`);
      }
    }

    const stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    const storagePath = `${memberId}/logo-${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("member-logos")
      .upload(storagePath, stripped, { contentType: validation.detectedMimeType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: assetRow, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        member_id: memberId,
        storage_path: storagePath,
        kind: "image",
        mime_type: validation.detectedMimeType,
        byte_size: stripped.byteLength,
        original_filename: file.name,
        source: "member_upload",
        review_status: "approved",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error: memberError } = await supabase
      .from("members")
      .update({ logo_asset_id: assetRow.id })
      .eq("id", memberId);
    if (memberError) throw new Error(memberError.message);

    const { data: publicUrl } = supabase.storage.from("member-logos").getPublicUrl(storagePath);
    return { assetId: assetRow.id as string, publicUrl: publicUrl.publicUrl };
  });
```

- [ ] **Step 2: Implement the component**

Create `src/components/admin/LogoUploader.tsx`:

```tsx
import { useRef, useState } from "react";
import { uploadMemberLogo } from "@/lib/media/logo.server";
import { Button } from "@/components/ui/button";

export function LogoUploader({ memberId, initialLogoUrl }: { memberId: string; initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("file", file);
    try {
      const { publicUrl } = await uploadMemberLogo({ data: formData });
      setLogoUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Logo</h2>
      <p className="text-xs text-muted-foreground">PNG or SVG, transparent background, at least 400px tall.</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-md bg-canvas p-2">
          {logoUrl ? <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
        </div>
        <div>
          <label htmlFor="logo-upload" className="sr-only">
            Upload a logo
          </label>
          <input ref={fileInputRef} id="logo-upload" type="file" accept="image/png,image/svg+xml" className="hidden" onChange={onFileSelected} />
          <Button type="button" className="h-11" onClick={() => fileInputRef.current?.click()}>
            Upload logo
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the media route and verify manually**

Render `<LogoUploader>` in `admin.media.tsx` alongside the others.

```bash
npx tsc --noEmit && npm run dev
```

Confirm: uploading a JPG shows the explanatory rejection message; uploading a real PNG under 400px tall shows the height-rejection message; uploading a valid PNG or SVG succeeds and renders in the preview chip.

- [ ] **Step 4: Commit**

```bash
git add src/lib/media/logo.server.ts src/components/admin/LogoUploader.tsx src/routes/admin.media.tsx
git commit -m "feat: add logo upload with PNG/SVG-only validation and JPG rejection message

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 18: Creator upload token generation (TDD) + CRUD + panel

**Files:**
- Create: `src/lib/media/upload-tokens.ts`
- Create: `src/lib/media/upload-tokens.test.ts`
- Create: `src/lib/media/upload-tokens.server.ts`
- Create: `src/components/admin/CreatorLinkPanel.tsx`
- Modify: `src/routes/admin.media.tsx` (render `<CreatorLinkPanel>`)

**Interfaces:**
- Produces: `generateUploadToken()`, `hashUploadToken(rawToken)` (pure); `createUploadToken`, `listUploadTokens`, `revokeUploadToken` (`createServerFn`s).
- Consumes: `UploadTokenRow` (Task 1). Consumed by `/send/[token]` (Task 20).

- [ ] **Step 1: Write the failing tests for the pure token module**

Create `src/lib/media/upload-tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateUploadToken, hashUploadToken } from "./upload-tokens";

describe("generateUploadToken", () => {
  it("generates a URL-safe token with no padding characters", () => {
    const token = generateUploadToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(32);
  });

  it("generates a different token on every call", () => {
    expect(generateUploadToken()).not.toBe(generateUploadToken());
  });
});

describe("hashUploadToken", () => {
  it("is deterministic for the same input", async () => {
    expect(await hashUploadToken("abc123")).toBe(await hashUploadToken("abc123"));
  });

  it("produces different hashes for different tokens", async () => {
    expect(await hashUploadToken("token-a")).not.toBe(await hashUploadToken("token-b"));
  });

  it("never returns the raw token itself", async () => {
    expect(await hashUploadToken("my-raw-token")).not.toBe("my-raw-token");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- upload-tokens
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure module**

Create `src/lib/media/upload-tokens.ts`:

```ts
/**
 * Creator upload token generation and hashing (spec, "The creator upload
 * link"). The raw token is shown to the member exactly once, embedded in
 * the /send/[token] URL they copy and send; only its hash is ever
 * persisted (upload_tokens.token_hash — schema's own comment: "store a
 * hash, never the raw token").
 */
export function generateUploadToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashUploadToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- upload-tokens
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Implement the token CRUD mutations**

Create `src/lib/media/upload-tokens.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import type { UploadTokenRow } from "@/lib/supabase/types";

export const listUploadTokens = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: tokens, error } = await supabase
      .from("upload_tokens")
      .select("*")
      .eq("member_id", data.memberId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return tokens as UploadTokenRow[];
  });

/** Returns the raw token exactly once -- it's never retrievable again after this call returns. */
export const createUploadToken = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; maxFiles?: number; expiresInDays?: number }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const rawToken = generateUploadToken();
    const tokenHash = await hashUploadToken(rawToken);
    const expiresAt = new Date(Date.now() + (data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString();

    const { data: row, error } = await supabase
      .from("upload_tokens")
      .insert({
        member_id: data.memberId,
        token_hash: tokenHash,
        created_by_user_id: userData.user.id,
        expires_at: expiresAt,
        max_files: data.maxFiles ?? 5,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return { token: row as UploadTokenRow, rawToken };
  });

export const revokeUploadToken = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("upload_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 6: Implement the panel**

Create `src/components/admin/CreatorLinkPanel.tsx`:

```tsx
import { useState } from "react";
import { createUploadToken, revokeUploadToken } from "@/lib/media/upload-tokens.server";
import type { UploadTokenRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

function tokenStatus(token: UploadTokenRow): "active" | "expired" | "revoked" | "used up" {
  if (token.revoked_at) return "revoked";
  if (new Date(token.expires_at) < new Date()) return "expired";
  if (token.used_count >= token.max_files) return "used up";
  return "active";
}

export function CreatorLinkPanel({ memberId, initialTokens }: { memberId: string; initialTokens: UploadTokenRow[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [freshLink, setFreshLink] = useState<string | null>(null);

  async function onCreate() {
    const { token, rawToken } = await createUploadToken({ data: { memberId } });
    setTokens((prev) => [token, ...prev]);
    setFreshLink(`${window.location.origin}/send/${rawToken}`);
  }

  async function onRevoke(id: string) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)));
    await revokeUploadToken({ data: { id } });
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Send a creator an upload link</h2>
      <p className="text-xs text-muted-foreground">
        Good for 7 days, up to 5 files. You review everything before it goes on your profile.
      </p>
      <Button type="button" className="mt-3 h-11" onClick={onCreate}>
        Create a new link
      </Button>

      {freshLink && (
        <p role="status" className="mt-3 rounded-md border border-open/40 bg-open/10 p-3 text-sm">
          Copy and send this link — it won't be shown again: <span className="break-all font-mono">{freshLink}</span>
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {tokens.map((token) => (
          <li key={token.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            <span>
              {tokenStatus(token)} — {token.used_count}/{token.max_files} used, expires {new Date(token.expires_at).toLocaleDateString()}
            </span>
            {tokenStatus(token) === "active" && (
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => onRevoke(token.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 7: Wire it into the media route and verify manually**

Add a `listUploadTokens` loader call to `admin.media.tsx` and render `<CreatorLinkPanel>`.

```bash
npx tsc --noEmit && npm run dev
```

Confirm: creating a link shows the raw URL once, the list shows its status, and revoking it flips its status to "revoked."

- [ ] **Step 8: Commit**

```bash
git add src/lib/media/upload-tokens.ts src/lib/media/upload-tokens.test.ts src/lib/media/upload-tokens.server.ts src/components/admin/CreatorLinkPanel.tsx src/routes/admin.media.tsx
git commit -m "feat: add creator-upload token generation, revocation, and the link panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 19: Email-trigger seam

**Files:**
- Create: `src/lib/email/send.ts`

**Interfaces:**
- Produces: `TransactionalEmailPayload`, `sendTransactionalEmail(payload)`. Consumed by `creator-upload.server.ts` (Task 20) and `hours-stale-cron.server.ts` (Task 28).
- Consumes: nothing.

- [ ] **Step 1: Implement the seam**

Create `src/lib/email/send.ts`:

```ts
/**
 * The Resend-calling implementation for every transactional email lives in
 * the Contact Form + Resend phase — the very next phase in this build
 * sequence. This file only defines the payload shape and the call sites
 * this phase is responsible for firing (this plan's Decisions 17–18):
 * "Creator uploads to a gallery -> the member" and "Hours stale past 90
 * days -> the member." The other three of the spec's five triggers belong
 * to Guild Admin ("Member invited") or the Contact Form phase (both
 * "Contact form submitted" rows) and are not called from anywhere in this
 * plan.
 *
 * This throws deliberately, rather than silently succeeding as a no-op --
 * a no-op would look like working code and isn't. Every call site in this
 * plan wraps the call in try/catch and logs-and-continues, so an upload or
 * a stale-hours cron run still succeeds today even though the email itself
 * doesn't yet.
 */
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string };

export async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void> {
  throw new Error(
    `sendTransactionalEmail() is not implemented yet (trigger: "${payload.trigger}"). ` +
      "Wire this up in the Contact Form + Resend phase — see docs/member-profiles.md, 'Transactional email'.",
  );
}
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/send.ts
git commit -m "feat: add the transactional-email trigger seam for the next phase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 20: `/send/[token]` creator upload page + rate limiting

**Files:**
- Create: `src/lib/media/creator-upload.server.ts`
- Create: `src/routes/send.$token.tsx`
- Modify: `wrangler.jsonc`, `wrangler.staging.jsonc` (add the `ratelimits` binding)

**Interfaces:**
- Produces: `submitCreatorUpload(formData)` — `createServerFn`, no auth, token validated server-side against its hash using the service-role client (RLS blocks all public access to `upload_tokens`).
- Consumes: `hashUploadToken` (Task 18), `validateUploadedImage`/`stripImageMetadata` (Tasks 11–12), `sendTransactionalEmail` (Task 19), `getSupabaseServiceRoleClient` (Phase 3, unchanged).

- [ ] **Step 1: Add the rate-limit binding**

In `wrangler.jsonc`, add a `ratelimits` array (Cloudflare's native Worker rate-limiting primitive — this plan's Decision 14):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ie-brewers-guild",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts",
  "ratelimits": [
    {
      "name": "CREATOR_UPLOAD_RATE_LIMITER",
      "namespace_id": "1001",
      "simple": { "limit": 5, "period": 60 }
    }
  ]
}
```

In `wrangler.staging.jsonc`, add the same block with a different `namespace_id` (arbitrary, just distinct from production's):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ie-brewers-guild-staging",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts",
  "ratelimits": [
    {
      "name": "CREATOR_UPLOAD_RATE_LIMITER",
      "namespace_id": "2001",
      "simple": { "limit": 5, "period": 60 }
    }
  ]
}
```

This limits any single token to 5 upload attempts per 60 seconds — "Rate-limit per token... this endpoint is reachable by anyone holding a link" (spec).

- [ ] **Step 2: Regenerate the Worker env types so `env.CREATOR_UPLOAD_RATE_LIMITER` type-checks**

```bash
npx wrangler types
```

Expected: `worker-configuration.d.ts` now declares `CREATOR_UPLOAD_RATE_LIMITER` on `Env`.

- [ ] **Step 3: Implement the server function**

Create `src/lib/media/creator-upload.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { sendTransactionalEmail } from "@/lib/email/send";

/**
 * No auth by design (spec: "the token never touches a client-side Supabase
 * call") -- everything here runs on the service-role client, since RLS
 * blocks all public access to upload_tokens outright. This function is the
 * one place that's allowed to bypass that block, and only after
 * independently re-validating the token itself.
 */
export const submitCreatorUpload = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    const rawToken = String(formData.get("token") ?? "");
    const creatorName = String(formData.get("creatorName") ?? "").trim();
    const creditRequested = formData.get("creditRequested") === "true";
    const permissionAccepted = formData.get("permissionAccepted") === "true";
    const file = formData.get("file");

    if (!rawToken) throw new Error("Missing token.");
    if (!creatorName) throw new Error("Enter your name or handle.");
    if (!permissionAccepted) throw new Error("You must confirm you have permission to share this file.");
    if (!(file instanceof File)) throw new Error("No file provided.");

    const supabase = await getSupabaseServiceRoleClient();
    const tokenHash = await hashUploadToken(rawToken);

    const { data: token, error: tokenError } = await supabase
      .from("upload_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError || !token) throw new Error("This upload link is invalid.");
    if (token.revoked_at) throw new Error("This upload link has been revoked.");
    if (new Date(token.expires_at) < new Date()) throw new Error("This upload link has expired.");
    if (token.used_count >= token.max_files) throw new Error("This upload link has reached its file limit.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({ bytes, claimedMimeType: file.type, allowSvg: false });
    if (!validation.valid) throw new Error(validation.reason);

    const stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    const storagePath = `${token.member_id}/creator-${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("member-media")
      .upload(storagePath, stripped, { contentType: validation.detectedMimeType });
    if (uploadError) throw new Error(uploadError.message);

    const { data: asset, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        member_id: token.member_id,
        storage_path: storagePath,
        kind: "image",
        mime_type: validation.detectedMimeType,
        byte_size: stripped.byteLength,
        original_filename: file.name,
        source: "creator_upload",
        upload_token_id: token.id,
        creator_name: creatorName,
        creator_credit: creditRequested,
        permission_accepted_at: new Date().toISOString(),
        review_status: "pending", // Never straight into the gallery, never onto a live profile (spec).
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    await supabase.from("upload_tokens").update({ used_count: token.used_count + 1 }).eq("id", token.id);

    try {
      await sendTransactionalEmail({
        trigger: "creator_upload_pending",
        memberId: token.member_id,
        assetId: asset.id as string,
        creatorName: creditRequested ? creatorName : null,
      });
    } catch (err) {
      console.error("sendTransactionalEmail(creator_upload_pending) failed", err);
    }

    return { ok: true as const };
  });
```

- [ ] **Step 4: Implement the route, applying the rate limiter before calling the server function**

Create `src/routes/send.$token.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { submitCreatorUpload } from "@/lib/media/creator-upload.server";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * No auth. The rate limiter itself lives here, at the request boundary,
 * rather than inside submitCreatorUpload -- a server.handlers POST gives a
 * clean point to check env.CREATOR_UPLOAD_RATE_LIMITER before the
 * createServerFn's own body ever runs.
 */
export const Route = createFileRoute("/send/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { env } = await import("cloudflare:workers");
        const rateLimiter = (env as { CREATOR_UPLOAD_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } })
          .CREATOR_UPLOAD_RATE_LIMITER;
        const { success } = (await rateLimiter?.limit({ key: params.token })) ?? { success: true };
        if (!success) {
          return new Response("Too many upload attempts. Try again in a minute.", { status: 429 });
        }
        const formData = await request.formData();
        formData.set("token", params.token);
        try {
          await submitCreatorUpload({ data: formData });
          return new Response(null, { status: 204 });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Upload failed.", { status: 400 });
        }
      },
    },
  },
  head: () => ({ meta: [{ title: "Share a photo — IE Brewers Guild" }] }),
  component: SendPage,
});

function SendPage() {
  const { token } = Route.useParams();
  const [creatorName, setCreatorName] = useState("");
  const [creditRequested, setCreditRequested] = useState(false);
  const [permissionAccepted, setPermissionAccepted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setStatus("sending");
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("creatorName", creatorName);
    formData.set("creditRequested", String(creditRequested));
    formData.set("permissionAccepted", String(permissionAccepted));
    formData.set("file", file);

    const response = await fetch(`/send/${token}`, { method: "POST", body: formData });
    if (!response.ok) {
      setStatus("error");
      setErrorMessage(await response.text());
      return;
    }
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl text-foreground">Thanks — got it.</h1>
        <p className="mt-2 text-sm text-muted-foreground">The member will review it before it goes on their profile.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-2xl text-foreground">Share a photo or video</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="creator-name">Your name or handle</Label>
          <Input id="creator-name" required value={creatorName} onChange={(e) => setCreatorName(e.target.value)} className="mt-1 h-11" />
        </div>

        <label className="flex min-h-11 items-center gap-2">
          <Checkbox checked={creditRequested} onCheckedChange={(checked) => setCreditRequested(checked === true)} />
          <span>Credit me by name on the profile</span>
        </label>

        <div>
          <Label htmlFor="creator-file">File</Label>
          <input
            id="creator-file"
            type="file"
            required
            accept="image/png,image/jpeg"
            className="mt-1 block h-11 w-full"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <label className="flex min-h-11 items-start gap-2">
          <Checkbox checked={permissionAccepted} onCheckedChange={(checked) => setPermissionAccepted(checked === true)} />
          <span className="text-sm">I took this photo/video (or have the rights to share it) and give permission to use it on this profile.</span>
        </label>

        {status === "error" && errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={!permissionAccepted || status === "sending"} className="h-11 w-full">
          {status === "sending" ? "Sending…" : "Send"}
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Verify manually**

```bash
npm run build:staging
```

(The `ratelimits` binding only works under `wrangler dev`/a real Worker, not plain `vite dev` — confirm the build succeeds, then confirm the form itself renders correctly under `npm run dev`, and defer exercising the rate limiter itself to a staging deploy.)

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc wrangler.staging.jsonc worker-configuration.d.ts src/lib/media/creator-upload.server.ts src/routes/send.\$token.tsx
git commit -m "feat: add /send/[token] with per-token rate limiting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 21: Pending-review tray (artboard G, part 5)

**Files:**
- Create: `src/lib/media/review-tray.server.ts`
- Create: `src/components/admin/ReviewTray.tsx`
- Modify: `src/routes/admin.media.tsx` (render `<ReviewTray>`)

**Interfaces:**
- Produces: `listPendingMedia(memberId)`, `approvePendingMedia(id)`, `rejectPendingMedia(id)` — `createServerFn`s.
- Consumes: `MediaAssetRow` (Task 1).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/media/review-tray.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MediaAssetRow } from "@/lib/supabase/types";

export const listPendingMedia = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: assets, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("member_id", data.memberId)
      .eq("review_status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return assets as MediaAssetRow[];
  });

export const approvePendingMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("media_assets").update({ review_status: "approved" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Kept as a row (review_status: "rejected"), not deleted -- preserves the permission-acceptance record. */
export const rejectPendingMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("media_assets").update({ review_status: "rejected" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the component**

Create `src/components/admin/ReviewTray.tsx`:

```tsx
import { useState } from "react";
import { approvePendingMedia, rejectPendingMedia } from "@/lib/media/review-tray.server";
import type { MediaAssetRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

export function ReviewTray({ initialPending }: { initialPending: MediaAssetRow[] }) {
  const [pending, setPending] = useState(initialPending);

  async function onApprove(id: string) {
    setPending((prev) => prev.filter((a) => a.id !== id));
    await approvePendingMedia({ data: { id } });
  }

  async function onReject(id: string) {
    setPending((prev) => prev.filter((a) => a.id !== id));
    await rejectPendingMedia({ data: { id } });
  }

  if (pending.length === 0) return null;

  return (
    <section aria-label="Pending review">
      <h2 className="text-lg font-medium text-foreground">Waiting for your review ({pending.length})</h2>
      <ul className="mt-3 space-y-3">
        {pending.map((asset) => (
          <li key={asset.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            <img src={`/api/member-media/${asset.id}`} alt="" className="h-16 w-16 rounded-md object-cover" />
            <div className="flex-1 text-sm">
              <p>From {asset.creator_name ?? "someone with your upload link"}</p>
              <p className="text-xs text-muted-foreground">{asset.creator_credit ? "Wants credit on the profile" : "No credit requested"}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" size="sm" className="h-9" onClick={() => onApprove(asset.id)}>
                Approve
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => onReject(asset.id)}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the media route and verify manually**

Add a `listPendingMedia` loader call to `admin.media.tsx` and render `<ReviewTray>` at the top of the page (above the gallery, since it's the thing most likely to need attention).

```bash
npx tsc --noEmit && npm run dev
```

Submit a file through `/send/[token]` (Task 20), then confirm it appears in the review tray, and that Approve moves it into the gallery grid.

- [ ] **Step 4: Commit**

```bash
git add src/lib/media/review-tray.server.ts src/components/admin/ReviewTray.tsx src/routes/admin.media.tsx
git commit -m "feat: add the pending creator-upload review tray

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 22: Publish-gate pure logic (TDD)

**Files:**
- Create: `src/lib/hours/publish-gate.ts`
- Create: `src/lib/hours/publish-gate.test.ts`

**Interfaces:**
- Produces: `HoursConfirmationBadge`, `computeHoursConfirmationBadge(hoursConfirmedAt, now?)`, `isEveryAppearanceInThePast(appearanceStartTimes, now?)`. Consumed by `PublishGateDialog.tsx` (Task 23).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hours/publish-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeHoursConfirmationBadge, isEveryAppearanceInThePast } from "./publish-gate";

describe("computeHoursConfirmationBadge", () => {
  it("is never_confirmed for a null timestamp (imported members must not see a stale warning)", () => {
    expect(computeHoursConfirmationBadge(null)).toEqual({ kind: "never_confirmed" });
  });

  it("is recently_confirmed for a timestamp within 90 days", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const confirmedAt = new Date("2026-05-01T00:00:00Z").toISOString();
    expect(computeHoursConfirmationBadge(confirmedAt, now)).toEqual({ kind: "recently_confirmed", confirmedAt });
  });

  it("is stale for a timestamp more than 90 days old", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const confirmedAt = new Date("2026-01-01T00:00:00Z").toISOString();
    const result = computeHoursConfirmationBadge(confirmedAt, now);
    expect(result.kind).toBe("stale");
    if (result.kind === "stale") expect(result.daysAgo).toBeGreaterThan(90);
  });

  it("is exactly at the boundary still recently_confirmed at 90 days", () => {
    const confirmedAt = new Date("2026-01-01T00:00:00Z").toISOString();
    const now = new Date(new Date(confirmedAt).getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(computeHoursConfirmationBadge(confirmedAt, now).kind).toBe("recently_confirmed");
  });
});

describe("isEveryAppearanceInThePast", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("is true when there are no appearances at all", () => {
    expect(isEveryAppearanceInThePast([], now)).toBe(true);
  });

  it("is true when every appearance is in the past", () => {
    expect(isEveryAppearanceInThePast(["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"], now)).toBe(true);
  });

  it("is false when at least one appearance is in the future", () => {
    expect(isEveryAppearanceInThePast(["2026-01-01T00:00:00Z", "2026-12-01T00:00:00Z"], now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- publish-gate
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/hours/publish-gate.ts`:

```ts
const STALE_THRESHOLD_DAYS = 90;

export type HoursConfirmationBadge =
  | { kind: "never_confirmed" }
  | { kind: "recently_confirmed"; confirmedAt: string }
  | { kind: "stale"; confirmedAt: string; daysAgo: number };

/**
 * The three-way distinction the spec calls out explicitly (spec, "Hours
 * and the publish gate" + "Migrating the existing members"): null means
 * "never asked," never "stale" -- imported members must never see the
 * stale-hours warning for something they were never asked to do.
 */
export function computeHoursConfirmationBadge(hoursConfirmedAt: string | null, now: Date = new Date()): HoursConfirmationBadge {
  if (!hoursConfirmedAt) {
    return { kind: "never_confirmed" };
  }

  const confirmedAtMs = new Date(hoursConfirmedAt).getTime();
  const daysAgo = Math.floor((now.getTime() - confirmedAtMs) / (24 * 60 * 60 * 1000));

  if (daysAgo > STALE_THRESHOLD_DAYS) {
    return { kind: "stale", confirmedAt: hoursConfirmedAt, daysAgo };
  }
  return { kind: "recently_confirmed", confirmedAt: hoursConfirmedAt };
}

/** Mobile members have no weekly hours -- their publish gate warns if every listed appearance is already past. */
export function isEveryAppearanceInThePast(appearanceStartTimes: string[], now: Date = new Date()): boolean {
  if (appearanceStartTimes.length === 0) return true;
  return appearanceStartTimes.every((start) => new Date(start).getTime() < now.getTime());
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- publish-gate
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/publish-gate.ts src/lib/hours/publish-gate.test.ts
git commit -m "feat: add the hours-confirmation three-way distinction and appearance check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 23: Publish gate mutation + dialog (artboard H)

**Files:**
- Create: `src/lib/hours/publish-gate.server.ts`
- Create: `src/components/admin/PublishGateDialog.tsx`
- Modify: `src/routes/admin.tsx` (pass `<PublishGateDialog>` into `AdminShell`'s `publishSlot`)

**Interfaces:**
- Produces: `publishMemberProfile(memberId)`, `unpublishMemberProfile(memberId)` — `createServerFn`s. `<PublishGateDialog>` — the read-only hours-review dialog + confirmation checkbox (producer/allied) or appearance-calendar warning (mobile).
- Consumes: `computeHoursConfirmationBadge`/`isEveryAppearanceInThePast` (Task 22), `HoursRow`/`SpecialHoursRow`/`EventRow` (Task 1).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/hours/publish-gate.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";

/**
 * Sets status AND hours_confirmed_at together, in one update (spec: "Set it
 * to now whenever the member ticks the confirmation box and publishes").
 * The members_enforce_owner_write_limits trigger permits draft<->published
 * for a non-guild-admin, so this needs no special privilege.
 */
export const publishMemberProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const now = new Date().toISOString();
    const { error } = await supabase.from("members").update({ status: "published", hours_confirmed_at: now }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { publishedAt: now };
  });

/** Beyond the spec's explicit ask (this plan's Decision 20) -- lets a member take their page temporarily offline. */
export const unpublishMemberProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ status: "draft" }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the dialog**

Create `src/components/admin/PublishGateDialog.tsx`:

```tsx
import { useState } from "react";
import { publishMemberProfile, unpublishMemberProfile } from "@/lib/hours/publish-gate.server";
import { computeHoursConfirmationBadge, isEveryAppearanceInThePast } from "@/lib/hours/publish-gate";
import type { HoursRow, MemberStatus, MemberType, SpecialHoursRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Producer/Allied variant: shows hours read-only, gates on a confirmation
 * checkbox. Mobile variant: no weekly hours exist at all, so the gate
 * instead warns if every listed appearance is already in the past (spec,
 * "Hours and the publish gate", last paragraph).
 */
export function PublishGateDialog({
  memberId,
  memberType,
  status,
  hoursConfirmedAt,
  hours,
  specialHours,
  appearanceStartTimes,
}: {
  memberId: string;
  memberType: MemberType;
  status: MemberStatus;
  hoursConfirmedAt: string | null;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
  appearanceStartTimes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);

  const badge = computeHoursConfirmationBadge(hoursConfirmedAt);
  const isMobile = memberType === "mobile";
  const allPast = isMobile && isEveryAppearanceInThePast(appearanceStartTimes);

  async function onPublish() {
    await publishMemberProfile({ data: { memberId } });
    setCurrentStatus("published");
    setOpen(false);
    setConfirmed(false);
  }

  async function onUnpublish() {
    await unpublishMemberProfile({ data: { memberId } });
    setCurrentStatus("draft");
  }

  if (currentStatus === "published") {
    return (
      <div className="flex items-center justify-between gap-3">
        {badge.kind === "stale" && (
          <p role="alert" className="text-sm text-warn">
            Hours confirmed {badge.daysAgo} days ago — worth a check.
          </p>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto h-11" onClick={onUnpublish}>
          Move back to draft
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="h-11 w-full">
          Publish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isMobile ? "Review your appearances" : "Review your hours"}</DialogTitle>
        </DialogHeader>

        {isMobile ? (
          allPast ? (
            <p role="alert" className="text-sm text-warn">
              Every listed appearance is in the past — visitors won't see anything upcoming. You can still publish, but
              consider adding a date first.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">You have at least one upcoming appearance listed.</p>
          )
        ) : (
          <ul className="space-y-1 text-sm">
            {WEEKDAYS.map((label, weekday) => {
              const rows = hours.filter((row) => row.weekday === weekday);
              return (
                <li key={weekday} className="flex justify-between border-b border-border py-1">
                  <span>{label}</span>
                  <span>
                    {rows.length === 0
                      ? "Not set"
                      : rows.map((row) => (row.is_closed ? "Closed" : `${row.opens_at}–${row.closes_at}`)).join(", ")}
                  </span>
                </li>
              );
            })}
            {specialHours.length > 0 && (
              <li className="pt-2 text-xs text-muted-foreground">{specialHours.length} holiday/one-off change(s) on file.</li>
            )}
          </ul>
        )}

        {!isMobile && (
          <label className="mt-4 flex min-h-11 items-start gap-2">
            <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
            <span className="text-sm">These hours are correct as of today.</span>
          </label>
        )}

        <DialogFooter>
          <Button type="button" disabled={!isMobile && !confirmed} className="h-11 w-full" onClick={onPublish}>
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire it into the admin layout**

In `src/routes/admin.tsx`, load the fields `PublishGateDialog` needs (member status/type/hours_confirmed_at, weekly hours, special hours, and upcoming event start times) in the layout's own loader, and pass `<PublishGateDialog {...props} />` as `AdminShell`'s `publishSlot`. This is the one piece of data every admin section's `beforeLoad`-established context needs to share, so it belongs at the layout level rather than duplicated per child route.

- [ ] **Step 4: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Confirm: the Publish button opens the dialog, hours render read-only, the Publish button inside the dialog stays disabled until the checkbox is ticked (producer/allied), publishing flips status and closes the dialog, and "Move back to draft" appears afterward. Switch a test member to `mobile` and confirm the dialog shows the appearance-calendar variant instead.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/publish-gate.server.ts src/components/admin/PublishGateDialog.tsx src/routes/admin.tsx
git commit -m "feat: add the publish gate dialog with the producer/mobile variants

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 24: Member theme picker (artboard K)

**Files:**
- Create: `src/lib/theme/member-theme.server.ts`
- Create: `src/routes/admin.theme.tsx`
- Create: `src/components/admin/ThemePicker.tsx`

**Interfaces:**
- Produces: `updateMemberTheme(memberId, theme)` — `createServerFn`.
- Consumes: `MEMBER_THEMES`/`MemberThemeName`/`getMemberThemeHex` from Phase 3's `src/lib/theme/member-themes.ts` (imported, never redefined — per that plan's own stated requirement).

- [ ] **Step 1: Implement the mutation**

Create `src/lib/theme/member-theme.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberThemeName } from "@/lib/theme/member-themes";

export const updateMemberTheme = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; theme: MemberThemeName }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ theme: data.theme }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the route and picker**

Create `src/routes/admin.theme.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { ThemePicker } from "@/components/admin/ThemePicker";

export const Route = createFileRoute("/admin/theme")({
  loader: async ({ context }) => getMemberBasics({ data: { memberId: context.memberId } }),
  component: ThemeRoute,
});

function ThemeRoute() {
  const member = Route.useLoaderData();
  return <ThemePicker memberId={member.id} currentTheme={member.theme} />;
}
```

Create `src/components/admin/ThemePicker.tsx`:

```tsx
import { useState } from "react";
import { MEMBER_THEMES, type MemberThemeName } from "@/lib/theme/member-themes";
import { updateMemberTheme } from "@/lib/theme/member-theme.server";

/** A fixed set of 8, never a free color picker (spec, "Profile hero and theme"). */
export function ThemePicker({ memberId, currentTheme }: { memberId: string; currentTheme: MemberThemeName }) {
  const [selected, setSelected] = useState(currentTheme);

  function onSelect(theme: MemberThemeName) {
    setSelected(theme);
    void updateMemberTheme({ data: { memberId, theme } });
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Theme</h2>
      <p className="text-xs text-muted-foreground">Colours your primary button, highlights, and cover band when there's no cover photo.</p>
      <div role="radiogroup" aria-label="Member theme" className="mt-3 grid grid-cols-4 gap-3">
        {MEMBER_THEMES.map((theme) => (
          <button
            key={theme.name}
            type="button"
            role="radio"
            aria-checked={selected === theme.name}
            aria-label={theme.label}
            className={`flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border-2 text-xs text-white ${
              selected === theme.name ? "border-foreground" : "border-transparent"
            }`}
            style={{ backgroundColor: theme.hex }}
            onClick={() => onSelect(theme.name)}
          >
            {selected === theme.name && "✓"}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/theme`, confirm exactly 8 swatches render (matching `MEMBER_THEMES`), clicking one marks it selected and persists across a reload.

- [ ] **Step 4: Commit**

```bash
git add src/lib/theme/member-theme.server.ts src/routes/admin.theme.tsx src/components/admin/ThemePicker.tsx
git commit -m "feat: add the fixed 8-option member theme picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 25: Events hand-entry CRUD + status overlays (artboard M, part 1)

**Files:**
- Create: `src/lib/events/events.server.ts`
- Create: `src/routes/admin.events.tsx`
- Create: `src/components/admin/EventsEditor.tsx`

**Interfaces:**
- Produces: `listEvents(memberId)`, `createEvent`, `updateEvent`, `deleteEvent`, `setEventOverlay`, `clearEventOverlay`, `toggleEventHidden` — `createServerFn`s.
- Consumes: `EventRow`/`EventOverlayStatus` (Task 1).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/events/events.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { EventOverlayStatus, EventRow } from "@/lib/supabase/types";

export const listEvents = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: events, error } = await supabase.from("events").select("*").eq("member_id", data.memberId).order("starts_at");
    if (error) throw new Error(error.message);
    return events as EventRow[];
  });

type HandEnteredEventInput = {
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  city: string | null;
  address: string | null;
};

export const createEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string } & HandEnteredEventInput) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        member_id: data.memberId,
        source: "manual",
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        venue_name: data.venueName,
        city: data.city,
        address: data.address,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as EventRow;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; patch: Partial<HandEnteredEventInput> }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("events")
      .update({
        starts_at: data.patch.startsAt,
        ends_at: data.patch.endsAt,
        venue_name: data.patch.venueName,
        city: data.patch.city,
        address: data.patch.address,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * A direct, member-initiated overlay write -- unlike the ICS re-sync path
 * (Task 26), this is exactly where overlay_* columns are SUPPOSED to be
 * written. Contrast against buildEventUpsertRows, which must never include
 * them.
 */
export const setEventOverlay = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; status: EventOverlayStatus; newStartsAt?: string; note?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("events")
      .update({
        overlay_status: data.status,
        overlay_starts_at: data.status === "rescheduled" ? data.newStartsAt ?? null : null,
        overlay_note: data.note ?? null,
        overlay_set_at: new Date().toISOString(),
      })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const clearEventOverlay = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("events")
      .update({ overlay_status: null, overlay_starts_at: null, overlay_note: null, overlay_set_at: null })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const toggleEventHidden = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; isHidden: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("events").update({ is_hidden: data.isHidden }).eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the route and editor**

Create `src/routes/admin.events.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { listEvents } from "@/lib/events/events.server";
import { EventsEditor } from "@/components/admin/EventsEditor";

export const Route = createFileRoute("/admin/events")({
  loader: async ({ context }) => listEvents({ data: { memberId: context.memberId } }),
  component: EventsRoute,
});

function EventsRoute() {
  const events = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return <EventsEditor memberId={memberId} initialEvents={events} />;
}
```

Create `src/components/admin/EventsEditor.tsx`:

```tsx
import { useState } from "react";
import {
  clearEventOverlay,
  createEvent,
  deleteEvent,
  setEventOverlay,
  toggleEventHidden,
  updateEvent,
} from "@/lib/events/events.server";
import type { EventOverlayStatus, EventRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OVERLAY_OPTIONS: { value: EventOverlayStatus; label: string }[] = [
  { value: "postponed", label: "Postponed" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "canceled", label: "Canceled" },
];

/** Note fields left null render the event as "at your own address" (spec: venue fields are nullable). */
export function EventsEditor({ memberId, initialEvents }: { memberId: string; initialEvents: EventRow[] }) {
  const [events, setEvents] = useState(initialEvents);

  async function onAdd() {
    const created = await createEvent({
      data: { memberId, startsAt: new Date().toISOString(), endsAt: null, venueName: null, city: null, address: null },
    });
    setEvents((prev) => [...prev, created]);
  }

  function onFieldChange(event: EventRow, patch: Parameters<typeof updateEvent>[0]["data"]["patch"]) {
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...toEventRowPatch(patch) } : e)));
    void updateEvent({ data: { id: event.id, patch } });
  }

  function toEventRowPatch(patch: Parameters<typeof updateEvent>[0]["data"]["patch"]) {
    return {
      starts_at: patch.startsAt,
      ends_at: patch.endsAt,
      venue_name: patch.venueName,
      city: patch.city,
      address: patch.address,
    };
  }

  async function onDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await deleteEvent({ data: { id } });
  }

  async function onOverlayChange(event: EventRow, status: EventOverlayStatus | "none") {
    if (status === "none") {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, overlay_status: null, overlay_starts_at: null, overlay_note: null, overlay_set_at: null } : e)));
      await clearEventOverlay({ data: { eventId: event.id } });
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, overlay_status: status } : e)));
    await setEventOverlay({ data: { eventId: event.id, status } });
  }

  async function onToggleHidden(event: EventRow) {
    const next = !event.is_hidden;
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_hidden: next } : e)));
    await toggleEventHidden({ data: { eventId: event.id, isHidden: next } });
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Events</h2>
        <Button type="button" className="h-11" onClick={onAdd}>
          Add an event
        </Button>
      </div>
      <ul className="mt-4 space-y-4">
        {events
          .filter((event) => event.source === "manual")
          .map((event) => (
            <li key={event.id} className="rounded-md border border-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`starts-${event.id}`}>Starts</Label>
                  <Input
                    id={`starts-${event.id}`}
                    type="datetime-local"
                    defaultValue={event.starts_at.slice(0, 16)}
                    className="mt-1 h-11"
                    onBlur={(e) => onFieldChange(event, { startsAt: new Date(e.target.value).toISOString() })}
                  />
                </div>
                <div>
                  <Label htmlFor={`venue-${event.id}`}>Venue (leave blank for your own address)</Label>
                  <Input
                    id={`venue-${event.id}`}
                    defaultValue={event.venue_name ?? ""}
                    className="mt-1 h-11"
                    onBlur={(e) => onFieldChange(event, { venueName: e.target.value || null })}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div>
                  <Label htmlFor={`overlay-${event.id}`}>Status</Label>
                  <Select defaultValue={event.overlay_status ?? "none"} onValueChange={(value) => onOverlayChange(event, value as EventOverlayStatus | "none")}>
                    <SelectTrigger id={`overlay-${event.id}`} className="mt-1 h-11 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Normal</SelectItem>
                      {OVERLAY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox checked={event.is_hidden} onCheckedChange={() => onToggleHidden(event)} />
                  <span>Hide from profile</span>
                </label>

                <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" onClick={() => onDelete(event.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Visit `/admin/events`, add an event, set its status to Postponed then back to Normal, toggle Hide, delete it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/events/events.server.ts src/routes/admin.events.tsx src/components/admin/EventsEditor.tsx
git commit -m "feat: add hand-entry event CRUD and status overlay controls

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 26: ICS sync pure logic (TDD, overlay-preservation test)

**Files:**
- Create: `src/lib/events/ics-sync.ts`
- Create: `src/lib/events/ics-sync.test.ts`
- Modify: `package.json` (add `ical.js`)

**Interfaces:**
- Produces: `parseIcsFeedForTag(icsText, syncTag)`, `EventUpsertRow`, `buildEventUpsertRows(memberId, calendarConnectionId, parsedEvents)`. Consumed by `calendar-connection.server.ts` (Task 27) and `ics-refresh-cron.server.ts` (Task 29).
- Consumes: `ical.js` (this plan's Decision 13 — pure JS, no Node dependencies, runs identically in Workers).

- [ ] **Step 1: Install `ical.js`**

```bash
npm install ical.js
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/events/ics-sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildEventUpsertRows, parseIcsFeedForTag } from "./ics-sync";

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-1@example.com
DTSTART:20261010T190000Z
DTEND:20261010T220000Z
SUMMARY:Trivia Night [guild]
END:VEVENT
BEGIN:VEVENT
UID:event-2@example.com
DTSTART:20261012T120000Z
DTEND:20261012T140000Z
SUMMARY:Dentist appointment
END:VEVENT
BEGIN:VEVENT
UID:event-3@example.com
DTSTART:20261015T170000Z
DTEND:20261015T210000Z
SUMMARY:Release Party
CATEGORIES:guild,release
END:VEVENT
END:VCALENDAR`;

describe("parseIcsFeedForTag", () => {
  it("keeps only events matching the sync tag by title", () => {
    const ids = parseIcsFeedForTag(SAMPLE_ICS, "guild").map((e) => e.externalEventId).sort();
    expect(ids).toEqual(["event-1@example.com", "event-3@example.com"]);
  });

  it("excludes an event with no matching title or category", () => {
    const events = parseIcsFeedForTag(SAMPLE_ICS, "guild");
    expect(events.some((e) => e.externalEventId === "event-2@example.com")).toBe(false);
  });

  it("matches on category as well as title", () => {
    expect(parseIcsFeedForTag(SAMPLE_ICS, "release").map((e) => e.externalEventId)).toEqual(["event-3@example.com"]);
  });
});

describe("buildEventUpsertRows", () => {
  it("never includes any overlay_* column -- the single reason overlays survive a re-sync", () => {
    const events = parseIcsFeedForTag(SAMPLE_ICS, "guild");
    const rows = buildEventUpsertRows("member-1", "conn-1", events);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("overlay_status");
      expect(Object.keys(row)).not.toContain("overlay_starts_at");
      expect(Object.keys(row)).not.toContain("overlay_note");
      expect(Object.keys(row)).not.toContain("overlay_set_at");
    }
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
npm test -- ics-sync
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the module**

Create `src/lib/events/ics-sync.ts`:

```ts
import ICAL from "ical.js";

export type ParsedIcsEvent = {
  externalEventId: string;
  startsAt: string;
  endsAt: string | null;
  summary: string;
};

/**
 * Sync is tag-based opt-in (spec, "Events"): only events whose title or
 * category contains the member's chosen sync_tag are imported, since most
 * calendars contain private entries pulling everything would publish.
 */
export function parseIcsFeedForTag(icsText: string, syncTag: string): ParsedIcsEvent[] {
  const jcalData = ICAL.parse(icsText);
  const component = new ICAL.Component(jcalData);
  const vevents = component.getAllSubcomponents("vevent");
  const needle = syncTag.trim().toLowerCase();

  return vevents
    .map((vevent) => new ICAL.Event(vevent))
    .filter((event) => {
      const summary = (event.summary ?? "").toLowerCase();
      const categoriesProp = event.component.getFirstProperty("categories");
      const categories: string[] = categoriesProp ? (categoriesProp.getValues() as string[]).map((c) => c.toLowerCase()) : [];
      return summary.includes(needle) || categories.some((category) => category.includes(needle));
    })
    .map((event) => ({
      externalEventId: event.uid,
      startsAt: event.startDate.toJSDate().toISOString(),
      endsAt: event.endDate ? event.endDate.toJSDate().toISOString() : null,
      summary: event.summary ?? "",
    }));
}

export type EventUpsertRow = {
  member_id: string;
  calendar_connection_id: string;
  source: "ics";
  external_event_id: string;
  starts_at: string;
  ends_at: string | null;
};

/**
 * Builds exactly the columns a re-sync is allowed to write. Deliberately
 * excludes overlay_status/overlay_starts_at/overlay_note/overlay_set_at --
 * a re-sync must reconcile on (calendar_connection_id, external_event_id)
 * and never touch those columns (spec, "Events": "A re-sync must reconcile
 * by event id and preserve the overlay"). This is the single reason the
 * overlay lives in this table, so getting it wrong here is expensive.
 */
export function buildEventUpsertRows(memberId: string, calendarConnectionId: string, parsedEvents: ParsedIcsEvent[]): EventUpsertRow[] {
  return parsedEvents.map((event) => ({
    member_id: memberId,
    calendar_connection_id: calendarConnectionId,
    source: "ics" as const,
    external_event_id: event.externalEventId,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
  }));
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npm test -- ics-sync
```

Expected: PASS, 4 tests. If `ical.js`'s exact API surface (e.g. `event.component.getFirstProperty`) differs slightly from what's written here, adjust against the installed version's own types/docs rather than guessing further — the shape above matches its documented `ICAL.Event`/`ICAL.Component` API as of this plan's writing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/events/ics-sync.ts src/lib/events/ics-sync.test.ts package.json package-lock.json
git commit -m "feat: add ICS parsing by sync tag with overlay-safe upsert rows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 27: Calendar connection UI (artboard M, part 2 — ICS URL + manual refresh)

**Files:**
- Create: `src/lib/events/calendar-connection.server.ts`
- Create: `src/components/admin/CalendarConnectionPanel.tsx`
- Modify: `src/routes/admin.events.tsx` (render `<CalendarConnectionPanel>`)

**Interfaces:**
- Produces: `getCalendarConnection(memberId)`, `saveIcsConnection`, `refreshIcsConnectionNow` — `createServerFn`s. `syncOneIcsConnection(supabase, connection)` — a plain exported function shared with Task 29's cron.
- Consumes: `parseIcsFeedForTag`/`buildEventUpsertRows` (Task 26), `CalendarConnectionRow` (Task 1).

- [ ] **Step 1: Implement the shared sync function + mutations**

Create `src/lib/events/calendar-connection.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { buildEventUpsertRows, parseIcsFeedForTag } from "@/lib/events/ics-sync";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

export const getCalendarConnection = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: connection } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("member_id", data.memberId)
      .eq("provider", "ics")
      .maybeSingle();
    return (connection as CalendarConnectionRow | null) ?? null;
  });

export const saveIcsConnection = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; icsUrl: string; syncTag: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: existing } = await supabase
      .from("calendar_connections")
      .select("id")
      .eq("member_id", data.memberId)
      .eq("provider", "ics")
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("calendar_connections")
        .update({ ics_url: data.icsUrl, sync_tag: data.syncTag, sync_status: "ok", last_sync_error: null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id as string };
    }

    const { data: created, error } = await supabase
      .from("calendar_connections")
      .insert({ member_id: data.memberId, provider: "ics", ics_url: data.icsUrl, sync_tag: data.syncTag })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

/**
 * Fetches the ICS feed, parses it by tag, and upserts on (calendar_connection_id,
 * external_event_id) -- WITHOUT ever touching overlay_* (buildEventUpsertRows'
 * return type structurally excludes them). Shared verbatim between the
 * manual "Refresh now" button (below) and the scheduled cron (Task 29) --
 * one sync implementation, two callers with different privilege levels
 * appropriate to their context (a signed-in member's own session here; the
 * service-role client in the cron, which has no session at all).
 */
export async function syncOneIcsConnection(supabase: SupabaseClient, connection: CalendarConnectionRow): Promise<void> {
  if (!connection.ics_url || !connection.sync_tag) return;

  try {
    const response = await fetch(connection.ics_url);
    if (!response.ok) throw new Error(`ICS feed responded with ${response.status}`);

    const icsText = await response.text();
    const parsedEvents = parseIcsFeedForTag(icsText, connection.sync_tag);
    const rows = buildEventUpsertRows(connection.member_id, connection.id, parsedEvents);

    if (rows.length > 0) {
      const { error: upsertError } = await supabase.from("events").upsert(rows, { onConflict: "calendar_connection_id,external_event_id" });
      if (upsertError) throw upsertError;
    }

    await supabase.from("calendar_connections").update({ last_synced_at: new Date().toISOString(), last_sync_error: null, sync_status: "ok" }).eq("id", connection.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("calendar_connections").update({ last_sync_error: message, sync_status: "failing" }).eq("id", connection.id);
  }
}

export const refreshIcsConnectionNow = createServerFn({ method: "POST" })
  .inputValidator((data: { connectionId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: connection, error } = await supabase.from("calendar_connections").select("*").eq("id", data.connectionId).single();
    if (error || !connection) throw new Error("Calendar connection not found.");
    await syncOneIcsConnection(supabase, connection as CalendarConnectionRow);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the panel**

Create `src/components/admin/CalendarConnectionPanel.tsx`:

```tsx
import { useState } from "react";
import { refreshIcsConnectionNow, saveIcsConnection } from "@/lib/events/calendar-connection.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CalendarConnectionPanel({ memberId, initialConnection }: { memberId: string; initialConnection: CalendarConnectionRow | null }) {
  const [connection, setConnection] = useState(initialConnection);
  const [icsUrl, setIcsUrl] = useState(initialConnection?.ics_url ?? "");
  const [syncTag, setSyncTag] = useState(initialConnection?.sync_tag ?? "");
  const [refreshing, setRefreshing] = useState(false);

  async function onSave() {
    const { id } = await saveIcsConnection({ data: { memberId, icsUrl, syncTag } });
    setConnection((prev) => ({
      id,
      member_id: memberId,
      provider: "ics",
      google_calendar_id: null,
      ics_url: icsUrl,
      sync_tag: syncTag,
      last_synced_at: prev?.last_synced_at ?? null,
      last_sync_error: null,
      sync_status: "ok",
    }));
  }

  async function onRefreshNow() {
    if (!connection) return;
    setRefreshing(true);
    await refreshIcsConnectionNow({ data: { connectionId: connection.id } });
    setRefreshing(false);
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Calendar sync (ICS)</h2>
      <p className="text-xs text-muted-foreground">
        Paste your calendar's public ICS subscription URL. Only events whose title or category contains your sync tag
        are imported.
      </p>
      <div className="mt-3 max-w-md space-y-3">
        <div>
          <Label htmlFor="ics-url">ICS subscription URL</Label>
          <Input id="ics-url" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} className="mt-1 h-11" onBlur={onSave} />
        </div>
        <div>
          <Label htmlFor="sync-tag">Sync tag</Label>
          <Input id="sync-tag" value={syncTag} onChange={(e) => setSyncTag(e.target.value)} className="mt-1 h-11" placeholder="e.g. guild" onBlur={onSave} />
        </div>
        {connection && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {connection.sync_status === "failing"
                ? `Last sync failed: ${connection.last_sync_error}`
                : connection.last_synced_at
                  ? `Last synced ${new Date(connection.last_synced_at).toLocaleString()}`
                  : "Not yet synced"}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={refreshing} onClick={onRefreshNow}>
              {refreshing ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the events route and verify manually**

Add a `getCalendarConnection` loader call to `admin.events.tsx` and render `<CalendarConnectionPanel>` above `<EventsEditor>`.

```bash
npx tsc --noEmit && npm run dev
```

Confirm: saving an ICS URL + sync tag persists across reload, and "Refresh now" runs without throwing (it needs network egress to a real ICS URL to actually pull events — a public ICS test feed works fine for this check).

- [ ] **Step 4: Commit**

```bash
git add src/lib/events/calendar-connection.server.ts src/components/admin/CalendarConnectionPanel.tsx src/routes/admin.events.tsx
git commit -m "feat: add ICS calendar connection UI with manual refresh

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 28: Hours-stale confirmation token (TDD) + migration + confirm route

**Files:**
- Create: `src/lib/hours/confirm-token.ts`
- Create: `src/lib/hours/confirm-token.test.ts`
- Create: `supabase/migrations/<timestamp>_members_hours_stale_notice.sql`
- Create: `src/routes/api.confirm-hours.$token.ts`

**Interfaces:**
- Produces: `signHoursConfirmToken(memberId, secret, now?)`, `verifyHoursConfirmToken(token, secret, now?)`. New column `members.hours_stale_notice_sent_at`. The no-login, one-click confirmation route.
- Consumes: `getSupabaseServiceRoleClient` (Phase 3, unchanged — this route has no session).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hours/confirm-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signHoursConfirmToken, verifyHoursConfirmToken } from "./confirm-token";

const SECRET = "test-secret-value";
const MEMBER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("signHoursConfirmToken / verifyHoursConfirmToken", () => {
  it("round-trips a valid token", async () => {
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET);
    expect(await verifyHoursConfirmToken(token, SECRET)).toEqual({ valid: true, memberId: MEMBER_ID });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET);
    expect((await verifyHoursConfirmToken(token, "wrong-secret")).valid).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET);
    const [payload, signature] = token.split(".");
    expect((await verifyHoursConfirmToken(`${payload}x.${signature}`, SECRET)).valid).toBe(false);
  });

  it("rejects an expired token", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET, now);
    const later = new Date("2026-03-01T00:00:00Z"); // more than 30 days later
    expect(await verifyHoursConfirmToken(token, SECRET, later)).toEqual({ valid: false, reason: "This link has expired." });
  });

  it("rejects a malformed token", async () => {
    expect((await verifyHoursConfirmToken("not-a-real-token", SECRET)).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- confirm-token
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/hours/confirm-token.ts`:

```ts
/**
 * Stateless, HMAC-signed one-click hours-confirmation token (spec: "the
 * link itself sets the timestamp, no login"). No new database row needed
 * -- a signed token carries everything the confirm route needs to verify
 * (this plan's Decision 16).
 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacSign(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signHoursConfirmToken(memberId: string, secret: string, now: Date = new Date()): Promise<string> {
  const expiresAtMs = now.getTime() + TOKEN_TTL_MS;
  const payload = `${memberId}.${expiresAtMs}`;
  const signature = await hmacSign(secret, payload);
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(signature)}`;
}

export async function verifyHoursConfirmToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ valid: true; memberId: string } | { valid: false; reason: string }> {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "Malformed token." };
  const [payloadPart, signaturePart] = parts;

  let payload: string;
  try {
    payload = new TextDecoder().decode(fromBase64Url(payloadPart));
  } catch {
    return { valid: false, reason: "Malformed token." };
  }

  const expectedSignature = await hmacSign(secret, payload);
  if (!timingSafeEqual(expectedSignature, fromBase64Url(signaturePart))) {
    return { valid: false, reason: "Invalid signature." };
  }

  const [memberId, expiresAtMsRaw] = payload.split(".");
  const expiresAtMs = Number(expiresAtMsRaw);
  if (!memberId || !Number.isFinite(expiresAtMs)) return { valid: false, reason: "Malformed token." };
  if (now.getTime() > expiresAtMs) return { valid: false, reason: "This link has expired." };

  return { valid: true, memberId };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- confirm-token
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the migration**

```bash
npx supabase migration new members_hours_stale_notice
```

Write it:

```sql
-- Tracks the last time the hours-stale-past-90-days email was sent for a
-- member, so the daily cron (hours-stale-cron.server.ts) sends exactly one
-- notice per staleness episode instead of one every day. Not in the
-- members_enforce_owner_write_limits trigger's blocklist -- this column is
-- only ever written by the service-role cron, and members never edit it
-- directly, so no trigger change is needed.
alter table public.members
  add column hours_stale_notice_sent_at timestamptz;
```

```bash
npx supabase db push
```

- [ ] **Step 6: Add the `HOURS_CONFIRM_SECRET` Worker secret**

```bash
npx wrangler secret put HOURS_CONFIRM_SECRET
```

(For local dev, add `HOURS_CONFIRM_SECRET=` to `.dev.vars` with any long random string.)

- [ ] **Step 7: Implement the confirm route**

Create `src/routes/api.confirm-hours.$token.ts`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { verifyHoursConfirmToken } from "@/lib/hours/confirm-token";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const Route = createFileRoute("/api/confirm-hours/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { env } = await import("cloudflare:workers");
        const secret = (env as { HOURS_CONFIRM_SECRET?: string }).HOURS_CONFIRM_SECRET;
        if (!secret) return new Response("Server misconfigured.", { status: 500 });

        const result = await verifyHoursConfirmToken(params.token, secret);
        if (!result.valid) return new Response(result.reason, { status: 400 });

        const supabase = await getSupabaseServiceRoleClient();
        const { error } = await supabase.from("members").update({ hours_confirmed_at: new Date().toISOString() }).eq("id", result.memberId);
        if (error) return new Response(error.message, { status: 500 });

        throw redirect({ href: "/" });
      },
    },
  },
});
```

- [ ] **Step 8: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hours/confirm-token.ts src/lib/hours/confirm-token.test.ts supabase/migrations src/routes/api.confirm-hours.\$token.ts
git commit -m "feat: add the no-login one-click hours-confirmation link

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 29: Scheduled Cron Worker wiring (ICS refresh + hours-stale notice)

**Files:**
- Create: `src/lib/events/ics-refresh-cron.server.ts`
- Create: `src/lib/hours/hours-stale-cron.server.ts`
- Modify: `src/server.ts` (add the `scheduled` export)
- Modify: `wrangler.jsonc`, `wrangler.staging.jsonc` (add `triggers.crons`)

**Interfaces:**
- Produces: `refreshAllIcsConnections()`, `sendHoursStaleNotices()` — plain async functions, called from `src/server.ts`'s new `scheduled` handler.
- Consumes: `getSupabaseServiceRoleClient` (Phase 3), `syncOneIcsConnection` (Task 27), `signHoursConfirmToken` (Task 28), `sendTransactionalEmail` (Task 19).

- [ ] **Step 1: Add the cron triggers**

In `wrangler.jsonc`, add:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ie-brewers-guild",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts",
  "ratelimits": [
    { "name": "CREATOR_UPLOAD_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 5, "period": 60 } }
  ],
  "triggers": {
    "crons": ["*/15 * * * *", "0 13 * * *"]
  }
}
```

`*/15 * * * *` — the scheduled ICS refresh every fifteen minutes (spec, "Events"). `0 13 * * *` — the daily hours-stale check (this plan's Decision 15), once a day at 1pm UTC.

Add the identical `triggers` block to `wrangler.staging.jsonc` (keep its own `ratelimits` entry from Task 20 unchanged).

- [ ] **Step 2: Implement the ICS refresh cron function**

Create `src/lib/events/ics-refresh-cron.server.ts`:

```ts
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { syncOneIcsConnection } from "@/lib/events/calendar-connection.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

/**
 * The scheduled half of ICS sync (spec: "a scheduled refresh every fifteen
 * minutes"). Runs with no user session at all -- the service-role client
 * is correct here, unlike everywhere else in this plan (Decision 5).
 */
export async function refreshAllIcsConnections(): Promise<void> {
  const supabase = await getSupabaseServiceRoleClient();
  const { data: connections, error } = await supabase.from("calendar_connections").select("*").eq("provider", "ics");
  if (error || !connections) {
    console.error("refreshAllIcsConnections: failed to list connections", error);
    return;
  }
  for (const connection of connections as CalendarConnectionRow[]) {
    await syncOneIcsConnection(supabase, connection);
  }
}
```

- [ ] **Step 3: Implement the hours-stale cron function**

Create `src/lib/hours/hours-stale-cron.server.ts`:

```ts
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { signHoursConfirmToken } from "@/lib/hours/confirm-token";
import { sendTransactionalEmail } from "@/lib/email/send";
import type { MemberRow } from "@/lib/supabase/types";

/**
 * Sends exactly one notice per staleness episode (this plan's Decision 15):
 * hours_confirmed_at more than 90 days old, and either never notified or
 * notified before the current hours_confirmed_at (so re-confirming hours
 * naturally re-arms the next notice 90 days later). Members who have never
 * confirmed hours (hours_confirmed_at is null) are explicitly excluded --
 * the spec's "different, gentler prompt" for that case is a UI affordance
 * (PublishGateDialog / the admin's left-rail notice), not an email.
 */
export async function sendHoursStaleNotices(): Promise<void> {
  const supabase = await getSupabaseServiceRoleClient();
  const staleThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: members, error } = await supabase
    .from("members")
    .select("*")
    .eq("status", "published")
    .not("hours_confirmed_at", "is", null)
    .lt("hours_confirmed_at", staleThreshold);

  if (error || !members) {
    console.error("sendHoursStaleNotices: failed to list members", error);
    return;
  }

  const { env } = await import("cloudflare:workers");
  const secret = (env as { HOURS_CONFIRM_SECRET?: string }).HOURS_CONFIRM_SECRET;
  if (!secret) {
    console.error("sendHoursStaleNotices: HOURS_CONFIRM_SECRET is not set");
    return;
  }

  for (const member of members as MemberRow[]) {
    const alreadyNotifiedForThisEpisode =
      member.hours_stale_notice_sent_at &&
      member.hours_confirmed_at &&
      new Date(member.hours_stale_notice_sent_at) >= new Date(member.hours_confirmed_at);
    if (alreadyNotifiedForThisEpisode) continue;

    const token = await signHoursConfirmToken(member.id, secret);
    const siteOrigin = "https://iebrewersguild.org"; // no in-flight request to read an origin from in a cron -- the production domain is hardcoded here rather than left as a TODO.

    try {
      await sendTransactionalEmail({
        trigger: "hours_stale",
        memberId: member.id,
        confirmUrl: `${siteOrigin}/api/confirm-hours/${token}`,
      });
    } catch (err) {
      console.error("sendTransactionalEmail(hours_stale) failed", err);
    }

    await supabase.from("members").update({ hours_stale_notice_sent_at: new Date().toISOString() }).eq("id", member.id);
  }
}
```

- [ ] **Step 4: Wire both into `src/server.ts`'s `scheduled` export**

Open `src/server.ts`. Add a `scheduled` handler to the default export, alongside the existing `fetch`:

```ts
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // ...unchanged, existing implementation above...
  },

  async scheduled(controller: { cron: string }, _env: unknown, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    if (controller.cron === "*/15 * * * *") {
      const { refreshAllIcsConnections } = await import("./lib/events/ics-refresh-cron.server");
      ctx.waitUntil(refreshAllIcsConnections());
    } else if (controller.cron === "0 13 * * *") {
      const { sendHoursStaleNotices } = await import("./lib/hours/hours-stale-cron.server");
      ctx.waitUntil(sendHoursStaleNotices());
    }
  },
};
```

- [ ] **Step 5: Verify the project type-checks and builds**

```bash
npx tsc --noEmit && npm run build
```

Expected: no new errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/events/ics-refresh-cron.server.ts src/lib/hours/hours-stale-cron.server.ts src/server.ts wrangler.jsonc wrangler.staging.jsonc
git commit -m "feat: wire the 15-minute ICS refresh and daily hours-stale cron triggers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
### Task 30: Links & contact editor (artboard R)

**Files:**
- Create: `src/lib/links/member-links.server.ts`
- Create: `src/routes/admin.links.tsx`
- Create: `src/components/admin/LinksContactEditor.tsx`

**Interfaces:**
- Produces: `listMemberLinks(memberId)`, `upsertMemberLink`, `deleteMemberLink`, `updateMemberContact` — `createServerFn`s.
- Consumes: `MemberLinkRow`/`MemberLinkKind` (Task 1/Phase 3, unchanged).

- [ ] **Step 1: Implement the mutations**

Create `src/lib/links/member-links.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberLinkKind, MemberLinkRow } from "@/lib/supabase/types";

export const listMemberLinks = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: links, error } = await supabase.from("member_links").select("*").eq("member_id", data.memberId).order("sort_order");
    if (error) throw new Error(error.message);
    return links as MemberLinkRow[];
  });

type LinkPatch = Partial<Pick<MemberLinkRow, "kind" | "label" | "url" | "sort_order">>;

export const upsertMemberLink = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id?: string; patch: LinkPatch }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    if (data.id) {
      const { error } = await supabase.from("member_links").update(data.patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabase
      .from("member_links")
      .insert({ member_id: data.memberId, kind: data.patch.kind ?? "other", url: data.patch.url ?? "", label: data.patch.label ?? null, sort_order: data.patch.sort_order ?? 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteMemberLink = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("member_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Phone and contact_email live here, not in the Basics editor (this plan's
 * Decision 8) -- artboard R is titled "links and contact."
 */
export const updateMemberContact = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: { phone?: string | null; contact_email?: string | null } }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update(data.patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const LINK_KINDS: MemberLinkKind[] = ["website", "instagram", "facebook", "tiktok", "taplist", "menu", "press_kit", "catalog", "other"];
```

- [ ] **Step 2: Implement the route and editor**

Create `src/routes/admin.links.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { listMemberLinks } from "@/lib/links/member-links.server";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";

export const Route = createFileRoute("/admin/links")({
  loader: async ({ context }) => {
    const [links, member] = await Promise.all([
      listMemberLinks({ data: { memberId: context.memberId } }),
      getMemberBasics({ data: { memberId: context.memberId } }),
    ]);
    return { links, member };
  },
  component: LinksRoute,
});

function LinksRoute() {
  const { links, member } = Route.useLoaderData();
  return <LinksContactEditor memberId={member.id} initialLinks={links} phone={member.phone} contactEmail={member.contact_email} memberType={member.member_type} />;
}
```

Create `src/components/admin/LinksContactEditor.tsx`:

```tsx
import { useState } from "react";
import { deleteMemberLink, LINK_KINDS, updateMemberContact, upsertMemberLink } from "@/lib/links/member-links.server";
import type { MemberLinkRow, MemberType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LinksContactEditor({
  memberId,
  initialLinks,
  phone,
  contactEmail,
  memberType,
}: {
  memberId: string;
  initialLinks: MemberLinkRow[];
  phone: string | null;
  contactEmail: string | null;
  memberType: MemberType;
}) {
  const [links, setLinks] = useState(initialLinks);

  async function onAdd() {
    const { id } = await upsertMemberLink({ data: { memberId, patch: { kind: "website", url: "", sort_order: links.length } } });
    setLinks((prev) => [...prev, { id, member_id: memberId, kind: "website", label: null, url: "", sort_order: prev.length }]);
  }

  function onFieldChange(link: MemberLinkRow, patch: Parameters<typeof upsertMemberLink>[0]["data"]["patch"]) {
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...patch } : l)));
    void upsertMemberLink({ data: { memberId, id: link.id, patch } });
  }

  async function onRemove(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    await deleteMemberLink({ data: { id } });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-lg font-medium text-foreground">Contact</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-phone">{memberType === "mobile" ? "Booking phone" : memberType === "allied" ? "Sales phone" : "Phone"}</Label>
            <Input
              id="contact-phone"
              type="tel"
              defaultValue={phone ?? ""}
              className="mt-1 h-11"
              onBlur={(e) => void updateMemberContact({ data: { memberId, patch: { phone: e.target.value || null } } })}
            />
          </div>
          {memberType === "allied" && (
            <div>
              <Label htmlFor="contact-email">Sales email</Label>
              <Input
                id="contact-email"
                type="email"
                defaultValue={contactEmail ?? ""}
                className="mt-1 h-11"
                onBlur={(e) => void updateMemberContact({ data: { memberId, patch: { contact_email: e.target.value || null } } })}
              />
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">Links</h2>
          <Button type="button" className="h-11" onClick={onAdd}>
            Add a link
          </Button>
        </div>
        <ul className="mt-3 space-y-3">
          {links.map((link) => (
            <li key={link.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
              <Select defaultValue={link.kind} onValueChange={(value) => onFieldChange(link, { kind: value as MemberLinkRow["kind"] })}>
                <SelectTrigger className="h-11 sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input defaultValue={link.url} placeholder="https://…" className="h-11 flex-1" onBlur={(e) => onFieldChange(link, { url: e.target.value })} />
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => onRemove(link.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Confirm: phone renders with a type-appropriate label, sales email only shows for Allied Members, and adding/editing/removing a link works.

- [ ] **Step 4: Commit**

```bash
git add src/lib/links/member-links.server.ts src/routes/admin.links.tsx src/components/admin/LinksContactEditor.tsx
git commit -m "feat: add the links and contact editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 31: Allied Member discount editor

**Files:**
- Create: `src/lib/members/discount.server.ts`
- Create: `src/routes/admin.discount.tsx`
- Create: `src/components/admin/DiscountEditor.tsx`

**Interfaces:**
- Produces: `updateMemberDiscount(memberId, patch)` — `createServerFn`.
- Consumes: `isFieldVisibleForMemberType` (Task 8), `getMemberBasics` (Task 9).

- [ ] **Step 1: Implement the mutation**

Create `src/lib/members/discount.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow } from "@/lib/supabase/types";

type DiscountPatch = Partial<Pick<MemberRow, "discount_percent" | "discount_no_fixed_percent" | "discount_redeem_text">>;

/**
 * Percent XOR "no fixed percentage" (spec, "Allied Member discount"): if
 * discount_no_fixed_percent is being set true, discount_percent is cleared
 * in the same patch, and vice versa -- never both set at once.
 */
export const updateMemberDiscount = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: DiscountPatch }) => data)
  .handler(async ({ data }) => {
    const patch = { ...data.patch };
    if (patch.discount_no_fixed_percent === true) patch.discount_percent = null;
    if (typeof patch.discount_percent === "number") patch.discount_no_fixed_percent = false;

    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update(patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the route and editor**

Create `src/routes/admin.discount.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { DiscountEditor } from "@/components/admin/DiscountEditor";

export const Route = createFileRoute("/admin/discount")({
  loader: async ({ context }) => getMemberBasics({ data: { memberId: context.memberId } }),
  component: DiscountRoute,
});

function DiscountRoute() {
  const member = Route.useLoaderData();
  return <DiscountEditor member={member} />;
}
```

Create `src/components/admin/DiscountEditor.tsx`:

```tsx
import { useState } from "react";
import { updateMemberDiscount } from "@/lib/members/discount.server";
import { isFieldVisibleForMemberType } from "@/lib/members/type-fields";
import type { MemberRow } from "@/lib/supabase/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Only rendered for member_type = allied (spec: "The field only appears
 * for the Allied Member type"). Values are never cleared by a type
 * switch -- this route/component simply doesn't render for other types,
 * and member-basics.server.ts's own patch-only-what-changed model means
 * switching away from allied and back leaves these columns untouched.
 */
export function DiscountEditor({ member }: { member: MemberRow }) {
  const [local, setLocal] = useState(member);

  if (!isFieldVisibleForMemberType(local.member_type, "discount")) {
    return <p className="text-sm text-muted-foreground">This section is only for Allied Members.</p>;
  }

  function save(patch: Parameters<typeof updateMemberDiscount>[0]["data"]["patch"]) {
    setLocal((prev) => ({ ...prev, ...patch }));
    void updateMemberDiscount({ data: { memberId: member.id, patch } });
  }

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-lg font-medium text-foreground">Member discount</h2>
      <p className="text-xs text-muted-foreground">
        The most concrete answer this site has to "what does Guild membership get me" — renders large, right under
        your status block.
      </p>

      <div>
        <Label htmlFor="discount-percent">Discount percentage</Label>
        <Input
          id="discount-percent"
          type="number"
          min={0}
          max={100}
          disabled={local.discount_no_fixed_percent}
          defaultValue={local.discount_percent ?? ""}
          className="mt-1 h-11"
          onBlur={(e) => save({ discount_percent: e.target.value ? Number(e.target.value) : null })}
        />
      </div>

      <label className="flex min-h-11 items-center gap-2">
        <Checkbox checked={local.discount_no_fixed_percent} onCheckedChange={(checked) => save({ discount_no_fixed_percent: checked === true })} />
        <span>No fixed percentage — discounts vary</span>
      </label>

      <div>
        <Label htmlFor="discount-redeem">How members redeem it</Label>
        <Textarea
          id="discount-redeem"
          defaultValue={local.discount_redeem_text ?? ""}
          className="mt-1"
          onBlur={(e) => save({ discount_redeem_text: e.target.value || null })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
npx tsc --noEmit && npm run dev
```

Set a test member to `allied`, confirm the discount editor renders and percent/checkbox are mutually exclusive; switch back to `producer` and confirm the tab shows the "only for Allied Members" message rather than an empty form; switch back to `allied` and confirm the previously-entered values are still there.

- [ ] **Step 4: Commit**

```bash
git add src/lib/members/discount.server.ts src/routes/admin.discount.tsx src/components/admin/DiscountEditor.tsx
git commit -m "feat: add the Allied Member discount editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 32: Desktop rail adaptation for `/admin`

**Files:**
- Modify: `src/components/admin/AdminShell.tsx`

**Interfaces:**
- Modifies `<AdminShell>` in place — no new exports.
- Consumes: nothing new.

Per the spec's own stated build order ("the admin panel ships with phone and desktop layouts together, not desktop first... on a phone the left rail becomes a horizontal tab strip"), this task runs only after every section tab has real content (Tasks 9–31), so the desktop rail is adapting a shell that already has something in it, not an empty scaffold.

- [ ] **Step 1: Add the `md:` breakpoint overrides**

In `src/components/admin/AdminShell.tsx`, replace the `<nav>`, `<main>` wrapper, and Publish-bar `<div>` with:

```tsx
  return (
    <div className="flex min-h-screen flex-col pb-24 md:flex-row md:pb-0">
      <nav
        aria-label="Admin sections"
        className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-6"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted [&.active]:bg-primary/10 [&.active]:text-primary md:w-full"
            activeProps={{ className: "active" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 flex-col">
        <div className="hidden justify-end border-b border-border bg-card px-6 py-3 md:flex">{publishSlot}</div>
        <main className="flex-1 px-4 py-6 md:px-8" data-member-id={memberId}>
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-3 md:hidden">
        {publishSlot}
      </div>
    </div>
  );
```

(`publishSlot` renders twice — once for the desktop top bar, once for the phone-pinned bottom bar — with only one visible at a given breakpoint via `hidden md:flex` / `md:hidden`. `PublishGateDialog`'s own state is self-contained, so rendering it twice is safe; it isn't rendered as two independent dialog instances that could desync, since only one is ever visible/interactive at a time per the responsive CSS.)

- [ ] **Step 2: Verify manually at both widths**

```bash
npm run dev
```

Resize the browser (or use responsive dev tools) below and above the `md` breakpoint. Confirm: phone width shows the horizontal tab strip at top and Publish pinned to the bottom; desktop width shows a left vertical rail and Publish in a top bar instead.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminShell.tsx
git commit -m "feat: add the desktop rail adaptation for the admin shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 33: Accessibility and final audit pass

**Files:**
- Modify: any admin component found lacking, per the checklist below.

**Interfaces:** none new — this task verifies and fixes, it doesn't add features.

Every component built in Tasks 4–32 was written against the Global Constraints' accessibility rules already, so this task is a deliberate re-check pass across the whole surface — not a first pass.

- [ ] **Step 1: 44px tap targets**

Grep for interactive elements missing an explicit height class:

```bash
grep -rLn "h-11\|h-9\|min-h-11" src/components/admin/*.tsx
```

Expected: every file that renders a `<button>`, `<input>`, `<a>`, or a Radix trigger appears in the earlier greps for `h-11`/`min-h-11` (buttons that are visually small, like "Remove"/"Delete" secondary actions, use `size="sm"` at `h-9` deliberately — confirm each `h-9` use is a secondary action next to a primary `h-11` action, per the shadcn `Button` component's own size scale, not a lone undersized primary control).

- [ ] **Step 2: Icon-only controls have `aria-label`**

```bash
grep -rn "aria-label=\"Zoom\|aria-label=\"Remove\|aria-label=\"Delete\|aria-label=\"Revoke" src/components/admin/*.tsx
```

Expected: `CropEditor.tsx`'s zoom buttons, and every icon-only remove/delete/revoke control across `HoursEditor.tsx`, `CarouselEditor.tsx`, `MediaGallery.tsx`, `CreatorLinkPanel.tsx` appear. Any icon-only button not listed needs an `aria-label` added.

- [ ] **Step 3: Real form controls, no clickable divs**

```bash
grep -rn "onClick" src/components/admin/*.tsx | grep -v "<button\|<Button\|Link\|type=\"button\"\|type=\"submit\""
```

Expected: no output, or every match is on an actual `<button>`/`<Button>`/`<Link>` element (this grep is a coarse filter, not a precise one — read each match manually).

- [ ] **Step 4: `tel:`/`mailto:` for contact fields**

The admin's own phone/email inputs (`LinksContactEditor.tsx`) are plain editable `<input type="tel">`/`<input type="email">` fields, not links — the `tel:`/`mailto:` requirement applies to the **public profile's** rendering of these fields (Phase 3's job), not to an editable form control here. Confirm this understanding is correct by re-reading the spec's own line: "phone number as `tel:`, email as `mailto:`" sits under "Layout and breakpoints," which describes the whole site including the public profile — no admin change needed for this one, but note it explicitly so it isn't mistaken for a gap.

- [ ] **Step 5: Contrast**

Manually check `ThemePicker.tsx`'s swatch buttons: white checkmark text (`text-white`) over each of the 8 theme hexes. Phase 3's own spec note states "every value here clears 4.5:1 against white text" for the member-theme table, so no change should be needed — confirm by eye against the rendered swatches in `npm run dev` rather than assuming.

- [ ] **Step 6: Fix anything the above steps found**

Apply whatever specific fixes Steps 1–5 surfaced. (This step has no fixed diff to show, by definition — it depends on what the greps and manual checks above actually find in the executor's own working tree.)

- [ ] **Step 7: Run the full test suite one more time**

```bash
npm test
```

Expected: every test file added across this plan (Tasks 3, 7, 8, 11, 12, 13, 18, 22, 26, 28) passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix: accessibility audit pass across the member admin panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(If Steps 1–5 found nothing to fix, skip this commit — there's nothing to record.)

---

## Self-Review

**1. Spec coverage.** Walking the spec section by section against the task list:

- "Media model" (originals + crop rectangle, creator-upload mechanics, review tray) → Tasks 13–21.
- "Hours and the publish gate" (timestamp not boolean, gate publish not save, 90-day staleness, mobile appearance-calendar variant, three-way never/stale/recent distinction) → Tasks 10, 22, 23, 28, 29.
- "Logos and assets" (PNG/SVG only, EXIF stripping) → Tasks 11, 12, 17.
- "The Guild Trail" → explicitly not built (Global Constraint, Decisions preamble) — matches "nothing new for you there."
- "Allied Member discount" → Task 31.
- "Profile hero and theme" (theme picker) → Task 24. (Tagline cap is Task 9, part of Basics.)
- "Events" (all types, ICS sync, overlay mechanism, reconciliation rule) → Tasks 25, 26, 27, 29.
- "Layout and breakpoints" (admin paragraph: tab strip, stacked radios, side-by-side hour fields with Closed alone, pinned Publish, mobile-first-then-desktop order) → Tasks 4, 9, 10, 32.
- "Accounts, sign-in and joining" (magic link, one `/signin`, role routing, impersonation-compatible plumbing) → Tasks 2–6, Decision 5.
- "Transactional email" (which triggers are this phase's to fire) → Tasks 19, 20, 28–29, Decisions 17–18.
- Schema plan's `members_enforce_owner_write_limits` trigger → respected throughout: no task ever writes `slug`/`dues_received_at`/`approved_at`/`approved_by_user_id`/`trail_eligible`, and `status` only ever moves `draft`⇄`published` (Tasks 23, and the added `unpublishMemberProfile`).
- Required list items 1–14 from the task brief → items 1–2 (Tasks 5–6, 2 and 4), 3 (Task 9), 4 (Task 10), 5 (Tasks 13–21), 6 (Task 20), 7 (Tasks 22–23), 8 (Tasks 4, 32), 9 (Task 24), 10 (Tasks 25–27, 29), 11 (Task 30), 12 (Task 31), 13 (Tasks 19–20, 28–29), 14 (Task 33 plus every component built along the way).

No gaps found.

**2. Placeholder scan.** Searched this plan's own text for "TBD," "implement later," "add appropriate," "similar to Task N," and bare prose describing code without showing it. The one intentional exception — `sendTransactionalEmail()`'s throwing body (Task 19) — is explicitly named and justified in Decision 17 as a cross-phase seam, not a placeholder left unfinished by oversight; it fails loudly rather than pretending to work, which is the opposite of a placeholder. No other instance found.

**3. Type consistency.** Cross-checked names used across task boundaries:
- `CropRect`/`computeCropStyle` — defined in Phase 3's `src/lib/media/crop.ts`, imported (never redefined) by Tasks 13–16.
- `MEMBER_THEMES`/`MemberThemeName`/`getMemberThemeHex` — Phase 3's `src/lib/theme/member-themes.ts`, imported by Task 24.
- `EventUpsertRow`'s five keys (`member_id`, `calendar_connection_id`, `source`, `external_event_id`, `starts_at`, `ends_at`) match exactly what `buildEventUpsertRows` (Task 26) constructs and what `syncOneIcsConnection`'s `.upsert()` call (Task 27) sends — no overlay column anywhere in that type, checked by the test in Task 26 itself.
- `getSupabaseServerClientForRequest` (Task 2) is the exact name every subsequent `.server.ts` file (Tasks 9, 10, 14–18, 20–21, 23, 24, 25, 27, 30, 31) imports — none reimplements client construction.
- `resolveUserRoleAndTarget`'s return type (Task 3) is consumed identically by `require-member-session.server.ts` (Task 4) and `auth.callback.tsx` (Task 5) — same three-branch shape, same field names.
- `MemberFieldKey`/`isFieldVisibleForMemberType` (Task 8) used identically by `BasicsForm.tsx` (Task 9) and `DiscountEditor.tsx` (Task 31).
- `HoursConfirmationBadge`'s three `kind` values (`never_confirmed`/`recently_confirmed`/`stale`) match exactly between Task 22's definition and Task 23's `PublishGateDialog` consumption.

No mismatches found.

