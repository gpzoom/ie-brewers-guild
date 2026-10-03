# Guild Admin (`/guild`, Impersonation, Brand Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Guild's own admin surface — `/guild`, behind Supabase Auth + `is_guild_admin` — covering the member roster with impersonation ("Edit as them"), inquiries triage, a Brand & theme editor that makes the Guild's own site-chrome tokens admin-editable, and supply-category management, on top of the schema and member-admin plumbing the previous four phases already established.

**Architecture:** Two new migrations (`inquiries`, `audit_log`) plus a third (`brand_settings`, a singleton settings row) extend the existing Supabase schema. `/guild` is a new layout route guarded the same way `/admin` is — by reusing `resolveUserRoleAndTarget` from the Member Admin phase — with one child route per screen (roster, inquiries, brand, categories) and a disabled "Applications — SOON" nav entry. Impersonation is a signed, HMAC-verified cookie carrying `{ actorUserId, memberId, startedAt, lastActivityAt }`; the underlying Supabase Auth session never changes during impersonation (it is always, literally, the Guild admin's own session — `auth.uid()` stays the admin's id throughout), so every existing member-admin mutation file's RLS-backed write access keeps working unmodified via the schema's own `is_guild_admin()` policies. A single shared wrapper function, `recordAuditLogIfImpersonating`, is added to each of the ~14 existing session-authenticated member-mutation files as one mechanical call site per file, backed by a Vitest coverage test that fails if any of those files stops importing it. The Brand editor stores one JSON row of the exact CSS custom properties the Brand Design Tokens phase defined, edited only as a shared brand hue plus two independent lightness values (never raw hex, never all sixteen tokens), gated by a hand-written WCAG 2.1 contrast calculator; a new root-route loader reads that row (service-role, since the row's own RLS is guild-admin-only and this read serves the whole public site) and injects it as a `<style>` tag, falling back to the Brand Design Tokens phase's static defaults when no row exists yet.

**Tech Stack:** TanStack Start / TanStack Router (file-based routes, `createServerFn`), Supabase (`@supabase/ssr` session-bound client, `@supabase/supabase-js` service-role client — both already dependencies as of the Member Admin phase), Vitest (existing), Web Crypto (`crypto.subtle`, built in — no new dependency) for the impersonation cookie's HMAC signature, matching this codebase's existing convention for signed tokens. No new npm dependencies are needed anywhere in this plan.

**Spec:** `docs/member-profiles.md` — "Roles", "Joining, for now"/"Joining, later", "Editing the brand from the admin", "Transactional email", "Empty and error states" (the draft/application 404-vs-preview row). Schema: `docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md`. Brand defaults: `docs/superpowers/plans/2026-09-21-brand-design-tokens.md`. Built-on plumbing: `docs/superpowers/plans/2026-09-21-member-admin.md` and `docs/superpowers/plans/2026-09-21-public-member-profile.md`.

## Global Constraints

- Two admin surfaces, not one: the Guild admin (`/guild`) runs the Guild; it is not automatically a member editor. (Spec, "Roles".)
- If a signed-in user has both `profiles.is_guild_admin = true` and a `member_users` row, Guild-admin routing wins — this was already decided by the Member Admin phase (its Decision 2); this plan's `/guild` guard stays consistent with it rather than re-deciding it.
- Every write made while impersonating is logged against the real actor (the Guild admin), never against the member being edited. (Spec, "Editing as a member".)
- The impersonation banner is non-dismissable and appears on every `/admin` screen and every preview of the impersonated member's profile, for the whole duration of the session. (Spec, same section.)
- Impersonation can never change the member's email or sign-in settings. (Spec, same section.)
- Impersonation ends on "Stop" (returning to the roster), on sign-out, and after a short idle timeout. (Spec, same section.)
- The `inquiries` and `audit_log` table shapes given in this plan's own brief are final — no added or removed columns.
- Roster state is read from the real Supabase invite flow: `inviteUserByEmail()` creates the `auth.users` row immediately; "invited, not signed in" vs. "claimed" comes from that user's `last_sign_in_at`, not a new column. (Decision already made.)
- Typefaces are chosen from a curated list of pairings, never a free font field. (Spec, "Editing the brand from the admin".)
- Colour is edited as a brand hue and lightness, with live contrast readouts; the editor refuses to save a fill/text combination under 4.5:1. (Spec, same section.)
- The brand token set is stored as one row of JSON and injected as CSS custom properties at render — never inline styles scattered through components. (Spec, same section.)
- The applications queue screen itself is out of scope. The nav shows a disabled "Applications — SOON" entry; `status` already supports `applied`/`declined` from the existing schema. (Task brief, "Out of scope, explicitly".)
- 44px minimum tap targets, real `<button>`/`<a href>`/`<input><label>`, `aria-label` on icon-only controls, 4.5:1 text contrast — same bar as every prior phase. (Spec, "Layout and breakpoints".)
- `getSupabaseServerClientForRequest()` is bound to one request's cookies and must never be memoized or cached at module scope — restated from the Member Admin phase's own Task 2 warning, because this plan calls it from many new files.
- Use the path alias `@/*` → `./src/*`. (Codebase convention, `tsconfig.json`.)

## Decisions made while filling gaps the spec and prior phases left open

1. **Audit-logging mechanism: approach (b), a shared application-layer wrapper — not a Postgres session-variable trigger.** The brief's approach (a) needs a `set_config()` call and the subsequent RLS-scoped mutation query to land on the *same* underlying Postgres connection/transaction. Over Supabase's REST API this does not hold: every `supabase-js` call (a `.rpc()` call and a later `.from(...).update(...)` call) is its own separate HTTP request to PostgREST, and PostgREST opens one transaction per request — under Supabase's connection pooling (Supavisor/PgBouncer in transaction mode, the default), a second request has no guarantee of reusing the first request's physical connection, so a `SET LOCAL` (transaction-scoped) setting is gone before the second request even starts, and even a session-scoped `SET` (not `SET LOCAL`) only survives if the pooler happens to hand back the same connection, which it is not designed to guarantee. This is a real architectural property of PostgREST-over-a-pooler, not a hypothetical; verifying it further against a live database wouldn't change the conclusion, so this plan does not spend a task trying to make it work. (A real alternative worth naming and rejecting: Supabase's Custom Access Token Hook could inject impersonation state into the JWT itself, which *would* ride along on every single request for free, since PostgREST already turns `request.jwt.claims` into a transaction-local setting from the token on every request. That fixes the connection problem but adds real complexity of its own — forcing a token refresh to start and end impersonation, and re-deriving claims on every refresh — and the brief asks for one of the two named approaches, not a third. Noted here so the rejection is deliberate, not an oversight.)
2. **The wrapper is centered on one already-mandatory choke point, not spread thinly across 14 files by accident.** The Member Admin phase's own Decision 5 already requires every admin mutation to call `getSupabaseServerClientForRequest()` and rely on RLS for authorization — no admin mutation uses any other client. This plan adds exactly one new call, `recordAuditLogIfImpersonating(...)`, immediately after each file's real write, rather than trying to intercept automatically at the client-factory level: a generic Proxy around the Supabase client would need to force `.select()` onto every write to learn the affected row's id, which changes existing call sites' return shapes and is a bigger, riskier change than 14 mechanical one-line additions. Coverage is guaranteed by a Vitest test (Task 21) that reads each of the 14 files off disk and fails if any of them no longer mentions the wrapper — this is the practical, checked substitute for approach (a)'s "guaranteed regardless of which file runs" property.
3. **The impersonation session-state mechanism is a signed, httpOnly cookie**, consistent with how this project's own magic-link session already flows through cookies (`@supabase/ssr`'s `createServerClient`, per the Member Admin phase's Task 2). It is a separate cookie from the Supabase session cookie, HMAC-signed with a new Worker secret (`IMPERSONATION_COOKIE_SECRET`) so it can't be forged or edited client-side, and carries no data more sensitive than two UUIDs and two timestamps.
4. **Idle timeout is 30 minutes of inactivity**, where "activity" is any request that reaches `requireMemberSession` (i.e., navigating between `/admin/*` screens) or any mutation that reaches `recordAuditLogIfImpersonating` (i.e., an actual edit). Both call sites refresh the cookie's `lastActivityAt`. Thirty minutes is long enough that reading through a member's profile before editing it doesn't kick the admin out mid-review, short enough that a Guild admin who walks away from an already-elevated session doesn't leave it silently live for hours.
5. **The underlying Supabase Auth session never changes during impersonation.** `auth.uid()` is the Guild admin's own id for the whole session; impersonation only changes which `memberId` the `/admin` routes load and write against, via `requireMemberSession`'s return value. This is what makes "every write is logged against the real actor" close to free: the actor is never anything other than `auth.uid()`, so there is no risk of accidentally attributing a write to the member.
6. **Blocking email/sign-in changes needs no new code.** None of `/admin`'s existing routes (`admin.basics.tsx`, `admin.links.tsx`, or any other section from the Member Admin phase's file list) expose an auth-email or sign-in field at all — `members.contact_email` is a business contact address, not `auth.users.email`, and no admin route touches `auth.users` or `member_users.user_id`. Confirmed structurally impossible; no blocking logic is added for a path that doesn't exist.
7. **"Preview," in the spec's "every preview" line, is the public `/members/$slug` page rendering a member's own unpublished profile** — the exact gap the Public Member Profile phase flagged and explicitly left open in its own `getMemberProfileData` comment ("this function only ever implements the public-404 half... tracked here, not silently dropped"). This plan closes it: an authenticated member editor or an impersonating Guild admin previewing their own/the impersonated member's unpublished profile sees the page instead of a 404, with the same non-dismissable banner treatment used inside `/admin`.
8. **New member rows created from the roster or from "Set them up as a member" start as `status = 'draft'`**, not the schema's own default of `'applied'`. The spec's "Joining, for now" section describes exactly this path — "the Guild admin creates the member from the roster and sends the invite. The member signs in and gets a draft profile they publish themselves" — so a roster-created row is already past the application stage by construction; `'applied'` is reserved for the future applications queue this phase explicitly does not build.
9. **Slug collision handling is a small, newly-written, DB-backed picker** (`pickUnusedSlug` + a server wrapper that queries `members`), not a reuse of the one-time import script's in-memory `uniqueSlug()` (`scripts/import-existing-members.ts`), because that function's uniqueness set is an in-memory batch of rows being imported together, not the live table a one-at-a-time roster creation needs to check against.
10. **`getWorkerEnv()` is duplicated locally in the new impersonation module rather than exported from `src/lib/supabase/server.ts`.** That file's existing `getWorkerEnv` is a private, two-line helper (`const { env } = await import("cloudflare:workers"); return env as WorkerEnv;`); duplicating it in `src/lib/guild/impersonation.server.ts` with its own narrow local type avoids widening an existing Phase 3/4 file's public API for a one-off need in a later phase.
11. **The brand editor exposes exactly three controls — a shared hue, `--brand`'s lightness, and `--brand-bright`'s lightness — plus the font-pairing picker, not fifteen separate token sliders.** The spec's own wording is "a brand hue and lightness," singular, and the only tokens that actually need a live contrast readout are the two fill colours that carry text (`--brand` with white text, `--brand-bright` with dark `--ink` text); the other fourteen tokens are structural dark/light-ground neutrals whose relationships are fixed by the type system, and building fifteen sliders would recreate exactly the "raw hex picker" complexity the spec says to avoid. Chroma stays fixed at the spec's approved values (0.15 for `--brand`, 0.165 for `--brand-bright`) since the spec never mentions editing it. The stored JSON row still holds the full sixteen-token set (see Decision 12), so the render-time injector never needs a partial/defaults-merge at read time.
12. **The brand JSON column stores all sixteen tokens, keyed by their bare CSS custom-property name minus the leading `--`** (e.g. `"brand-bright"`, not `"--brand-bright"` or a camelCase alias), so the stored value can be emitted as CSS by simply prefixing `--` and joining `name: value;` — a direct, lossless, round-trippable representation of the Brand Design Tokens phase's exact `:root` block. Saving only ever overwrites the `brand` and `brand-bright` keys; the other fourteen are carried through unchanged from the current row (or from the static defaults, on the very first save).
13. **Font pairing is a fixed catalog of five real Google Fonts display/body combinations**, defined once in code (`src/lib/brand/font-pairings.ts`), each with its own `css2` Google Fonts href — not a free-text field, matching the spec's "curated list of pairings" instruction to the letter.
14. **A minimal "Sign out" action is added to both `AdminShell` and the new `GuildShell`, because none exists yet anywhere in the codebase.** The spec requires impersonation to end on sign-out, which is unimplementable if there is no sign-out affordance at all; this plan adds the smallest one that satisfies the rule (one server function clearing both the Supabase session and the impersonation cookie together, one button in each shell) rather than a broader navigation redesign, which is out of scope here.
15. **Roster claim-state lookups call `supabase.auth.admin.getUserById()` once per member that has an owner**, not `listUsers()` with pagination. Every `member_users` row already carries the exact `user_id` to look up, so a paginated scan (the approach the Guild-admin seed script needed when it only had an email to search by) isn't necessary. At the Guild's roster scale (dozens of members, not thousands) this is an acceptable N+1 — worth revisiting only if the roster grows by orders of magnitude.

## File Structure

Pure logic (Vitest, no I/O):
- `src/lib/guild/member-claim-state.ts` — unclaimed / invited-not-signed-in / claimed.
- `src/lib/guild/unique-member-slug.ts` — collision-suffix picker, given a base slug and the slugs already in use.
- `src/lib/guild/impersonation-token.ts` — HMAC sign/verify of the impersonation cookie payload, plus idle-timeout expiry.
- `src/lib/inquiries/confirmation-state.ts` — sent / not-yet-sent / failed-to-send display rule.
- `src/lib/brand/contrast.ts` — OKLab↔linear-sRGB conversion and WCAG 2.1 contrast ratio.
- `src/lib/brand/default-tokens.ts` — the sixteen token names, the static defaults, and the CSS-string builder.

Data access / mutations (server-only):
- `src/lib/supabase/types.ts` — modified (Task 4).
- `src/lib/auth/require-guild-admin-session.server.ts` — new, for `/guild`.
- `src/lib/auth/require-member-session.server.ts` — modified (Task 19), for `/admin`, impersonation-aware.
- `src/lib/auth/sign-out.server.ts` — new (Task 23).
- `src/lib/guild/impersonation.server.ts` — start/stop/read/touch, plus `getMemberDisplayName`.
- `src/lib/guild/audit-log.server.ts` — `recordAuditLogIfImpersonating`.
- `src/lib/guild/create-member.server.ts` — `createMemberRecord`, shared by roster and inquiries.
- `src/lib/guild/roster.server.ts`, `invite-member.server.ts`, `member-admin-actions.server.ts`.
- `src/lib/guild/inquiries.server.ts`.
- `src/lib/brand/brand-settings.server.ts`.
- `src/lib/categories/categories.server.ts`.
- `src/lib/members/member-profile.server.ts` — modified (Task 22).
- `src/lib/email/send.ts` — modified (Task 16, adds the `member_invited` payload variant).

Routes:
- `src/routes/guild.tsx` (layout), `guild.index.tsx`, `guild.roster.tsx`, `guild.inquiries.tsx`, `guild.brand.tsx`, `guild.categories.tsx`.
- `src/routes/admin.tsx` — modified (Task 19).
- `src/routes/members.$slug.tsx` — modified (Task 22).
- `src/routes/__root.tsx` — modified (Task 28).

Presentation:
- `src/components/guild/GuildShell.tsx`, `RosterTable.tsx`, `CreateMemberDialog.tsx`, `InquiriesTable.tsx`, `BrandEditor.tsx`, `CategoriesEditor.tsx`, `ProfilePreviewBanner.tsx`.
- `src/components/admin/AdminShell.tsx` — modified (Task 20).

Existing files also modified: `wrangler.jsonc`, `wrangler.staging.jsonc`, `.env.example` (Task 30).

---

### Task 1: `inquiries` migration

**Files:**
- Create: a new migration via `supabase migration new inquiries_table`

**Interfaces:**
- Produces: `public.inquiries` — the exact shape from the task brief and `docs/member-profiles.md`'s "inquiries" section.
- Consumes: `public.is_guild_admin()` (schema plan, Task 2).

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new inquiries_table
```

- [ ] **Step 2: Write the migration**

```sql
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  message text,
  wants_membership_info boolean not null default false,
  status text not null default 'open' check (status in ('open', 'handled')),
  confirmation_sent_at timestamptz,
  handled_by_user_id uuid references auth.users (id),
  handled_at timestamptz,
  converted_member_id uuid references public.members (id)
);

create index inquiries_status_idx on public.inquiries (status);
create index inquiries_created_at_idx on public.inquiries (created_at);

alter table public.inquiries enable row level security;

-- No public select or insert policy at all (spec: "no public select at
-- all... Inserts go through the Worker with the service key, never a
-- client-side Supabase call" -- same pattern as upload_tokens and
-- calendar_connections in the schema plan). The public contact-form
-- endpoint that inserts here is the Contact Form + Resend phase's own
-- Worker route, using the service-role key, which bypasses RLS entirely.
create policy "inquiries: guild admins can read every row"
  on public.inquiries for select
  to authenticated
  using (public.is_guild_admin());

create policy "inquiries: guild admins can update every row"
  on public.inquiries for update
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
```

No delete policy is created — the spec never asks for one, and an append-only inquiries table (closed via `status = 'handled'`, never removed) is the safer default. Nothing in this plan needs to delete a row here.

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the check constraint and RLS**

```bash
npx supabase db execute --sql "
insert into inquiries (name, email, status) values ('Test', 'test@example.com', 'closed');
"
```

Expected: fails on the `inquiries_status_check` constraint (`closed` isn't `open`/`handled`). Then:

```bash
npx supabase db execute --sql "
set role anon;
select count(*) from inquiries;
"
```

Expected: fails with a row-level security error, not a count — confirming anon has no select policy at all.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add the inquiries table and its guild-admin-only RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `audit_log` migration

**Files:**
- Create: a new migration via `supabase migration new audit_log_table`

**Interfaces:**
- Produces: `public.audit_log` — the exact shape from the task brief.
- Consumes: `public.is_guild_admin()`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new audit_log_table
```

- [ ] **Step 2: Write the migration**

```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users (id),
  member_id uuid references public.members (id),
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('insert', 'update', 'delete'))
);

create index audit_log_member_id_idx on public.audit_log (member_id);
create index audit_log_actor_user_id_idx on public.audit_log (actor_user_id);

alter table public.audit_log enable row level security;

create policy "audit_log: guild admins can read every row"
  on public.audit_log for select
  to authenticated
  using (public.is_guild_admin());

-- The insert policy requires actor_user_id to literally equal auth.uid(),
-- as a second, DB-level guarantee (beyond the application-layer wrapper
-- always passing the real signed-in user's id) that no row can ever be
-- logged against a fabricated actor.
create policy "audit_log: guild admins can insert rows attributed to themselves"
  on public.audit_log for insert
  to authenticated
  with check (public.is_guild_admin() and actor_user_id = auth.uid());
```

No update or delete policy — an audit log is append-only by design; nothing in this build ever needs to change or remove a row here.

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the actor_user_id guard**

There's no real Supabase Auth session available from `db execute`, so this only confirms the constraint shape:

```bash
npx supabase db execute --sql "
insert into audit_log (actor_user_id, table_name, action) values ('00000000-0000-0000-0000-000000000099', 'members', 'update');
"
```

Expected: fails — either on the `auth.users` foreign key (no such user) or, once run as an authenticated non-matching role, on the RLS policy. Either failure mode confirms the row can't be inserted with an arbitrary actor. Clean up isn't needed since the insert never succeeds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add the audit_log table for impersonation write-attribution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `brand_settings` migration

**Files:**
- Create: a new migration via `supabase migration new brand_settings_table`

**Interfaces:**
- Produces: `public.brand_settings`, a singleton table enforced by a unique index on a constant expression.
- Consumes: `public.is_guild_admin()`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new brand_settings_table
```

- [ ] **Step 2: Write the migration**

```sql
create table public.brand_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  font_pairing text not null,
  tokens jsonb not null,
  updated_by_user_id uuid references auth.users (id)
);

-- Enforces "one row holding the current brand JSON" (task brief) at the DB
-- layer: a unique index on a constant expression permits at most one row
-- in the whole table, regardless of application-code discipline.
create unique index brand_settings_singleton_idx on public.brand_settings ((true));

alter table public.brand_settings enable row level security;

-- Guild-admin-only, no public access at all -- only server-rendered pages
-- read this row, via the service-role client (task brief: "public no
-- access since only server-rendered pages read it, not the browser
-- directly").
create policy "brand_settings: guild admins can read"
  on public.brand_settings for select
  to authenticated
  using (public.is_guild_admin());

create policy "brand_settings: guild admins can manage"
  on public.brand_settings for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the singleton constraint**

```bash
npx supabase db execute --sql "
set role service_role;
insert into brand_settings (font_pairing, tokens) values ('bricolage-chivo', '{}'::jsonb);
insert into brand_settings (font_pairing, tokens) values ('fraunces-karla', '{}'::jsonb);
"
```

Expected: the first insert succeeds, the second fails on `brand_settings_singleton_idx`. Clean up:

```bash
npx supabase db execute --sql "set role service_role; delete from brand_settings;"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add the brand_settings singleton table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Extend Supabase row types

**Files:**
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `InquiryRow`, `AuditLogRow`, `BrandSettingsRow`. Consumed by every later task in this plan.
- Consumes: nothing new.

- [ ] **Step 1: Append the new row types**

Open `src/lib/supabase/types.ts`. Append at the end of the file:

```ts
export type InquiryRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  wants_membership_info: boolean;
  status: "open" | "handled";
  confirmation_sent_at: string | null;
  handled_by_user_id: string | null;
  handled_at: string | null;
  converted_member_id: string | null;
};

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_user_id: string;
  member_id: string | null;
  table_name: string;
  row_id: string | null;
  action: "insert" | "update" | "delete";
};

export type BrandSettingsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  font_pairing: string;
  tokens: Record<string, string>;
  updated_by_user_id: string | null;
};
```

`BrandSettingsRow.tokens` is typed as `Record<string, string>` here rather than importing `BrandTokens` from `src/lib/brand/default-tokens.ts` (Task 10) — that module doesn't exist yet at this point in the task order, and this file has no other cross-feature imports today. Task 10 re-exports the same shape with the precise sixteen-key type; call sites that need the precise type import it from there.

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: extend Supabase row types for inquiries, audit_log, brand_settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Pure logic — member claim-state resolver (TDD)

**Files:**
- Create: `src/lib/guild/member-claim-state.ts`
- Create: `src/lib/guild/member-claim-state.test.ts`

**Interfaces:**
- Produces: `MemberClaimState`, `resolveMemberClaimState(input)`. Consumed by `roster.server.ts` (Task 14).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/guild/member-claim-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveMemberClaimState } from "./member-claim-state";

describe("resolveMemberClaimState", () => {
  it("is unclaimed when no member_users row exists", () => {
    expect(resolveMemberClaimState({ hasMemberUser: false, lastSignInAt: null })).toBe("unclaimed");
  });

  it("is invited_not_signed_in when a member_users row exists but last_sign_in_at is null", () => {
    expect(resolveMemberClaimState({ hasMemberUser: true, lastSignInAt: null })).toBe("invited_not_signed_in");
  });

  it("is claimed once last_sign_in_at is set", () => {
    expect(resolveMemberClaimState({ hasMemberUser: true, lastSignInAt: "2026-09-01T00:00:00Z" })).toBe("claimed");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- member-claim-state
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/guild/member-claim-state.ts`:

```ts
export type MemberClaimState = "unclaimed" | "invited_not_signed_in" | "claimed";

/**
 * Roster state, per the spec's "Migrating the existing members" and
 * "Roles" sections: a member nobody has written to yet (no member_users
 * row) is a different roster state from one who was invited and hasn't
 * signed in yet (a member_users row exists, but the invited auth.users
 * row's last_sign_in_at is still null). auth.users isn't queryable through
 * the normal RLS-scoped client, so the caller looks lastSignInAt up via
 * the service-role client's auth.admin.getUserById() and passes it in here
 * -- this function itself does no I/O.
 */
export function resolveMemberClaimState(input: {
  hasMemberUser: boolean;
  lastSignInAt: string | null;
}): MemberClaimState {
  if (!input.hasMemberUser) return "unclaimed";
  return input.lastSignInAt ? "claimed" : "invited_not_signed_in";
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- member-claim-state
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guild/member-claim-state.ts src/lib/guild/member-claim-state.test.ts
git commit -m "feat: add the roster claim-state resolver

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Pure logic — unique member-slug picker (TDD) + server wrapper

**Files:**
- Create: `src/lib/guild/unique-member-slug.ts`
- Create: `src/lib/guild/unique-member-slug.test.ts`
- Create: `src/lib/guild/unique-member-slug.server.ts`

**Interfaces:**
- Produces: `pickUnusedSlug(base, existingSlugs)` (pure), `generateUniqueMemberSlug(supabase, businessName)` (I/O). Consumed by `create-member.server.ts` (Task 12).
- Consumes: `slugify` from `src/lib/slug.ts` (Public Member Profile phase, Task 2).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/guild/unique-member-slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickUnusedSlug } from "./unique-member-slug";

describe("pickUnusedSlug", () => {
  it("returns the base slug when it isn't taken", () => {
    expect(pickUnusedSlug("left-coast-brewing", [])).toBe("left-coast-brewing");
  });

  it("appends -2 when the base is taken once", () => {
    expect(pickUnusedSlug("left-coast-brewing", ["left-coast-brewing"])).toBe("left-coast-brewing-2");
  });

  it("keeps incrementing past multiple collisions", () => {
    expect(
      pickUnusedSlug("left-coast-brewing", ["left-coast-brewing", "left-coast-brewing-2", "left-coast-brewing-3"]),
    ).toBe("left-coast-brewing-4");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- unique-member-slug
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure picker**

Create `src/lib/guild/unique-member-slug.ts`:

```ts
/**
 * Returns `base`, or `base-2`, `base-3`, ... on collision (spec, "Once
 * issued a slug never changes, or shared links break" -- this is the
 * collision half of that rule, for a roster row created one at a time,
 * not the one-time import script's own in-memory uniqueSlug() -- that
 * function's uniqueness set is a single import batch, not the live table
 * a one-at-a-time creation needs to check against).
 */
export function pickUnusedSlug(base: string, existingSlugs: readonly string[]): string {
  const used = new Set(existingSlugs);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- unique-member-slug
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the server wrapper**

Create `src/lib/guild/unique-member-slug.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/slug";
import { pickUnusedSlug } from "@/lib/guild/unique-member-slug";

/**
 * Queries the live members table for anything starting with the candidate
 * base slug, then hands the collision-suffix decision to pickUnusedSlug.
 * Callers must use a client whose RLS scope can read every member's slug
 * regardless of status -- in practice this is only ever called by
 * guild-admin-only mutations, where the session-bound client already has
 * that access via "members: guild admins can read every row".
 */
export async function generateUniqueMemberSlug(
  supabase: SupabaseClient,
  businessName: string,
): Promise<string> {
  const base = slugify(businessName);
  const { data, error } = await supabase.from("members").select("slug").ilike("slug", `${base}%`);
  if (error) throw new Error(error.message);
  const existingSlugs = (data ?? []).map((row) => row.slug as string);
  return pickUnusedSlug(base, existingSlugs);
}
```

- [ ] **Step 6: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/guild/unique-member-slug.ts src/lib/guild/unique-member-slug.test.ts src/lib/guild/unique-member-slug.server.ts
git commit -m "feat: add the roster's unique-slug generator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Pure logic — impersonation cookie sign/verify + idle-timeout (TDD)

**Files:**
- Create: `src/lib/guild/impersonation-token.ts`
- Create: `src/lib/guild/impersonation-token.test.ts`

**Interfaces:**
- Produces: `ImpersonationState`, `IDLE_TIMEOUT_MS`, `signImpersonationState`, `verifyImpersonationCookie`, `isImpersonationExpired`, `shouldRecordAudit`. Consumed by `impersonation.server.ts` (Task 13) and `audit-log.server.ts` (Task 13).
- Consumes: nothing beyond Web Crypto (`crypto.subtle`), which is available identically in the Cloudflare Workers runtime, Node (18+), and Vitest's Node test environment.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/guild/impersonation-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  isImpersonationExpired,
  shouldRecordAudit,
  signImpersonationState,
  verifyImpersonationCookie,
  type ImpersonationState,
} from "./impersonation-token";

const SECRET = "test-secret-do-not-use-in-real-life";

function makeState(overrides: Partial<ImpersonationState> = {}): ImpersonationState {
  return {
    actorUserId: "admin-1",
    memberId: "member-1",
    startedAt: 1_000,
    lastActivityAt: 1_000,
    ...overrides,
  };
}

describe("sign/verify round trip", () => {
  it("verifies a value it just signed", async () => {
    const state = makeState();
    const cookie = await signImpersonationState(state, SECRET);
    expect(await verifyImpersonationCookie(cookie, SECRET)).toEqual(state);
  });

  it("rejects a tampered payload", async () => {
    const cookie = await signImpersonationState(makeState(), SECRET);
    const [payload, signature] = cookie.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(await verifyImpersonationCookie(tampered, SECRET)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signImpersonationState(makeState(), SECRET);
    expect(await verifyImpersonationCookie(cookie, "a-different-secret")).toBeNull();
  });

  it("rejects a malformed cookie", async () => {
    expect(await verifyImpersonationCookie("not-a-real-cookie", SECRET)).toBeNull();
    expect(await verifyImpersonationCookie("", SECRET)).toBeNull();
  });
});

describe("isImpersonationExpired", () => {
  it("is not expired right after the last activity", () => {
    const state = makeState({ lastActivityAt: 10_000 });
    expect(isImpersonationExpired(state, 10_000 + IDLE_TIMEOUT_MS - 1)).toBe(false);
  });

  it("is expired once the idle timeout has fully elapsed", () => {
    const state = makeState({ lastActivityAt: 10_000 });
    expect(isImpersonationExpired(state, 10_000 + IDLE_TIMEOUT_MS + 1)).toBe(true);
  });
});

describe("shouldRecordAudit", () => {
  it("is false with no impersonation state", () => {
    expect(shouldRecordAudit(null, "member-1")).toBe(false);
  });

  it("is true when the state's memberId matches the write's target", () => {
    expect(shouldRecordAudit(makeState({ memberId: "member-1" }), "member-1")).toBe(true);
  });

  it("is false when the state's memberId doesn't match", () => {
    expect(shouldRecordAudit(makeState({ memberId: "member-1" }), "member-2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- impersonation-token
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/guild/impersonation-token.ts`:

```ts
/**
 * The impersonation session-state mechanism (spec: "the session records
 * both the real admin and the member being edited"). Carried in a signed,
 * httpOnly cookie -- consistent with how this project's own magic-link
 * session already flows through cookies (@supabase/ssr's createServerClient
 * from the Member Admin phase) -- separate from the Supabase session
 * cookie itself, HMAC-signed so it can't be forged or hand-edited
 * client-side. Idle timeout is 30 minutes (this plan's Decision 4).
 */
export type ImpersonationState = {
  actorUserId: string;
  memberId: string;
  startedAt: number;
  lastActivityAt: number;
};

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function isImpersonationExpired(state: ImpersonationState, now: number): boolean {
  return now - state.lastActivityAt > IDLE_TIMEOUT_MS;
}

/**
 * Every write made while impersonating is logged against the real actor
 * (spec, "Editing as a member") -- but only when the write actually targets
 * the member the cookie says is being impersonated. A mismatch (the cookie
 * says member A, but the mutation call targets member B) never logs
 * anything; audit-log.server.ts (Task 13) treats that the same as "not
 * impersonating" and lets RLS alone decide whether the write itself is even
 * allowed.
 */
export function shouldRecordAudit(state: ImpersonationState | null, targetMemberId: string): boolean {
  return state !== null && state.memberId === targetMemberId;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function signImpersonationState(state: ImpersonationState, secret: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const signature = await hmacSign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyImpersonationCookie(
  cookieValue: string,
  secret: string,
): Promise<ImpersonationState | null> {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expectedSignature = await hmacSign(payload, secret);
  if (!timingSafeEqual(expectedSignature, signature)) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as ImpersonationState;
    if (
      typeof decoded.actorUserId !== "string" ||
      typeof decoded.memberId !== "string" ||
      typeof decoded.startedAt !== "number" ||
      typeof decoded.lastActivityAt !== "number"
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- impersonation-token
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guild/impersonation-token.ts src/lib/guild/impersonation-token.test.ts
git commit -m "feat: add the impersonation cookie's signing, verification, and idle-timeout logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Pure logic — inquiries confirmation-display-state rule (TDD)

**Files:**
- Create: `src/lib/inquiries/confirmation-state.ts`
- Create: `src/lib/inquiries/confirmation-state.test.ts`

**Interfaces:**
- Produces: `ConfirmationDisplayState`, `resolveConfirmationDisplayState(input)`. Consumed by `InquiriesTable.tsx` (Task 25).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/inquiries/confirmation-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveConfirmationDisplayState } from "./confirmation-state";

const NOW = new Date("2026-09-21T16:12:00Z").getTime();

describe("resolveConfirmationDisplayState", () => {
  it("is sent when confirmation_sent_at is set, regardless of age", () => {
    expect(
      resolveConfirmationDisplayState({
        confirmationSentAt: "2026-09-21T16:12:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        now: NOW,
      }),
    ).toBe("sent");
  });

  it("is not_yet_sent when confirmation_sent_at is null and the inquiry is brand new", () => {
    expect(
      resolveConfirmationDisplayState({
        confirmationSentAt: null,
        createdAt: new Date(NOW - 30_000).toISOString(),
        now: NOW,
      }),
    ).toBe("not_yet_sent");
  });

  it("is failed_to_send when confirmation_sent_at is null and the grace period has elapsed", () => {
    expect(
      resolveConfirmationDisplayState({
        confirmationSentAt: null,
        createdAt: new Date(NOW - 6 * 60 * 1000).toISOString(),
        now: NOW,
      }),
    ).toBe("failed_to_send");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- confirmation-state
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/inquiries/confirmation-state.ts`:

```ts
/**
 * Artboard N shows "Confirmation email sent automatically at 4:12 pm," and
 * needs to distinguish a delivered auto-reply from one that silently
 * failed to send (spec, "inquiries" table notes). The auto-reply is a
 * synchronous send inside the Worker request that handles the contact-form
 * POST (Contact Form + Resend phase) -- there's no legitimate reason for a
 * healthy send to take minutes, so a five-minute grace period is a
 * generous margin against transient delay while still surfacing a
 * genuinely failed send well before an admin looks at the inquiry.
 */
export type ConfirmationDisplayState = "sent" | "not_yet_sent" | "failed_to_send";

const CONFIRMATION_GRACE_PERIOD_MS = 5 * 60 * 1000;

export function resolveConfirmationDisplayState(input: {
  confirmationSentAt: string | null;
  createdAt: string;
  now: number;
}): ConfirmationDisplayState {
  if (input.confirmationSentAt) return "sent";
  const ageMs = input.now - new Date(input.createdAt).getTime();
  return ageMs > CONFIRMATION_GRACE_PERIOD_MS ? "failed_to_send" : "not_yet_sent";
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- confirmation-state
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inquiries/confirmation-state.ts src/lib/inquiries/confirmation-state.test.ts
git commit -m "feat: add the inquiries confirmation-email display-state rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Pure logic — WCAG contrast math for oklch tokens (TDD)

**Files:**
- Create: `src/lib/brand/contrast.ts`
- Create: `src/lib/brand/contrast.test.ts`

**Interfaces:**
- Produces: `relativeLuminanceOfOklch`, `contrastRatio`, `parseOklch`, `contrastRatioOfOklchStrings`, `meetsWcagAA`. Consumed by `brand-settings.server.ts` (Task 26) and `BrandEditor.tsx` (Task 27).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/brand/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio, contrastRatioOfOklchStrings, meetsWcagAA, parseOklch, relativeLuminanceOfOklch } from "./contrast";

describe("relativeLuminanceOfOklch", () => {
  it("pure white is luminance 1", () => {
    expect(relativeLuminanceOfOklch(1, 0, 0)).toBeCloseTo(1, 5);
  });

  it("pure black is luminance 0", () => {
    expect(relativeLuminanceOfOklch(0, 0, 0)).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("white against black is the maximum WCAG ratio, 21:1", () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 1);
  });

  it("a color against itself is always 1:1", () => {
    expect(contrastRatio(0.4, 0.4)).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio(0.8, 0.1)).toBeCloseTo(contrastRatio(0.1, 0.8), 10);
  });
});

describe("parseOklch", () => {
  it("parses a plain oklch(L C H) string", () => {
    expect(parseOklch("oklch(0.58 0.15 50)")).toEqual({ l: 0.58, c: 0.15, h: 50 });
  });

  it("throws on a non-oklch string", () => {
    expect(() => parseOklch("#B3591F")).toThrow();
  });
});

describe("brand token contrast, against the Brand Design Tokens phase's approved values", () => {
  it("--brand with white text clears 4.5:1 (spec: 'solid fills with white text')", () => {
    expect(contrastRatioOfOklchStrings("oklch(0.58 0.15 50)", "oklch(1 0 0)")).toBeGreaterThanOrEqual(4.5);
  });

  it("--brand-bright with dark --ink text clears 4.5:1 (spec: 'fills with dark text')", () => {
    expect(contrastRatioOfOklchStrings("oklch(0.72 0.165 55)", "oklch(0.22 0.012 60)")).toBeGreaterThanOrEqual(4.5);
  });

  it("--brand-bright with white text FAILS -- the exact defect the two-amber split fixes", () => {
    expect(contrastRatioOfOklchStrings("oklch(0.72 0.165 55)", "oklch(1 0 0)")).toBeLessThan(4.5);
  });
});

describe("meetsWcagAA", () => {
  it("is true for the approved --brand/white pairing", () => {
    expect(meetsWcagAA("oklch(0.58 0.15 50)", "oklch(1 0 0)")).toBe(true);
  });

  it("is false for a too-light fill with white text", () => {
    expect(meetsWcagAA("oklch(0.9 0.1 50)", "oklch(1 0 0)")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- contrast
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/brand/contrast.ts`:

```ts
/**
 * WCAG 2.1 contrast math, computed directly from oklch() values rather than
 * round-tripping through hex, since the brand editor's inputs and the
 * Brand Design Tokens phase's stored values are both oklch. The OKLab<->
 * linear-sRGB conversion matrices are Björn Ottosson's published constants
 * (https://bottosson.github.io/posts/oklab/) -- the same ones behind CSS
 * Color 4's oklch(). WCAG 2.1's relative-luminance formula (§1.4.3) takes
 * LINEAR-light sRGB channels as input: despite its own confusingly-named
 * "R = RsRGB/12.92" delinearization step, that IS exactly the linear R/G/B
 * this module computes directly from OKLab, so no extra gamma round-trip
 * is needed before applying the luminance weights.
 */
function oklchToLinearSrgb(l: number, c: number, hDegrees: number): { r: number; g: number; b: number } {
  const hRadians = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(hRadians);
  const bLab = c * Math.sin(hRadians);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bLab;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  const r = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const bChannel = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  return {
    r: Math.min(1, Math.max(0, r)),
    g: Math.min(1, Math.max(0, g)),
    b: Math.min(1, Math.max(0, bChannel)),
  };
}

function relativeLuminanceFromLinear(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function relativeLuminanceOfOklch(l: number, c: number, hDegrees: number): number {
  const { r, g, b } = oklchToLinearSrgb(l, c, hDegrees);
  return relativeLuminanceFromLinear(r, g, b);
}

export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseOklch(value: string): { l: number; c: number; h: number } {
  const match = value.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!match) throw new Error(`Not a plain oklch(L C H) string: "${value}"`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

export function contrastRatioOfOklchStrings(fillOklch: string, textOklch: string): number {
  const fill = parseOklch(fillOklch);
  const text = parseOklch(textOklch);
  return contrastRatio(
    relativeLuminanceOfOklch(fill.l, fill.c, fill.h),
    relativeLuminanceOfOklch(text.l, text.c, text.h),
  );
}

/** The spec's own bar: "refuses to save a combination that fails 4.5:1." */
export function meetsWcagAA(fillOklch: string, textOklch: string): boolean {
  return contrastRatioOfOklchStrings(fillOklch, textOklch) >= 4.5;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- contrast
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand/contrast.ts src/lib/brand/contrast.test.ts
git commit -m "feat: add WCAG 2.1 contrast math for oklch brand tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Font-pairing catalog + default-brand-token CSS builder (TDD)

**Files:**
- Create: `src/lib/brand/font-pairings.ts`
- Create: `src/lib/brand/default-tokens.ts`
- Create: `src/lib/brand/default-tokens.test.ts`

**Interfaces:**
- Produces: `FONT_PAIRINGS`, `FontPairing`, `BRAND_TOKEN_NAMES`, `BrandTokenName`, `BrandTokens`, `DEFAULT_BRAND_TOKENS`, `buildBrandTokenCss(tokens)`. Consumed by `brand-settings.server.ts` (Task 26), `BrandEditor.tsx` (Task 27), and `__root.tsx` (Task 28).
- Consumes: nothing.

- [ ] **Step 1: Implement the font-pairing catalog**

Create `src/lib/brand/font-pairings.ts`:

```ts
/**
 * Typefaces are chosen from a curated list of pairings, never a free font
 * field (spec, "Editing the brand from the admin": "An open font picker
 * guarantees someone tries Comic Sans, and there is no undo for a brand").
 * Every pairing here is a real display+body Google Fonts combination, in
 * the same spirit as the current default, Bricolage Grotesque + Chivo
 * (Brand Design Tokens phase).
 */
export type FontPairing = {
  id: string;
  label: string;
  displayFamily: string;
  displayWeights: string;
  bodyFamily: string;
  bodyWeights: string;
  googleFontsHref: string;
};

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: "bricolage-chivo",
    label: "Bricolage Grotesque + Chivo (default)",
    displayFamily: "Bricolage Grotesque",
    displayWeights: "700;800",
    bodyFamily: "Chivo",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Chivo:wght@400;500;600&display=swap",
  },
  {
    id: "fraunces-karla",
    label: "Fraunces + Karla",
    displayFamily: "Fraunces",
    displayWeights: "600;700",
    bodyFamily: "Karla",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Karla:wght@400;500;600&display=swap",
  },
  {
    id: "space-grotesk-work-sans",
    label: "Space Grotesk + Work Sans",
    displayFamily: "Space Grotesk",
    displayWeights: "600;700",
    bodyFamily: "Work Sans",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap",
  },
  {
    id: "spectral-public-sans",
    label: "Spectral + Public Sans",
    displayFamily: "Spectral",
    displayWeights: "600;700",
    bodyFamily: "Public Sans",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Spectral:wght@600;700&family=Public+Sans:wght@400;500;600&display=swap",
  },
  {
    id: "big-shoulders-nunito-sans",
    label: "Big Shoulders + Nunito Sans",
    displayFamily: "Big Shoulders",
    displayWeights: "700;800",
    bodyFamily: "Nunito Sans",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;800&family=Nunito+Sans:wght@400;500;600&display=swap",
  },
];

export function getFontPairingById(id: string): FontPairing | undefined {
  return FONT_PAIRINGS.find((pairing) => pairing.id === id);
}

export const DEFAULT_FONT_PAIRING_ID = "bricolage-chivo";
```

- [ ] **Step 2: Write the failing test for the CSS builder**

Create `src/lib/brand/default-tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BRAND_TOKEN_NAMES, buildBrandTokenCss, DEFAULT_BRAND_TOKENS } from "./default-tokens";

describe("DEFAULT_BRAND_TOKENS", () => {
  it("has exactly the sixteen token names from the Brand Design Tokens phase", () => {
    expect(Object.keys(DEFAULT_BRAND_TOKENS).sort()).toEqual([...BRAND_TOKEN_NAMES].sort());
  });

  it("matches the Brand Design Tokens phase's exact --brand value", () => {
    expect(DEFAULT_BRAND_TOKENS.brand).toBe("oklch(0.58 0.15 50)");
  });
});

describe("buildBrandTokenCss", () => {
  it("emits a :root block with every token as a -- prefixed custom property", () => {
    const css = buildBrandTokenCss(DEFAULT_BRAND_TOKENS);
    expect(css).toContain(":root {");
    expect(css).toContain("--bg: oklch(0.17 0.012 60);");
    expect(css).toContain("--brand-bright: oklch(0.72 0.165 55);");
    expect(css).toContain("--danger: oklch(0.55 0.17 27);");
  });

  it("round-trips a full custom token set with no missing keys", () => {
    const customTokens = { ...DEFAULT_BRAND_TOKENS, brand: "oklch(0.6 0.15 40)" };
    const css = buildBrandTokenCss(customTokens);
    for (const name of BRAND_TOKEN_NAMES) {
      expect(css).toContain(`--${name}: ${customTokens[name]};`);
    }
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npm test -- default-tokens
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the module**

Create `src/lib/brand/default-tokens.ts`:

```ts
/**
 * The sixteen CSS custom properties the Brand Design Tokens phase defined
 * on :root (src/styles.css), keyed here by their bare name minus the
 * leading "--" so a stored JSON value round-trips losslessly into CSS by
 * simple string interpolation (this plan's Decision 12). DEFAULT_BRAND_TOKENS
 * is copied verbatim from that phase's approved oklch table -- the
 * fallback used whenever no brand_settings row exists yet (task brief:
 * "don't require a Guild admin to touch this screen before the site looks
 * right").
 */
export const BRAND_TOKEN_NAMES = [
  "bg",
  "surface",
  "surface-2",
  "border-dark",
  "text",
  "text-muted",
  "canvas",
  "canvas-2",
  "canvas-border",
  "ink",
  "ink-muted",
  "brand",
  "brand-bright",
  "open",
  "warn",
  "danger",
] as const;

export type BrandTokenName = (typeof BRAND_TOKEN_NAMES)[number];

export type BrandTokens = Record<BrandTokenName, string>;

export const DEFAULT_BRAND_TOKENS: BrandTokens = {
  bg: "oklch(0.17 0.012 60)",
  surface: "oklch(0.21 0.014 60)",
  "surface-2": "oklch(0.25 0.014 60)",
  "border-dark": "oklch(0.31 0.015 60)",
  text: "oklch(0.96 0.012 80)",
  "text-muted": "oklch(0.74 0.018 70)",
  canvas: "oklch(0.97 0.008 80)",
  "canvas-2": "oklch(0.94 0.01 80)",
  "canvas-border": "oklch(0.88 0.012 80)",
  ink: "oklch(0.22 0.012 60)",
  "ink-muted": "oklch(0.46 0.012 70)",
  brand: "oklch(0.58 0.15 50)",
  "brand-bright": "oklch(0.72 0.165 55)",
  open: "oklch(0.62 0.15 145)",
  warn: "oklch(0.68 0.13 75)",
  danger: "oklch(0.55 0.17 27)",
};

/**
 * Emits a :root { --token: value; ... } block, in BRAND_TOKEN_NAMES's fixed
 * order, for every one of the sixteen tokens -- never a partial set. The
 * root route (Task 28) injects this string directly as a <style> tag,
 * ordered after the compiled Tailwind stylesheet so these :root
 * declarations win the cascade over styles.css's own defaults.
 */
export function buildBrandTokenCss(tokens: BrandTokens): string {
  const lines = BRAND_TOKEN_NAMES.map((name) => `  --${name}: ${tokens[name]};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npm test -- default-tokens
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brand/font-pairings.ts src/lib/brand/default-tokens.ts src/lib/brand/default-tokens.test.ts
git commit -m "feat: add the curated font-pairing catalog and default brand tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: `/guild` auth guard + layout shell + nav

**Files:**
- Create: `src/lib/auth/require-guild-admin-session.server.ts`
- Create: `src/routes/guild.tsx`
- Create: `src/routes/guild.index.tsx`
- Create: `src/components/guild/GuildShell.tsx`

**Interfaces:**
- Produces: `requireGuildAdminSession()` (a `createServerFn`), `<GuildShell>`. Consumed by every `/guild/*` route in this plan.
- Consumes: `getSupabaseServerClientForRequest` (Member Admin phase, `src/lib/supabase/server.ts`), `resolveUserRoleAndTarget` (Member Admin phase, `src/lib/auth/role-routing.ts`).

- [ ] **Step 1: Implement the auth guard**

Create `src/lib/auth/require-guild-admin-session.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

/**
 * Runs once, in /guild's own beforeLoad, inherited by every child route.
 * Reuses resolveUserRoleAndTarget (Member Admin phase, Task 3) rather than
 * re-implementing the is_guild_admin check a second way -- consistent with
 * that phase's own Decision 2 (guild-admin routing takes precedence over
 * member-editor routing whenever both apply).
 */
export const requireGuildAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ userId: string }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      throw redirect({ href: "/signin" });
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);
    if (routing.role !== "guild_admin") {
      // A member editor (or a signed-in user with neither role) has no
      // business under /guild at all -- send them to wherever
      // resolveUserRoleAndTarget says they actually belong.
      throw redirect({ href: routing.redirectTo });
    }

    return { userId: user.id };
  },
);
```

- [ ] **Step 2: Implement the layout route**

Create `src/routes/guild.tsx`:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireGuildAdminSession } from "@/lib/auth/require-guild-admin-session.server";
import { GuildShell } from "@/components/guild/GuildShell";

export const Route = createFileRoute("/guild")({
  beforeLoad: async () => {
    const session = await requireGuildAdminSession();
    return { userId: session.userId };
  },
  head: () => ({ meta: [{ title: "Guild admin — IE Brewers Guild" }] }),
  component: GuildLayout,
});

function GuildLayout() {
  return (
    <GuildShell>
      <Outlet />
    </GuildShell>
  );
}
```

- [ ] **Step 3: Implement the index redirect**

Create `src/routes/guild.index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/guild/")({
  beforeLoad: () => {
    throw redirect({ href: "/guild/roster" });
  },
});
```

- [ ] **Step 4: Implement the shell with its nav, including the disabled Applications entry**

Create `src/components/guild/GuildShell.tsx`:

```tsx
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { signOutEverything } from "@/lib/auth/sign-out.server";

const NAV_ITEMS = [
  { to: "/guild/roster", label: "Members" },
  { to: "/guild/inquiries", label: "Inquiries" },
  { to: "/guild/brand", label: "Brand & theme" },
  { to: "/guild/categories", label: "Categories" },
] as const;

/**
 * The Guild admin's own shell and nav. "Applications" is a disabled,
 * greyed-out entry -- per the task brief, the applications queue screen
 * itself is explicitly out of scope; this is only the nav placeholder the
 * spec's "Joining, later" section calls for ("the Guild admin nav already
 * has an Applications item marked SOON").
 */
export function GuildShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOutEverything();
    await router.navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <nav aria-label="Guild admin sections" className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted [&.active]:bg-primary/10 [&.active]:text-primary"
            activeProps={{ className: "active" }}
          >
            {item.label}
          </Link>
        ))}
        <span
          aria-disabled="true"
          className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground/50"
        >
          Applications — SOON
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className="ml-auto min-h-11 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          Sign out
        </button>
      </nav>

      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
```

The "Applications — SOON" entry is a plain `<span aria-disabled="true">`, not a `<button>` or `<a>`, since it has no action at all — matching this codebase's own "no clickable divs" rule in spirit: an inert label needs no interactive role, only a non-misleading one. `signOutEverything` is implemented in Task 23, once the impersonation-clearing logic it also needs exists; this task's `GuildShell` compiles against its final signature now so Task 20's parallel change to `AdminShell` can use the identical import without either file waiting on the other.

- [ ] **Step 5: Verify the dev server starts and the guard redirects correctly**

```bash
npm run dev
```

Visit `http://localhost:8080/guild` while signed out. Expected: redirected to `/signin`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/require-guild-admin-session.server.ts src/routes/guild.tsx src/routes/guild.index.tsx src/components/guild/GuildShell.tsx
git commit -m "feat: add the /guild auth guard, layout, and nav shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Shared guild-admin member-creation helper

**Files:**
- Create: `src/lib/guild/create-member.server.ts`

**Interfaces:**
- Produces: `createMemberRecord(input)`. Consumed by `roster.server.ts` (Task 15, "create a new member row") and `inquiries.server.ts` (Task 24, "Set them up as a member").
- Consumes: `generateUniqueMemberSlug` (Task 6), `getSupabaseServerClientForRequest`.

- [ ] **Step 1: Implement the shared creation function**

Create `src/lib/guild/create-member.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { generateUniqueMemberSlug } from "@/lib/guild/unique-member-slug.server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

export type CreateMemberInput = {
  businessName: string;
  city: string;
  memberType: MemberType;
  contactEmail?: string | null;
};

/**
 * Shared by the roster's "create a new member" action and the inquiries
 * screen's "Set them up as a member" action (task brief, both call sites).
 * New rows start as status = 'draft' (this plan's Decision 8), not the
 * schema's own default of 'applied' -- a roster-created member is, by
 * construction, already past the application stage the spec describes:
 * "the Guild admin creates the member from the roster and sends the
 * invite. The member signs in and gets a draft profile they publish
 * themselves." Guild-admin-only, per the schema's own "members: guild
 * admins can insert" policy -- this function does no separate permission
 * check of its own, since every call site already runs behind the /guild
 * auth guard.
 */
export const createMemberRecord = createServerFn({ method: "POST" })
  .inputValidator((data: CreateMemberInput) => data)
  .handler(async ({ data }): Promise<MemberRow> => {
    const supabase = await getSupabaseServerClientForRequest();
    const slug = await generateUniqueMemberSlug(supabase, data.businessName);

    const { data: member, error } = await supabase
      .from("members")
      .insert({
        slug,
        business_name: data.businessName,
        city: data.city,
        member_type: data.memberType,
        contact_email: data.contactEmail ?? null,
        status: "draft",
      })
      .select("*")
      .single();

    if (error || !member) throw new Error(error?.message ?? "Could not create the member.");
    return member as MemberRow;
  });
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guild/create-member.server.ts
git commit -m "feat: add the shared guild-admin member-creation helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Impersonation cookie I/O + the audit-log wrapper

**Files:**
- Create: `src/lib/guild/impersonation.server.ts`
- Create: `src/lib/guild/audit-log.server.ts`

**Interfaces:**
- Produces: `IMPERSONATION_COOKIE_NAME`, `startImpersonation`, `stopImpersonation`, `readImpersonationState`, `touchImpersonationActivity`, `getMemberDisplayName` (all in `impersonation.server.ts`); `recordAuditLogIfImpersonating` (in `audit-log.server.ts`). Consumed by `require-member-session.server.ts` (Task 19), `AdminShell.tsx` (Task 20), every one of the ~14 member-mutation files (Task 21), and `member-profile.server.ts` (Task 22).
- Consumes: `signImpersonationState`/`verifyImpersonationCookie`/`isImpersonationExpired`/`shouldRecordAudit` (Task 7), `getSupabaseServerClientForRequest`.

This is the task the impersonation feature's correctness depends on most directly — read Decisions 1, 2, 5, and 10 above before touching either file.

- [ ] **Step 1: Implement the cookie I/O module**

Create `src/lib/guild/impersonation.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  isImpersonationExpired,
  signImpersonationState,
  verifyImpersonationCookie,
  type ImpersonationState,
} from "@/lib/guild/impersonation-token";

export const IMPERSONATION_COOKIE_NAME = "guild_impersonation";

/**
 * Duplicated locally rather than exported from src/lib/supabase/server.ts
 * (this plan's Decision 10) -- that file's own getWorkerEnv is private and
 * two lines long; this is the same pattern, narrowly typed to the one new
 * secret this feature needs, so Phase 3/4's file doesn't grow a new public
 * export for a one-off need in a later phase.
 */
const getWorkerEnv = createServerOnlyFn(async (): Promise<{ IMPERSONATION_COOKIE_SECRET?: string }> => {
  const { env } = await import("cloudflare:workers");
  return env as { IMPERSONATION_COOKIE_SECRET?: string };
});

async function getCookieSecret(): Promise<string> {
  const env = await getWorkerEnv();
  if (!env.IMPERSONATION_COOKIE_SECRET) {
    throw new Error("Missing IMPERSONATION_COOKIE_SECRET in the Worker environment.");
  }
  return env.IMPERSONATION_COOKIE_SECRET;
}

async function setImpersonationCookie(state: ImpersonationState): Promise<void> {
  const secret = await getCookieSecret();
  const signed = await signImpersonationState(state, secret);
  setCookie(IMPERSONATION_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Starts an impersonation session. Deliberately does NOT throw redirect()
 * -- this is called directly from a client onClick handler (the roster's
 * "Edit as them" button, Task 18), not from a route's beforeLoad/loader,
 * and TanStack Router's automatic redirect-following only applies to
 * redirects thrown from those two lifecycle points. The caller navigates
 * itself after this resolves.
 */
export const startImpersonation = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_guild_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_guild_admin) {
      throw new Error("Only a Guild admin can start an impersonation session.");
    }

    const now = Date.now();
    await setImpersonationCookie({
      actorUserId: userData.user.id,
      memberId: data.memberId,
      startedAt: now,
      lastActivityAt: now,
    });

    return { ok: true as const };
  });

/** Ends the session (spec: "Stopping returns to the roster") -- the caller navigates there. */
export const stopImpersonation = createServerFn({ method: "POST" }).handler(async () => {
  setCookie(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return { ok: true as const };
});

/**
 * Reads and verifies the cookie, treating a missing, forged, or expired
 * cookie identically -- null, meaning "no active impersonation." Every
 * caller (the /admin auth guard, the audit-log wrapper, the public
 * profile's preview check) goes through this single function rather than
 * reading the raw cookie itself, so the verification and expiry rules only
 * live in one place.
 */
export async function readImpersonationState(): Promise<ImpersonationState | null> {
  const raw = getCookie(IMPERSONATION_COOKIE_NAME);
  if (!raw) return null;
  const secret = await getCookieSecret();
  const state = await verifyImpersonationCookie(raw, secret);
  if (!state) return null;
  if (isImpersonationExpired(state, Date.now())) return null;
  return state;
}

/**
 * Refreshes lastActivityAt and re-sets the cookie. Called from both the
 * /admin auth guard on every navigation (Task 19) and the audit-log
 * wrapper on every mutation (below) -- either kind of activity re-arms the
 * 30-minute idle timeout (this plan's Decision 4).
 */
export async function touchImpersonationActivity(state: ImpersonationState): Promise<void> {
  await setImpersonationCookie({ ...state, lastActivityAt: Date.now() });
}

/** Used by AdminShell's impersonation banner (Task 20) to name who's being edited. */
export const getMemberDisplayName = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member } = await supabase
      .from("members")
      .select("business_name")
      .eq("id", data.memberId)
      .maybeSingle();
    return (member?.business_name as string | undefined) ?? null;
  });
```

- [ ] **Step 2: Implement the audit-log wrapper**

Create `src/lib/guild/audit-log.server.ts`:

```ts
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readImpersonationState, touchImpersonationActivity } from "@/lib/guild/impersonation.server";
import { shouldRecordAudit } from "@/lib/guild/impersonation-token";

export type AuditableAction = "insert" | "update" | "delete";

/**
 * The one shared wrapper every member-scoped mutation file calls right
 * after its own write succeeds (this plan's Decisions 1-2 explain why this
 * approach, not a Postgres session-variable trigger, is the reliable one
 * over Supabase's REST API). A no-op when there's no active impersonation
 * targeting this exact memberId -- an ordinary member editing their own
 * profile never writes to audit_log at all, matching the spec's own
 * framing of this rule as specifically about impersonation sessions
 * ("every write is logged against the real actor" appears under "Editing
 * as a member," not as a blanket audit-everything requirement).
 *
 * Also refreshes the idle timer (touchImpersonationActivity) on every
 * logged write, so actively editing never triggers the 30-minute idle
 * timeout mid-session.
 */
export async function recordAuditLogIfImpersonating(params: {
  memberId: string;
  tableName: string;
  rowId: string | null;
  action: AuditableAction;
}): Promise<void> {
  const state = await readImpersonationState();
  if (!shouldRecordAudit(state, params.memberId)) return;

  const supabase = await getSupabaseServerClientForRequest();
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: state!.actorUserId,
    member_id: params.memberId,
    table_name: params.tableName,
    row_id: params.rowId,
    action: params.action,
  });
  if (error) {
    // The real write already succeeded by the time this runs -- a logging
    // failure must never look like the edit itself failed. Surfaced loudly
    // via console.error so it shows in Worker logs/tail, matching this
    // codebase's existing log-and-continue pattern for
    // sendTransactionalEmail failures (Member Admin phase, Task 19-20).
    console.error("recordAuditLogIfImpersonating: failed to write audit_log row", error);
  }

  await touchImpersonationActivity(state!);
}
```

- [ ] **Step 3: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manually verify neither client is memoized across requests**

```bash
grep -n "getSupabaseServerClientForRequest" -A 2 src/lib/guild/impersonation.server.ts src/lib/guild/audit-log.server.ts | grep -i "let \|cache\|=== undefined"
```

Expected: no output — this file must never cache the per-request client the same way Task 2 of the Member Admin phase warned against.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guild/impersonation.server.ts src/lib/guild/audit-log.server.ts
git commit -m "feat: add the impersonation cookie lifecycle and the audit-log wrapper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Roster data-fetch + list route/UI + search/filter

**Files:**
- Create: `src/lib/guild/roster.server.ts`
- Create: `src/routes/guild.roster.tsx`
- Create: `src/components/guild/RosterTable.tsx`

**Interfaces:**
- Produces: `RosterEntry`, `getRoster()`. Consumed by `RosterTable.tsx` (this task) and reused by later roster-action tasks (15-18) for their optimistic UI updates.
- Consumes: `resolveMemberClaimState` (Task 5), `getSupabaseServerClientForRequest`, `getSupabaseServiceRoleClient` (both from Member Admin/Public Profile phases' `src/lib/supabase/server.ts`).

- [ ] **Step 1: Implement the data-fetch**

Create `src/lib/guild/roster.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveMemberClaimState, type MemberClaimState } from "@/lib/guild/member-claim-state";
import type { MemberRow, MemberUserRow } from "@/lib/supabase/types";

export type RosterEntry = {
  member: MemberRow;
  claimState: MemberClaimState;
  ownerEmail: string | null;
};

/**
 * Lists every member with its real roster state (spec, "Roles" and
 * "Migrating the existing members"). auth.users isn't queryable through
 * the normal RLS-scoped client, so claim state is resolved per-member via
 * the service-role client's auth.admin.getUserById() -- one call per
 * member that already has an owner in member_users (this plan's Decision
 * 15: acceptable at the Guild's roster scale, revisit only if it grows by
 * orders of magnitude).
 */
export const getRoster = createServerFn({ method: "GET" }).handler(async (): Promise<RosterEntry[]> => {
  const supabase = await getSupabaseServerClientForRequest();

  const { data: members, error: membersError } = await supabase.from("members").select("*").order("business_name");
  if (membersError) throw new Error(membersError.message);

  const { data: memberUsers, error: memberUsersError } = await supabase.from("member_users").select("*");
  if (memberUsersError) throw new Error(memberUsersError.message);

  const memberUsersByMemberId = new Map<string, MemberUserRow[]>();
  for (const row of (memberUsers ?? []) as MemberUserRow[]) {
    const list = memberUsersByMemberId.get(row.member_id) ?? [];
    list.push(row);
    memberUsersByMemberId.set(row.member_id, list);
  }

  const serviceClient = getSupabaseServiceRoleClient();
  const entries: RosterEntry[] = [];

  for (const member of (members ?? []) as MemberRow[]) {
    const owners = memberUsersByMemberId.get(member.id) ?? [];
    const owner = owners.find((row) => row.role === "owner") ?? owners[0] ?? null;

    let lastSignInAt: string | null = null;
    let ownerEmail: string | null = null;
    if (owner) {
      const { data: userData } = await serviceClient.auth.admin.getUserById(owner.user_id);
      lastSignInAt = userData?.user?.last_sign_in_at ?? null;
      ownerEmail = userData?.user?.email ?? null;
    }

    entries.push({
      member,
      claimState: resolveMemberClaimState({ hasMemberUser: owners.length > 0, lastSignInAt }),
      ownerEmail,
    });
  }

  return entries;
});
```

- [ ] **Step 2: Implement the route**

Create `src/routes/guild.roster.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getRoster } from "@/lib/guild/roster.server";
import { RosterTable } from "@/components/guild/RosterTable";

export const Route = createFileRoute("/guild/roster")({
  loader: async () => getRoster(),
  component: RosterRoute,
});

function RosterRoute() {
  const entries = Route.useLoaderData();
  return <RosterTable entries={entries} />;
}
```

- [ ] **Step 3: Implement the table with search/filter**

Create `src/components/guild/RosterTable.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { MemberType } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateMemberDialog } from "@/components/guild/CreateMemberDialog";

const CLAIM_STATE_LABEL: Record<RosterEntry["claimState"], string> = {
  unclaimed: "Unclaimed",
  invited_not_signed_in: "Invited — not signed in",
  claimed: "Claimed",
};

/**
 * Search by business name/city, filter by member_type/status/claim state
 * (task brief, "Search/filter by this state and by member_type/status").
 * Row-level actions (invite, approve/decline, suspend, correct type, toggle
 * trail_eligible, Edit as them) are added by Tasks 15-18, each extending
 * this same table -- this task only builds the list, search, and filters.
 */
export function RosterTable({ entries }: { entries: RosterEntry[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemberType | "all">("all");
  const [claimFilter, setClaimFilter] = useState<RosterEntry["claimState"] | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.member.member_type !== typeFilter) return false;
      if (claimFilter !== "all" && entry.claimState !== claimFilter) return false;
      if (!q) return true;
      return (
        entry.member.business_name.toLowerCase().includes(q) || entry.member.city.toLowerCase().includes(q)
      );
    });
  }, [entries, query, typeFilter, claimFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="roster-search">Search</Label>
            <Input
              id="roster-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business name or city"
              className="mt-1 h-11 w-56"
            />
          </div>
          <div>
            <Label htmlFor="roster-type-filter">Member type</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as MemberType | "all")}>
              <SelectTrigger id="roster-type-filter" className="mt-1 h-11 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="producer">Producer</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="allied">Allied Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="roster-claim-filter">Roster state</Label>
            <Select
              value={claimFilter}
              onValueChange={(value) => setClaimFilter(value as RosterEntry["claimState"] | "all")}
            >
              <SelectTrigger id="roster-claim-filter" className="mt-1 h-11 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="unclaimed">Unclaimed</SelectItem>
                <SelectItem value="invited_not_signed_in">Invited — not signed in</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CreateMemberDialog />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2">Business</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Roster state</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry) => (
            <tr key={entry.member.id} className="border-b border-border/60">
              <td className="px-3 py-3 font-medium">{entry.member.business_name}</td>
              <td className="px-3 py-3">{entry.member.city}</td>
              <td className="px-3 py-3 capitalize">{entry.member.member_type}</td>
              <td className="px-3 py-3 capitalize">{entry.member.status}</td>
              <td className="px-3 py-3">{CLAIM_STATE_LABEL[entry.claimState]}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                No members match this search and filter combination.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

`CreateMemberDialog` is implemented in Task 15; this task imports it now so `RosterTable` compiles against its final shape without a circular-edit dependency between the two tasks.

- [ ] **Step 4: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: errors only inside `CreateMemberDialog` until Task 15 lands — acceptable at this point in the task sequence; don't commit until Task 15 closes that gap. (If executing this plan with `subagent-driven-development`, fold Tasks 14-15 into one review cycle rather than committing Task 14 alone.)

- [ ] **Step 5: Commit** (after Task 15's `CreateMemberDialog` exists)

```bash
git add src/lib/guild/roster.server.ts src/routes/guild.roster.tsx src/components/guild/RosterTable.tsx
git commit -m "feat: add the roster list, search, and filters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Roster — create-member action + UI

**Files:**
- Create: `src/components/guild/CreateMemberDialog.tsx`

**Interfaces:**
- Produces: `<CreateMemberDialog>`. Closes the gap `RosterTable.tsx` (Task 14) left open.
- Consumes: `createMemberRecord` (Task 12).

- [ ] **Step 1: Implement the dialog**

Create `src/components/guild/CreateMemberDialog.tsx`:

```tsx
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { createMemberRecord } from "@/lib/guild/create-member.server";
import type { MemberType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * "Create a new member row" (task brief, roster actions). The created row
 * starts as status = 'draft' (create-member.server.ts, this plan's
 * Decision 8) -- the member gets invited next (Task 16) and publishes
 * their own profile from there.
 */
export function CreateMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [memberType, setMemberType] = useState<MemberType>("producer");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await createMemberRecord({
        data: {
          businessName,
          city,
          memberType,
          contactEmail: contactEmail || null,
        },
      });
      setOpen(false);
      setBusinessName("");
      setCity("");
      setContactEmail("");
      await router.invalidate();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create the member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">Create member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new member</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-member-business-name">Business name</Label>
            <Input
              id="new-member-business-name"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="new-member-city">City</Label>
            <Input
              id="new-member-city"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="new-member-type">Member type</Label>
            <Select value={memberType} onValueChange={(value) => setMemberType(value as MemberType)}>
              <SelectTrigger id="new-member-type" className="mt-1 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="producer">Producer</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="allied">Allied Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="new-member-contact-email">Contact email (optional)</Label>
            <Input
              id="new-member-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="h-11">
              {submitting ? "Creating…" : "Create member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the project type-checks and the dev server starts**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors; `/guild/roster` renders the "Create member" button and dialog.

- [ ] **Step 3: Commit Tasks 14 and 15 together**

```bash
git add src/lib/guild/roster.server.ts src/routes/guild.roster.tsx src/components/guild/RosterTable.tsx src/components/guild/CreateMemberDialog.tsx
git commit -m "feat: add the roster list and the create-member action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Roster — invite flow + email trigger

**Files:**
- Modify: `src/lib/email/send.ts`
- Create: `src/lib/guild/invite-member.server.ts`
- Modify: `src/components/guild/RosterTable.tsx`

**Interfaces:**
- Produces: `inviteMember(input)`. Adds the `member_invited` variant to `TransactionalEmailPayload`.
- Consumes: `getSupabaseServiceRoleClient`, `getSupabaseServerClientForRequest`, `sendTransactionalEmail` (Member Admin phase, `src/lib/email/send.ts`).

- [ ] **Step 1: Add the `member_invited` payload variant**

Open `src/lib/email/send.ts`. It currently reads (Member Admin phase, Task 19):

```ts
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string };
```

Change it to:

```ts
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string }
  | { trigger: "member_invited"; memberId: string; email: string };
```

The function body itself (`sendTransactionalEmail`) needs no change — it already throws generically for any `payload.trigger`, naming whichever one was passed. This is the trigger point the spec's "Member invited → the new member" row calls for (spec, "Transactional email"; Member Admin phase's own Decision 18 already named this one as the Guild Admin phase's to fire).

- [ ] **Step 2: Implement the invite flow**

Create `src/lib/guild/invite-member.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";

/**
 * "Invite" (task brief): supabase.auth.admin.inviteUserByEmail() creates
 * the auth.users row immediately, unconfirmed (the decision already made
 * about roster state -- "invited, not signed in" is read from that user's
 * last_sign_in_at, not a new column). Once the invited user's id comes
 * back, a member_users row is inserted with role = 'owner'. The "Member
 * invited" email fires right after, wrapped in try/catch so its current
 * throw (src/lib/email/send.ts isn't implemented until the Contact Form +
 * Resend phase) never blocks the invite/DB-write from succeeding -- same
 * pattern as every other sendTransactionalEmail call site in this
 * codebase.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const serviceClient = getSupabaseServiceRoleClient();

    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(data.email);
    if (inviteError || !inviteData.user) {
      throw new Error(inviteError?.message ?? "Could not send the invite.");
    }

    const { error: memberUserError } = await supabase.from("member_users").insert({
      member_id: data.memberId,
      user_id: inviteData.user.id,
      role: "owner",
    });
    if (memberUserError) throw new Error(memberUserError.message);

    try {
      await sendTransactionalEmail({ trigger: "member_invited", memberId: data.memberId, email: data.email });
    } catch (err) {
      console.error("sendTransactionalEmail(member_invited) failed", err);
    }

    return { ok: true as const, userId: inviteData.user.id };
  });
```

- [ ] **Step 3: Wire an "Invite" button into the roster table**

In `src/components/guild/RosterTable.tsx`, add the import:

```tsx
import { useState } from "react";
import { inviteMember } from "@/lib/guild/invite-member.server";
import { useRouter } from "@tanstack/react-router";
```

(merge with the existing `useState`/`useMemo` import line rather than duplicating it). Add, inside the component, above the `return`:

```tsx
const router = useRouter();
const [invitingId, setInvitingId] = useState<string | null>(null);

async function handleInvite(entry: RosterEntry) {
  const email = entry.ownerEmail ?? window.prompt(`Invite email for ${entry.member.business_name}:`);
  if (!email) return;
  setInvitingId(entry.member.id);
  try {
    await inviteMember({ data: { memberId: entry.member.id, email } });
    await router.invalidate();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : "Could not send the invite.");
  } finally {
    setInvitingId(null);
  }
}
```

Add a sixth `<th>` ("Actions") to the header row, and a matching `<td>` to each body row:

```tsx
<td className="px-3 py-3">
  {entry.claimState === "unclaimed" && (
    <button
      type="button"
      onClick={() => handleInvite(entry)}
      disabled={invitingId === entry.member.id}
      className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
    >
      {invitingId === entry.member.id ? "Inviting…" : "Invite"}
    </button>
  )}
</td>
```

"Invite" only renders for `unclaimed` rows — an already-invited or claimed member has nothing to (re-)invite. `window.prompt`/`window.alert` are a deliberately minimal first cut for capturing an invite email and surfacing an error; Task 17 replaces this row's action cell with the fuller action set (approve/decline/suspend/etc.) and can swap these for a proper dialog at the same time without this task blocking on that polish.

- [ ] **Step 4: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/send.ts src/lib/guild/invite-member.server.ts src/components/guild/RosterTable.tsx
git commit -m "feat: add the roster invite flow and the member_invited email trigger

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: Roster — approve/decline/suspend/member_type-correction/trail_eligible/dues

**Files:**
- Create: `src/lib/guild/member-admin-actions.server.ts`
- Modify: `src/components/guild/RosterTable.tsx`

**Interfaces:**
- Produces: `GuildMemberPatch`, `updateMemberByGuildAdmin(input)`.
- Consumes: `getSupabaseServerClientForRequest`.

- [ ] **Step 1: Implement the generic guild-admin patch mutation**

Create `src/lib/guild/member-admin-actions.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

/**
 * The five write-limited columns the schema's own trigger
 * (members_enforce_owner_write_limits) reserves to a Guild admin --
 * status, dues_received_at, approved_at, approved_by_user_id,
 * trail_eligible -- plus member_type, which the task brief also calls out
 * ("correct member_type") as a roster action. One generic patch mutation
 * covers approve, decline, suspend, correct-type, and toggle-trail_eligible
 * alike; the UI decides which fields to send per action.
 */
export type GuildMemberPatch = Partial<
  Pick<MemberRow, "status" | "member_type" | "trail_eligible" | "dues_received_at" | "approved_at" | "approved_by_user_id">
>;

export const updateMemberByGuildAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: GuildMemberPatch }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update(data.patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Approve: publish the profile and stamp who approved it and when. */
export const approveMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { error } = await supabase
      .from("members")
      .update({
        status: "published",
        approved_at: new Date().toISOString(),
        approved_by_user_id: userData.user.id,
      })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const declineMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ status: "declined" }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const suspendMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ status: "suspended" }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const correctMemberType = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; memberType: MemberType }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ member_type: data.memberType }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setTrailEligible = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; eligible: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("members")
      .update({ trail_eligible: data.eligible })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setDuesReceived = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; receivedAt: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("members")
      .update({ dues_received_at: data.receivedAt })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Replace the roster table's Actions cell with the fuller action set**

In `src/components/guild/RosterTable.tsx`, replace the `<td>` added in Task 16 with:

```tsx
<td className="px-3 py-3">
  <div className="flex flex-wrap gap-1">
    {entry.claimState === "unclaimed" && (
      <button
        type="button"
        onClick={() => handleInvite(entry)}
        disabled={invitingId === entry.member.id}
        className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
      >
        {invitingId === entry.member.id ? "Inviting…" : "Invite"}
      </button>
    )}
    {entry.member.status !== "published" && (
      <button
        type="button"
        onClick={() => runAction(() => approveMember({ data: { memberId: entry.member.id } }))}
        className="min-h-11 rounded-md border border-open/50 px-3 py-1 text-sm font-medium text-open hover:bg-open/10"
      >
        Approve
      </button>
    )}
    {entry.member.status !== "declined" && (
      <button
        type="button"
        onClick={() => runAction(() => declineMember({ data: { memberId: entry.member.id } }))}
        className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
      >
        Decline
      </button>
    )}
    {entry.member.status !== "suspended" && (
      <button
        type="button"
        onClick={() => runAction(() => suspendMember({ data: { memberId: entry.member.id } }))}
        className="min-h-11 rounded-md border border-danger/50 px-3 py-1 text-sm font-medium text-danger hover:bg-danger/10"
      >
        Suspend
      </button>
    )}
    <button
      type="button"
      onClick={() => runAction(() => setTrailEligible({ data: { memberId: entry.member.id, eligible: !entry.member.trail_eligible } }))}
      className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
    >
      {entry.member.trail_eligible ? "Remove from Trail" : "Add to Trail"}
    </button>
  </div>
</td>
```

Add the `runAction` helper and the new imports alongside the ones from Task 16:

```tsx
import { approveMember, declineMember, suspendMember, setTrailEligible } from "@/lib/guild/member-admin-actions.server";
```

```tsx
async function runAction(action: () => Promise<unknown>) {
  try {
    await action();
    await router.invalidate();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : "That action failed.");
  }
}
```

Member-type correction is exposed differently — as an inline, editable `<select>` in the "Type" column rather than a button, since it's a correction to an existing field, not a one-shot action. Replace the plain `<td className="px-3 py-3 capitalize">{entry.member.member_type}</td>` cell with:

```tsx
<td className="px-3 py-3">
  <label className="sr-only" htmlFor={`member-type-${entry.member.id}`}>
    Member type for {entry.member.business_name}
  </label>
  <select
    id={`member-type-${entry.member.id}`}
    value={entry.member.member_type}
    onChange={(e) =>
      runAction(() => correctMemberType({ data: { memberId: entry.member.id, memberType: e.target.value as MemberType } }))
    }
    className="min-h-11 rounded-md border border-border bg-background px-2 text-sm capitalize"
  >
    <option value="producer">Producer</option>
    <option value="mobile">Mobile</option>
    <option value="allied">Allied Member</option>
  </select>
</td>
```

(add `correctMemberType` to the same import line as the other new actions above).

- [ ] **Step 3: Verify the project type-checks and dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors; the roster table's action buttons render per row.

- [ ] **Step 4: Commit**

```bash
git add src/lib/guild/member-admin-actions.server.ts src/components/guild/RosterTable.tsx
git commit -m "feat: add roster approve/decline/suspend/type-correction/trail actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 18: Roster — "Edit as them" button

**Files:**
- Modify: `src/components/guild/RosterTable.tsx`

**Interfaces:**
- Consumes: `startImpersonation` (Task 13).

- [ ] **Step 1: Add the button and its handler**

In `src/components/guild/RosterTable.tsx`, add the import:

```tsx
import { startImpersonation } from "@/lib/guild/impersonation.server";
```

Add a handler alongside `handleInvite`/`runAction`:

```tsx
async function handleEditAsThem(entry: RosterEntry) {
  await startImpersonation({ data: { memberId: entry.member.id } });
  await router.navigate({ to: "/admin/basics" });
}
```

This calls the server function directly and navigates client-side afterward — deliberately not relying on `startImpersonation` throwing a `redirect()`, since it's invoked from a plain button click, not a route's `beforeLoad`/`loader`; TanStack Router's automatic redirect-following only applies to those two lifecycle points (this plan's Decision 3 and the code comment in `impersonation.server.ts`, Task 13).

Add the button to every row's action cell, alongside the buttons from Task 17:

```tsx
<button
  type="button"
  onClick={() => handleEditAsThem(entry)}
  className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
>
  Edit as them
</button>
```

"Edit as them" is available on every row regardless of claim state or status — a Guild admin may need to fix up an unclaimed or draft member's profile before the member ever signs in themselves.

- [ ] **Step 2: Verify the project type-checks and dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors; clicking "Edit as them" (once Tasks 19-20 land) will land on `/admin/basics` with the impersonation banner visible. This task alone only wires the button and the cookie-setting call — the receiving end (`/admin`'s guard and shell) is Tasks 19-20.

- [ ] **Step 3: Commit**

```bash
git add src/components/guild/RosterTable.tsx
git commit -m "feat: add the roster's Edit as them button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 19: Modify `requireMemberSession.server.ts` + `admin.tsx` for impersonation

**Files:**
- Modify: `src/lib/auth/require-member-session.server.ts`
- Modify: `src/routes/admin.tsx`

**Interfaces:**
- Produces: `MemberSession` (replaces the Member Admin phase's bare `{ memberId, userId }` return shape with a superset — `memberId`/`userId` keep their exact names, so this is additive, not breaking).
- Consumes: `readImpersonationState`, `touchImpersonationActivity`, `getMemberDisplayName` (Task 13).

The Member Admin phase's `src/lib/auth/require-member-session.server.ts` (its own Task 4) currently reads:

```ts
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

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

- [ ] **Step 1: Replace it with the impersonation-aware version**

```ts
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";
import { readImpersonationState, touchImpersonationActivity } from "@/lib/guild/impersonation.server";

export type MemberSession = {
  memberId: string;
  userId: string;
  isImpersonating: boolean;
  actorUserId: string;
};

/**
 * Runs once, in /admin's own beforeLoad, inherited by every child route.
 * Redirects to /signin if there's no session, to /guild if the signed-in
 * user is a Guild admin rather than a member editor AND isn't currently
 * impersonating anyone, and to /signin?notice=no-account for the "neither
 * role" edge case (Member Admin phase's Decision 1).
 *
 * Guild Admin phase addition: a valid, non-expired impersonation cookie
 * overrides normal role routing entirely. The signed-in user is still,
 * underneath, the Guild admin's own Supabase Auth session -- auth.uid()
 * never changes during impersonation (this plan's Decision 5) -- so RLS's
 * is_guild_admin() policies are what actually grant the resulting writes;
 * this function's only job during impersonation is to report the
 * IMPERSONATED member's id as memberId, so every existing child route and
 * mutation file keeps working completely unmodified.
 */
export const requireMemberSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<MemberSession> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      throw redirect({ href: "/signin" });
    }

    const impersonation = await readImpersonationState();
    if (impersonation) {
      if (impersonation.actorUserId !== user.id) {
        // The signed-in browser session doesn't match who the cookie says
        // started this impersonation (e.g. a different admin signed in on
        // the same device afterward). Never honor a mismatched cookie.
        throw redirect({ href: "/guild/roster" });
      }
      await touchImpersonationActivity(impersonation);
      return {
        memberId: impersonation.memberId,
        userId: user.id,
        isImpersonating: true,
        actorUserId: impersonation.actorUserId,
      };
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);

    if (routing.role === "guild_admin") {
      throw redirect({ href: "/guild" });
    }
    if (routing.role === "none") {
      throw redirect({ href: "/signin?notice=no-account" });
    }

    return { memberId: routing.memberId, userId: user.id, isImpersonating: false, actorUserId: user.id };
  },
);
```

- [ ] **Step 2: Modify `admin.tsx` to carry `isImpersonating` into route context and fetch the impersonated member's name**

The Member Admin phase's `src/routes/admin.tsx` (its own Task 4) currently reads:

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

Replace it with:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { getMemberDisplayName } from "@/lib/guild/impersonation.server";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await requireMemberSession();
    return {
      memberId: session.memberId,
      userId: session.userId,
      isImpersonating: session.isImpersonating,
    };
  },
  loader: async ({ context }) =>
    context.isImpersonating ? getMemberDisplayName({ data: { memberId: context.memberId } }) : null,
  head: () => ({ meta: [{ title: "Member admin — IE Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { memberId, isImpersonating } = Route.useRouteContext();
  const impersonatedMemberName = Route.useLoaderData();
  return (
    <AdminShell memberId={memberId} isImpersonating={isImpersonating} impersonatedMemberName={impersonatedMemberName}>
      <Outlet />
    </AdminShell>
  );
}
```

- [ ] **Step 3: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: an error inside `AdminShell.tsx` about unknown props (`isImpersonating`, `impersonatedMemberName`) until Task 20 lands — acceptable at this point; don't commit until Task 20 closes that gap.

- [ ] **Step 4: Verify the redirect-precedence behavior manually**

```bash
npm run dev
```

Visit `/admin` while signed in as a plain Guild admin with no active impersonation cookie. Expected: redirected to `/guild` (unchanged from the Member Admin phase's own behavior). Start an impersonation session from `/guild/roster`'s "Edit as them" button (once Task 18 is wired and this task is committed together with Task 20), then visit `/admin/hours` directly. Expected: loads normally, using the impersonated member's `memberId`, not a redirect to `/guild`.

- [ ] **Step 5: Commit** (together with Task 20)

```bash
git add src/lib/auth/require-member-session.server.ts src/routes/admin.tsx
git commit -m "feat: make the /admin auth guard impersonation-aware

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 20: Modify `AdminShell.tsx` — the non-dismissable banner and Stop

**Files:**
- Modify: `src/components/admin/AdminShell.tsx`

**Interfaces:**
- Consumes: `stopImpersonation` (Task 13).

The Member Admin phase's `src/components/admin/AdminShell.tsx` (its own Task 4) currently exports:

```tsx
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
      <nav ...>...</nav>
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

- [ ] **Step 1: Add the banner, its props, and the Stop action**

Add this import at the top of the file, alongside the existing `Link` import:

```tsx
import { useRouter } from "@tanstack/react-router";
import { stopImpersonation } from "@/lib/guild/impersonation.server";
```

Replace the function signature and its opening `<div>` with:

```tsx
export function AdminShell({
  memberId,
  isImpersonating = false,
  impersonatedMemberName = null,
  publishSlot,
  children,
}: {
  memberId: string;
  isImpersonating?: boolean;
  impersonatedMemberName?: string | null;
  publishSlot?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  return (
    <div className="flex min-h-screen flex-col pb-24">
      {isImpersonating && (
        <div
          role="alert"
          className="flex min-h-11 flex-wrap items-center justify-between gap-2 bg-danger px-4 py-2 text-sm font-medium text-white"
        >
          <span>
            Editing as {impersonatedMemberName ?? "this member"}. Every change here is logged against your own
            Guild admin account.
          </span>
          <button
            type="button"
            onClick={handleStop}
            className="min-h-11 rounded-md border border-white/60 px-3 py-1 font-semibold hover:bg-white/10"
          >
            Stop
          </button>
        </div>
      )}

      <nav ...unchanged from the Member Admin phase's own Task 4...>
```

Leave the rest of the file — the `<nav>` of section links, the `<main>`, and the fixed `publishSlot` bar at the bottom — exactly as the Member Admin phase built it. This banner is deliberately rendered *outside* and *above* the section nav, so it's the first thing on the page regardless of which `/admin/*` screen is showing, and it has no close/dismiss control at all (spec: "cannot be dismissed").

The banner has no `onClick` guard preventing it from being closed because there is no close button in the markup at all — that omission is the actual mechanism satisfying "non-dismissable," not a disabled button that could later be re-enabled by mistake.

- [ ] **Step 2: Verify the project type-checks and the dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no errors (this closes the gap Task 19 left open). Sign in as the seeded Guild admin, start impersonation from `/guild/roster`, confirm the red banner renders on `/admin/basics` and every other `/admin/*` section, and that clicking "Stop" returns to `/guild/roster` and that a subsequent visit to `/admin` redirects to `/guild` again (the cookie is gone).

- [ ] **Step 3: Commit** (together with Task 19)

```bash
git add src/lib/auth/require-member-session.server.ts src/routes/admin.tsx src/components/admin/AdminShell.tsx
git commit -m "feat: add the non-dismissable impersonation banner to /admin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 21: Wire audit logging into the existing member-mutation files

**Files:**
- Create: `src/lib/guild/audit-log-coverage.test.ts`
- Modify: `src/lib/members/member-basics.server.ts` (worked example, shown in full)
- Modify: the remaining 13 files listed in the table below (one mechanical addition each)

**Interfaces:**
- Consumes: `recordAuditLogIfImpersonating` (Task 13).

This is the task that makes approach (b) (this plan's Decision 1-2) actually cover every existing mutation, not just the one this task shows in full. Read the whole task before starting — the coverage test in Step 1 is written first, deliberately failing, and stays the acceptance criterion for every other step.

- [ ] **Step 1: Write the failing coverage test**

Create `src/lib/guild/audit-log-coverage.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every session-authenticated member-mutation file from the Member Admin
 * phase must call recordAuditLogIfImpersonating after its write(s) --
 * this plan's Decision 2: the practical, checked substitute for a
 * Postgres-trigger-level guarantee. Deliberately excludes
 * creator-upload.server.ts, ics-refresh-cron.server.ts, and
 * hours-stale-cron.server.ts, which run entirely on the service-role
 * client with no user session and are never reachable from an
 * impersonated request.
 */
const MEMBER_MUTATION_FILES = [
  "src/lib/members/member-basics.server.ts",
  "src/lib/hours/hours-editor.server.ts",
  "src/lib/media/media-gallery.server.ts",
  "src/lib/media/carousel.server.ts",
  "src/lib/media/cover.server.ts",
  "src/lib/media/logo.server.ts",
  "src/lib/media/upload-tokens.server.ts",
  "src/lib/media/review-tray.server.ts",
  "src/lib/hours/publish-gate.server.ts",
  "src/lib/theme/member-theme.server.ts",
  "src/lib/events/events.server.ts",
  "src/lib/events/calendar-connection.server.ts",
  "src/lib/links/member-links.server.ts",
  "src/lib/members/discount.server.ts",
];

describe("audit-log coverage", () => {
  it.each(MEMBER_MUTATION_FILES)("%s calls recordAuditLogIfImpersonating", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    expect(source).toContain("recordAuditLogIfImpersonating");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for every file**

```bash
npm test -- audit-log-coverage
```

Expected: FAIL, 14 failures — none of these files import the wrapper yet.

- [ ] **Step 3: Modify `member-basics.server.ts` — the worked example**

The Member Admin phase's `src/lib/members/member-basics.server.ts` (its own Task 9) currently reads:

```ts
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
```

Add the import at the top of the file:

```ts
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
```

And change the handler's body to log right after the write succeeds, before returning:

```ts
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

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { ok: true as const };
  });
```

This is the exact pattern every remaining file below follows: import the wrapper, call it once per real write, after that write's own error check, before the function returns.

- [ ] **Step 4: Apply the same pattern to the remaining 13 files**

Each of these files was created by the Member Admin phase with its own exports and internal structure this plan doesn't have verbatim — but every one of them already follows the same shape as `member-basics.server.ts` above (a `createServerFn` handler that calls `getSupabaseServerClientForRequest()`, performs one or more `supabase.from(TABLE).insert/update/delete(...)` calls, checks `error`, and returns). For each file, add the same import used in Step 3 and add one `await recordAuditLogIfImpersonating({...})` call immediately after each write's own error check, using the table name and row id shown below:

| File | Table(s) written | `rowId` source | Notes |
| --- | --- | --- | --- |
| `src/lib/hours/hours-editor.server.ts` | `hours`, `special_hours` | the row's own `id` (returned row on insert, the input id on update/delete) | Two tables — log once per table actually touched by the call, not once per file. |
| `src/lib/media/media-gallery.server.ts` | `media_assets` | the asset's `id` | Action is `insert` on upload, `update` on metadata edits, `delete` on removal — match whichever the call actually performs. |
| `src/lib/media/carousel.server.ts` | `carousel_slides` | the slide's `id` | Covers assign/reorder/remove. |
| `src/lib/media/cover.server.ts` | `members` (`cover_asset_id`, `cover_crop`) | `memberId` | Action `update`. |
| `src/lib/media/logo.server.ts` | `members` (`logo_asset_id`) and `media_assets` (the new logo asset) | `memberId` for the `members` write, the asset's `id` for the `media_assets` write | Two writes in one action — log both. |
| `src/lib/media/upload-tokens.server.ts` | `upload_tokens` | the token row's `id` | `insert` on creation, `update` on revoke. |
| `src/lib/media/review-tray.server.ts` | `media_assets` (`review_status`) | the asset's `id` | Action `update` (approve/reject). |
| `src/lib/hours/publish-gate.server.ts` | `members` (`status`, `published_at`, `hours_confirmed_at`) | `memberId` | Action `update`. |
| `src/lib/theme/member-theme.server.ts` | `members` (`theme`) | `memberId` | Action `update`. |
| `src/lib/events/events.server.ts` | `events` | the event's `id` | Covers hand-entry create/edit/delete and overlay-status writes. |
| `src/lib/events/calendar-connection.server.ts` | `calendar_connections` | the connection's `id` | Covers connect/edit/disconnect. |
| `src/lib/links/member-links.server.ts` | `member_links` | the link's `id` | Covers add/edit/remove/reorder. |
| `src/lib/members/discount.server.ts` | `members` (`discount_percent`, `discount_no_fixed_percent`, `discount_redeem_text`) | `memberId` | Action `update`. |

For a file that performs more than one distinct write (`hours-editor.server.ts`, `logo.server.ts`), add one call per write, not one call for the whole function — the coverage test in Step 1 only checks that the file *mentions* the wrapper at all; getting the call count right per write is a manual correctness check, not something the automated test can fully verify by itself. Treat the table above as the spec for that manual check during code review, not as optional guidance.

- [ ] **Step 5: Run the coverage test and confirm it passes for all 14 files**

```bash
npm test -- audit-log-coverage
```

Expected: PASS, 14 tests.

- [ ] **Step 6: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Manually verify one end-to-end impersonated write is actually logged**

```bash
npm run dev
```

Sign in as the seeded Guild admin, start impersonation on any member from `/guild/roster`, edit that member's tagline on `/admin/basics`, then check:

```bash
npx supabase db execute --sql "
select actor_user_id, member_id, table_name, action, created_at
from audit_log order by created_at desc limit 1;
"
```

Expected: one row, `table_name = 'members'`, `action = 'update'`, `actor_user_id` equal to the signed-in Guild admin's own user id (not the impersonated member's).

- [ ] **Step 8: Commit**

```bash
git add src/lib/guild/audit-log-coverage.test.ts src/lib/members/member-basics.server.ts src/lib/hours/hours-editor.server.ts src/lib/media/media-gallery.server.ts src/lib/media/carousel.server.ts src/lib/media/cover.server.ts src/lib/media/logo.server.ts src/lib/media/upload-tokens.server.ts src/lib/media/review-tray.server.ts src/lib/hours/publish-gate.server.ts src/lib/theme/member-theme.server.ts src/lib/events/events.server.ts src/lib/events/calendar-connection.server.ts src/lib/links/member-links.server.ts src/lib/members/discount.server.ts
git commit -m "feat: log every impersonated write against the real actor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 22: Close the public-profile "preview" gap

**Files:**
- Modify: `src/lib/members/member-profile.server.ts`
- Modify: `src/routes/members.$slug.tsx`
- Create: `src/components/guild/ProfilePreviewBanner.tsx`

**Interfaces:**
- Produces: `MemberProfileData.isPreview`, `MemberProfileData.isImpersonatedPreview`.
- Consumes: `getSupabaseServerClientForRequest`, `readImpersonationState` (Task 13), `stopImpersonation` (Task 13).

This closes the exact gap the Public Member Profile phase's own `getMemberProfileData` comment flagged and left open: "profile is a draft or still an application: 404 to the public, preview banner to its own members... tracked here, not silently dropped" (this plan's Decision 7).

- [ ] **Step 1: Modify `getMemberProfileData` to use the session-bound client when a session exists**

The Public Member Profile phase's `src/lib/members/member-profile.server.ts` currently opens its handler with:

```ts
export const getMemberProfileData = createServerFn({ method: "GET" })
  .inputValidator((data: GetMemberProfileInput) => data)
  .handler(async ({ data }): Promise<MemberProfileData> => {
    const supabase = await getSupabaseServerClient();
    const request = getRequest();
    const siteOrigin = new URL(request.url).origin;

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();

    if (memberError || !member) {
      throw notFound();
    }

    const typedMember = member as MemberRow;
    ...
```

Replace the client selection and the `MemberProfileData` return shape:

Add these imports:

```ts
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
```

Add two fields to the `MemberProfileData` type:

```ts
export type MemberProfileData = {
  member: MemberRow;
  // ...every existing field, unchanged...
  isPreview: boolean;
  isImpersonatedPreview: boolean;
};
```

Replace the client-selection and member-lookup block with:

```ts
    // Try the session-bound client whenever a session exists at all, so a
    // signed-in member (or an impersonating Guild admin) previewing an
    // unpublished profile gets through RLS's owner/guild-admin select
    // policies (schema plan, Tasks 3-4) instead of only the anon "published
    // rows" policy. A signed-out visitor, or a signed-in user who isn't
    // this row's own editor or an impersonating admin, still gets nothing
    // back from either policy branch -- RLS decides this, not application
    // code, same as everywhere else in this build.
    const sessionClient = await getSupabaseServerClientForRequest();
    const { data: sessionUser } = await sessionClient.auth.getUser();
    const supabase = sessionUser?.user ? sessionClient : await getSupabaseServerClient();
    const request = getRequest();
    const siteOrigin = new URL(request.url).origin;

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();

    if (memberError || !member) {
      throw notFound();
    }

    const typedMember = member as MemberRow;
    const isPreview = typedMember.status !== "published";
    const impersonation = isPreview ? await readImpersonationState() : null;
    const isImpersonatedPreview = Boolean(impersonation && impersonation.memberId === typedMember.id);
```

And add the two new fields to the function's final `return { ... }` object:

```ts
    return {
      member: typedMember,
      // ...every existing field, unchanged...
      isPreview,
      isImpersonatedPreview,
    };
```

- [ ] **Step 2: Implement the preview banner component**

Create `src/components/guild/ProfilePreviewBanner.tsx`:

```tsx
import { useRouter } from "@tanstack/react-router";
import { stopImpersonation } from "@/lib/guild/impersonation.server";

/**
 * The same non-dismissable treatment as AdminShell's impersonation banner
 * (spec: "a band sits on every admin screen and every preview for the
 * duration"), rendered on the public /members/$slug page when the viewer
 * is either the member's own editor (previewing their own unpublished
 * profile) or a Guild admin currently impersonating this exact member.
 */
export function ProfilePreviewBanner({ isImpersonatedPreview }: { isImpersonatedPreview: boolean }) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  return (
    <div
      role="alert"
      className="flex min-h-11 flex-wrap items-center justify-between gap-2 bg-danger px-4 py-2 text-sm font-medium text-white"
    >
      <span>
        {isImpersonatedPreview
          ? "You're previewing this member's profile while editing as them. Every change is logged against your own Guild admin account."
          : "This is a preview of your profile. It isn't published yet — only you can see this page."}
      </span>
      {isImpersonatedPreview && (
        <button
          type="button"
          onClick={handleStop}
          className="min-h-11 rounded-md border border-white/60 px-3 py-1 font-semibold hover:bg-white/10"
        >
          Stop
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render it from the route**

The Public Member Profile phase's `src/routes/members.$slug.tsx` currently ends with:

```tsx
function MemberProfilePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <MemberProfileTemplate data={data} search={search} />;
}
```

Add the import:

```tsx
import { ProfilePreviewBanner } from "@/components/guild/ProfilePreviewBanner";
```

Replace the component body:

```tsx
function MemberProfilePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <>
      {data.isPreview && <ProfilePreviewBanner isImpersonatedPreview={data.isImpersonatedPreview} />}
      <MemberProfileTemplate data={data} search={search} />
    </>
  );
}
```

- [ ] **Step 4: Verify the project type-checks and the dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors. Sign in as a member editor and visit their own `/members/$slug` while their profile is still `draft` — expect the plain preview banner, not a 404. Start impersonation on that same member from `/guild/roster` and visit the same URL — expect the impersonation-flavored banner with a working "Stop" button. Sign out entirely and visit the same URL — expect the ordinary public 404, unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/members/member-profile.server.ts src/routes/members.\$slug.tsx src/components/guild/ProfilePreviewBanner.tsx
git commit -m "feat: preview unpublished profiles for their own editors and impersonating admins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 23: Sign-out ends impersonation; confirm email/sign-in changes are structurally blocked

**Files:**
- Create: `src/lib/auth/sign-out.server.ts`
- Modify: `src/components/admin/AdminShell.tsx`

**Interfaces:**
- Produces: `signOutEverything()`. Consumed by `GuildShell.tsx` (already wired in Task 11) and `AdminShell.tsx` (this task).
- Consumes: `getSupabaseServerClientForRequest`, `IMPERSONATION_COOKIE_NAME` (Task 13).

No sign-out affordance exists anywhere in this codebase yet — the Member Admin phase never added one to `AdminShell`, and this plan's own `GuildShell` (Task 11) already calls a `signOutEverything` that doesn't exist until now (this plan's Decision 14). This task adds the smallest one that satisfies "ends... on sign-out" (spec, "Editing as a member") without a broader navigation redesign.

- [ ] **Step 1: Implement the combined sign-out**

Create `src/lib/auth/sign-out.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/guild/impersonation.server";

/**
 * Ends impersonation and the real Supabase Auth session together, in one
 * server action, so impersonation can never outlive the sign-out that was
 * supposed to end it (spec: session "ends on sign-out and on a short idle
 * timeout").
 */
export const signOutEverything = createServerFn({ method: "POST" }).handler(async () => {
  setCookie(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const supabase = await getSupabaseServerClientForRequest();
  await supabase.auth.signOut();

  return { ok: true as const };
});
```

- [ ] **Step 2: Add a "Sign out" action to `AdminShell`**

In `src/components/admin/AdminShell.tsx`, add the import:

```tsx
import { signOutEverything } from "@/lib/auth/sign-out.server";
```

Add a handler alongside `handleStop` (Task 20):

```tsx
async function handleSignOut() {
  await signOutEverything();
  await router.navigate({ to: "/" });
}
```

Add a "Sign out" button to the section nav, after the existing `NAV_ITEMS.map(...)` block:

```tsx
<button
  type="button"
  onClick={handleSignOut}
  className="ml-auto min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
>
  Sign out
</button>
```

- [ ] **Step 3: Confirm no admin route exposes an email/sign-in field**

```bash
grep -rn "auth.users\|member_users.user_id\|type=\"email\"\|contact_email" src/routes/admin.*.tsx src/components/admin/*.tsx
```

Expected: the only `type="email"` matches, if any, belong to `links`/`discount` contact fields already understood to be business contact addresses (`members.contact_email`), never `auth.users.email`; no match touches `auth.users` or `member_users.user_id` at all. This confirms this plan's Decision 6 by direct inspection rather than by assertion alone — record the actual grep output in the PR description or task notes when running this step for real.

- [ ] **Step 4: Verify the project type-checks and the dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors. Start impersonation, click "Sign out" from `/admin`, confirm you land signed out on `/`, and that visiting `/admin` again redirects to `/signin` (not to a still-impersonated `/admin/basics`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/sign-out.server.ts src/components/admin/AdminShell.tsx
git commit -m "feat: end impersonation together with sign-out

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 24: Inquiries — server functions

**Files:**
- Create: `src/lib/guild/inquiries.server.ts`

**Interfaces:**
- Produces: `getInquiries(filter)`, `markInquiryHandled(inquiryId)`, `setUpInquiryAsMember(input)`.
- Consumes: `getSupabaseServerClientForRequest`, `createMemberRecord` (Task 12).

- [ ] **Step 1: Implement the list/filter and mark-handled functions**

Create `src/lib/guild/inquiries.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { createMemberRecord } from "@/lib/guild/create-member.server";
import type { InquiryRow, MemberType } from "@/lib/supabase/types";

export type InquiryFilter = "open" | "handled" | "all";

/** Open / Handled / All — artboard N's own filter set, no "read" state (spec, "inquiries" table notes). */
export const getInquiries = createServerFn({ method: "GET" })
  .inputValidator((data: { filter: InquiryFilter }) => data)
  .handler(async ({ data }): Promise<InquiryRow[]> => {
    const supabase = await getSupabaseServerClientForRequest();
    let query = supabase.from("inquiries").select("*").order("created_at", { ascending: false });
    if (data.filter !== "all") {
      query = query.eq("status", data.filter);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as InquiryRow[];
  });

export const markInquiryHandled = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { error } = await supabase
      .from("inquiries")
      .update({ status: "handled", handled_by_user_id: userData.user.id, handled_at: new Date().toISOString() })
      .eq("id", data.inquiryId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * "Set them up as a member" (task brief): creates a members row via the
 * same createMemberRecord() the roster's own "create a new member" action
 * uses, sets inquiries.converted_member_id, and pre-fills the new member's
 * business_name/contact_email from the inquiry's name/email -- there's no
 * other business-identifying data on an inquiry row to draw from, and this
 * plan doesn't invent a mapping the schema doesn't support. city and
 * member_type have no equivalent on an inquiry at all, so this action asks
 * for them explicitly rather than guessing.
 */
export const setUpInquiryAsMember = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiryId: string; city: string; memberType: MemberType }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: inquiry, error: inquiryError } = await supabase
      .from("inquiries")
      .select("*")
      .eq("id", data.inquiryId)
      .single();
    if (inquiryError || !inquiry) throw new Error(inquiryError?.message ?? "Inquiry not found.");
    const typedInquiry = inquiry as InquiryRow;

    const member = await createMemberRecord({
      data: {
        businessName: typedInquiry.name,
        city: data.city,
        memberType: data.memberType,
        contactEmail: typedInquiry.email,
      },
    });

    const { error: updateError } = await supabase
      .from("inquiries")
      .update({ converted_member_id: member.id })
      .eq("id", data.inquiryId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const, member };
  });
```

`business_name` is pre-filled from the inquiry's `name` field, since a contact-form submitter types their own name there (the spec's contact form, artboard O, has no separate business-name field) — a Guild admin correcting this to the actual business name before publishing is expected, same as any other roster-created draft.

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guild/inquiries.server.ts
git commit -m "feat: add inquiries list/filter, mark-handled, and set-up-as-member

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 25: Inquiries — UI

**Files:**
- Create: `src/routes/guild.inquiries.tsx`
- Create: `src/components/guild/InquiriesTable.tsx`

**Interfaces:**
- Consumes: `getInquiries`, `markInquiryHandled`, `setUpInquiryAsMember` (Task 24), `resolveConfirmationDisplayState` (Task 8).

- [ ] **Step 1: Implement the route**

Create `src/routes/guild.inquiries.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getInquiries, type InquiryFilter } from "@/lib/guild/inquiries.server";
import { InquiriesTable } from "@/components/guild/InquiriesTable";

export const Route = createFileRoute("/guild/inquiries")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (search.filter as InquiryFilter | undefined) ?? "open",
  }),
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ deps }) => getInquiries({ data: { filter: deps.filter } }),
  component: InquiriesRoute,
});

function InquiriesRoute() {
  const inquiries = Route.useLoaderData();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <InquiriesTable
      inquiries={inquiries}
      filter={filter}
      onFilterChange={(next) => navigate({ search: { filter: next } })}
    />
  );
}
```

Defaulting to `filter: "open"` matches the spec's own framing of this screen as a triage queue — the first thing a Guild admin should see is what still needs attention, not the full history.

- [ ] **Step 2: Implement the table**

Create `src/components/guild/InquiriesTable.tsx`:

```tsx
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { markInquiryHandled, setUpInquiryAsMember, type InquiryFilter } from "@/lib/guild/inquiries.server";
import { resolveConfirmationDisplayState } from "@/lib/inquiries/confirmation-state";
import type { InquiryRow, MemberType } from "@/lib/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONFIRMATION_LABEL: Record<ReturnType<typeof resolveConfirmationDisplayState>, string> = {
  sent: "Confirmation email sent",
  not_yet_sent: "Confirmation email not yet sent",
  failed_to_send: "Confirmation email failed to send",
};

function formatSentAt(sentAt: string): string {
  return new Date(sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function InquiriesTable({
  inquiries,
  filter,
  onFilterChange,
}: {
  inquiries: InquiryRow[];
  filter: InquiryFilter;
  onFilterChange: (filter: InquiryFilter) => void;
}) {
  const router = useRouter();
  const [convertingId, setConvertingId] = useState<string | null>(null);

  async function handleMarkHandled(inquiry: InquiryRow) {
    await markInquiryHandled({ data: { inquiryId: inquiry.id } });
    await router.invalidate();
  }

  async function handleSetUpAsMember(inquiry: InquiryRow) {
    const city = window.prompt(`City for ${inquiry.name}:`);
    if (!city) return;
    const memberTypeInput = window.prompt("Member type (producer, mobile, or allied):", "producer");
    const memberType = (memberTypeInput ?? "producer") as MemberType;
    setConvertingId(inquiry.id);
    try {
      await setUpInquiryAsMember({ data: { inquiryId: inquiry.id, city, memberType } });
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not set up this inquiry as a member.");
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="sr-only" htmlFor="inquiries-filter">
          Filter inquiries
        </label>
        <Select value={filter} onValueChange={(value) => onFilterChange(value as InquiryFilter)}>
          <SelectTrigger id="inquiries-filter" className="h-11 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="handled">Handled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul className="space-y-3">
        {inquiries.map((inquiry) => {
          const confirmationState = resolveConfirmationDisplayState({
            confirmationSentAt: inquiry.confirmation_sent_at,
            createdAt: inquiry.created_at,
            now: Date.now(),
          });
          return (
            <li key={inquiry.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{inquiry.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <a href={`mailto:${inquiry.email}`} className="underline">
                      {inquiry.email}
                    </a>
                    {inquiry.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${inquiry.phone}`} className="underline">
                          {inquiry.phone}
                        </a>
                      </>
                    )}
                  </p>
                  {inquiry.wants_membership_info && (
                    <span className="mt-1 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      Membership lead
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {inquiry.status === "open" && (
                    <button
                      type="button"
                      onClick={() => handleMarkHandled(inquiry)}
                      className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                    >
                      Mark handled
                    </button>
                  )}
                  {!inquiry.converted_member_id && (
                    <button
                      type="button"
                      onClick={() => handleSetUpAsMember(inquiry)}
                      disabled={convertingId === inquiry.id}
                      className="min-h-11 rounded-md border border-open/50 px-3 py-1 text-sm font-medium text-open hover:bg-open/10"
                    >
                      {convertingId === inquiry.id ? "Setting up…" : "Set them up as a member"}
                    </button>
                  )}
                </div>
              </div>
              {inquiry.message && <p className="mt-2 text-sm">{inquiry.message}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {confirmationState === "sent" && inquiry.confirmation_sent_at
                  ? `Confirmation email sent automatically at ${formatSentAt(inquiry.confirmation_sent_at)}.`
                  : CONFIRMATION_LABEL[confirmationState]}
              </p>
            </li>
          );
        })}
        {inquiries.length === 0 && <li className="py-6 text-center text-muted-foreground">No inquiries here.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify the project type-checks and dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors; `/guild/inquiries` renders the Open/Handled/All filter and the list.

- [ ] **Step 4: Commit**

```bash
git add src/routes/guild.inquiries.tsx src/components/guild/InquiriesTable.tsx
git commit -m "feat: add the inquiries triage screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 26: Brand editor — server functions

**Files:**
- Create: `src/lib/brand/brand-settings.server.ts`

**Interfaces:**
- Produces: `SaveBrandSettingsInput`, `getBrandSettings()`, `saveBrandSettings(input)`.
- Consumes: `BRAND_TOKEN_NAMES`/`DEFAULT_BRAND_TOKENS`/`BrandTokens` (Task 10), `meetsWcagAA` (Task 9), `FONT_PAIRINGS`/`getFontPairingById` (Task 10), `getSupabaseServerClientForRequest`.

- [ ] **Step 1: Implement the get/save functions**

Create `src/lib/brand/brand-settings.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import { getFontPairingById } from "@/lib/brand/font-pairings";
import { meetsWcagAA } from "@/lib/brand/contrast";
import type { BrandSettingsRow } from "@/lib/supabase/types";

/**
 * The editor exposes exactly three colour controls -- a shared hue plus
 * --brand's and --brand-bright's independent lightness values (this
 * plan's Decision 11) -- and a font-pairing id from the curated catalog.
 * Chroma stays fixed at the spec's approved values.
 */
export type SaveBrandSettingsInput = {
  hue: number;
  brandLightness: number;
  brandBrightLightness: number;
  fontPairingId: string;
};

const BRAND_CHROMA = 0.15;
const BRAND_BRIGHT_CHROMA = 0.165;
const WHITE_OKLCH = "oklch(1 0 0)";

export const getBrandSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ fontPairingId: string; tokens: BrandTokens } | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data, error } = await supabase.from("brand_settings").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as BrandSettingsRow;
    return { fontPairingId: row.font_pairing, tokens: row.tokens as BrandTokens };
  },
);

/**
 * Refuses to save a failing combination (spec: "refuses to save a
 * combination that fails 4.5:1") -- validated here, server-side, not only
 * in the editor UI, since this is the actual boundary a bad value could
 * cross. On success, only the brand/brand-bright keys change; every other
 * token is carried through unchanged from the current row, or from
 * DEFAULT_BRAND_TOKENS on the very first save (this plan's Decision 12).
 */
export const saveBrandSettings = createServerFn({ method: "POST" })
  .inputValidator((data: SaveBrandSettingsInput) => data)
  .handler(async ({ data }) => {
    if (!getFontPairingById(data.fontPairingId)) {
      throw new Error("Unknown font pairing.");
    }
    if (data.hue < 0 || data.hue >= 360) {
      throw new Error("Hue must be between 0 and 360.");
    }
    if (data.brandLightness <= 0 || data.brandLightness >= 1 || data.brandBrightLightness <= 0 || data.brandBrightLightness >= 1) {
      throw new Error("Lightness must be between 0 and 1.");
    }

    const brandOklch = `oklch(${data.brandLightness} ${BRAND_CHROMA} ${data.hue})`;
    const brandBrightOklch = `oklch(${data.brandBrightLightness} ${BRAND_BRIGHT_CHROMA} ${data.hue})`;

    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { data: existing, error: existingError } = await supabase.from("brand_settings").select("*").maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const currentTokens = (existing as BrandSettingsRow | null)?.tokens ?? DEFAULT_BRAND_TOKENS;

    if (!meetsWcagAA(brandOklch, WHITE_OKLCH)) {
      throw new Error("This amber is too light for white text on --brand. Lower the lightness and try again.");
    }
    const inkOklch = (currentTokens as BrandTokens).ink ?? DEFAULT_BRAND_TOKENS.ink;
    if (!meetsWcagAA(brandBrightOklch, inkOklch)) {
      throw new Error("This amber is too dark for dark text on --brand-bright. Raise the lightness and try again.");
    }

    const nextTokens: BrandTokens = {
      ...(currentTokens as BrandTokens),
      brand: brandOklch,
      "brand-bright": brandBrightOklch,
    };

    const payload = {
      font_pairing: data.fontPairingId,
      tokens: nextTokens,
      updated_by_user_id: userData.user.id,
      updated_at: new Date().toISOString(),
    };

    const { error: writeError } = existing
      ? await supabase.from("brand_settings").update(payload).eq("id", (existing as BrandSettingsRow).id)
      : await supabase.from("brand_settings").insert(payload);
    if (writeError) throw new Error(writeError.message);

    return { ok: true as const, tokens: nextTokens };
  });
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Manually verify the 4.5:1 refusal**

```bash
npm run dev
```

Sign in as the seeded Guild admin and, once Task 27's UI exists, try saving a `brandLightness` near 0.95 (far too light for white text). Expected: the save is rejected with the "too light for white text" message, and `select * from brand_settings` still shows the previous value (or no row, on a first attempt) — never the rejected one.

- [ ] **Step 4: Commit**

```bash
git add src/lib/brand/brand-settings.server.ts
git commit -m "feat: add brand settings get/save with the 4.5:1 contrast refusal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 27: Brand editor — UI

**Files:**
- Create: `src/routes/guild.brand.tsx`
- Create: `src/components/guild/BrandEditor.tsx`

**Interfaces:**
- Consumes: `getBrandSettings`/`saveBrandSettings` (Task 26), `contrastRatioOfOklchStrings` (Task 9), `FONT_PAIRINGS` (Task 10), `DEFAULT_BRAND_TOKENS`/`parseOklch`-friendly hue/lightness of the current tokens.

- [ ] **Step 1: Implement the route**

Create `src/routes/guild.brand.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getBrandSettings } from "@/lib/brand/brand-settings.server";
import { BrandEditor } from "@/components/guild/BrandEditor";

export const Route = createFileRoute("/guild/brand")({
  loader: async () => getBrandSettings(),
  component: BrandRoute,
});

function BrandRoute() {
  const settings = Route.useLoaderData();
  return <BrandEditor settings={settings} />;
}
```

- [ ] **Step 2: Implement the editor with live contrast readouts**

Create `src/components/guild/BrandEditor.tsx`:

```tsx
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { saveBrandSettings } from "@/lib/brand/brand-settings.server";
import { DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import { DEFAULT_FONT_PAIRING_ID, FONT_PAIRINGS } from "@/lib/brand/font-pairings";
import { contrastRatioOfOklchStrings, parseOklch } from "@/lib/brand/contrast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BRAND_CHROMA = 0.15;
const BRAND_BRIGHT_CHROMA = 0.165;

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

/**
 * Colour is edited as a brand hue and lightness, with live contrast
 * readouts, not raw hex (spec, "Editing the brand from the admin"). Only
 * --brand and --brand-bright are exposed here (this plan's Decision 11) --
 * a shared hue, and one lightness slider per tier, each paired with the
 * fixed text colour it actually carries in production (white on --brand,
 * --ink on --brand-bright).
 */
export function BrandEditor({
  settings,
}: {
  settings: { fontPairingId: string; tokens: BrandTokens } | null;
}) {
  const router = useRouter();
  const currentTokens = settings?.tokens ?? DEFAULT_BRAND_TOKENS;
  const initialBrand = parseOklch(currentTokens.brand);
  const initialBrandBright = parseOklch(currentTokens["brand-bright"]);

  const [hue, setHue] = useState(initialBrand.h);
  const [brandLightness, setBrandLightness] = useState(initialBrand.l);
  const [brandBrightLightness, setBrandBrightLightness] = useState(initialBrandBright.l);
  const [fontPairingId, setFontPairingId] = useState(settings?.fontPairingId ?? DEFAULT_FONT_PAIRING_ID);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const brandOklch = `oklch(${brandLightness} ${BRAND_CHROMA} ${hue})`;
  const brandBrightOklch = `oklch(${brandBrightLightness} ${BRAND_BRIGHT_CHROMA} ${hue})`;
  const inkOklch = currentTokens.ink;

  const brandContrast = useMemo(() => contrastRatioOfOklchStrings(brandOklch, "oklch(1 0 0)"), [brandOklch]);
  const brandBrightContrast = useMemo(
    () => contrastRatioOfOklchStrings(brandBrightOklch, inkOklch),
    [brandBrightOklch, inkOklch],
  );

  const brandPasses = brandContrast >= 4.5;
  const brandBrightPasses = brandBrightContrast >= 4.5;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    try {
      await saveBrandSettings({ data: { hue, brandLightness, brandBrightLightness, fontPairingId } });
      await router.invalidate();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the brand settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <div>
        <Label htmlFor="brand-font-pairing">Typefaces</Label>
        <Select value={fontPairingId} onValueChange={setFontPairingId}>
          <SelectTrigger id="brand-font-pairing" className="mt-1 h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_PAIRINGS.map((pairing) => (
              <SelectItem key={pairing.id} value={pairing.id}>
                {pairing.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="brand-hue">Brand hue ({Math.round(hue)}°)</Label>
        <input
          id="brand-hue"
          type="range"
          min={0}
          max={359}
          step={1}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
          className="mt-1 h-11 w-full"
        />
      </div>

      <div className="rounded-md border border-border p-4" style={{ background: brandOklch, color: "white" }}>
        <Label htmlFor="brand-lightness" className="text-white">
          --brand lightness ({brandLightness.toFixed(2)}) — white text
        </Label>
        <input
          id="brand-lightness"
          type="range"
          min={0.2}
          max={0.85}
          step={0.01}
          value={brandLightness}
          onChange={(e) => setBrandLightness(Number(e.target.value))}
          className="mt-1 h-11 w-full"
        />
        <p className="mt-2 text-sm">
          Contrast with white text: {formatRatio(brandContrast)} —{" "}
          {brandPasses ? "passes 4.5:1" : "fails 4.5:1, cannot save"}
        </p>
      </div>

      <div className="rounded-md border border-border p-4" style={{ background: brandBrightOklch, color: inkOklch }}>
        <Label htmlFor="brand-bright-lightness" style={{ color: inkOklch }}>
          --brand-bright lightness ({brandBrightLightness.toFixed(2)}) — dark text
        </Label>
        <input
          id="brand-bright-lightness"
          type="range"
          min={0.5}
          max={0.9}
          step={0.01}
          value={brandBrightLightness}
          onChange={(e) => setBrandBrightLightness(Number(e.target.value))}
          className="mt-1 h-11 w-full"
        />
        <p className="mt-2 text-sm" style={{ color: inkOklch }}>
          Contrast with dark text: {formatRatio(brandBrightContrast)} —{" "}
          {brandBrightPasses ? "passes 4.5:1" : "fails 4.5:1, cannot save"}
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={saving || !brandPasses || !brandBrightPasses} className="h-11">
        {saving ? "Saving…" : "Save brand settings"}
      </Button>
    </form>
  );
}
```

The Save button is disabled client-side whenever either readout is failing — a fast, friendly signal — but `saveBrandSettings` (Task 26) re-checks both server-side regardless, since a disabled button is a UX courtesy, not the actual security/data-integrity boundary.

- [ ] **Step 2: Verify the project type-checks and the dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors. `/guild/brand` renders with the default Bricolage/Chivo pairing selected and both contrast readouts passing (since the initial values are the Brand Design Tokens phase's own approved defaults). Drag the `--brand` lightness slider up past roughly 0.85 and confirm the readout flips to "fails 4.5:1, cannot save" and the button disables.

- [ ] **Step 3: Commit**

```bash
git add src/routes/guild.brand.tsx src/components/guild/BrandEditor.tsx
git commit -m "feat: add the brand & theme editor UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 28: Render-time brand-token injection into `__root.tsx`

**Files:**
- Create: `src/lib/brand/active-brand.server.ts`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Produces: `getActiveBrandTokens()`.
- Consumes: `getSupabaseServiceRoleClient`, `DEFAULT_BRAND_TOKENS`/`buildBrandTokenCss` (Task 10), `getFontPairingById`/`DEFAULT_FONT_PAIRING_ID` (Task 10).

`brand_settings` has no public select policy at all (Task 3) — only server-rendered pages read it, via the service-role client, exactly like the task brief specifies. This is the one place in this plan the service-role client reads something other than `auth.admin.*`: a narrow, justified exception, since this read serves every visitor on every page load, not an authenticated admin request.

- [ ] **Step 1: Implement the server function**

Create `src/lib/brand/active-brand.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildBrandTokenCss, DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import { DEFAULT_FONT_PAIRING_ID, getFontPairingById } from "@/lib/brand/font-pairings";
import type { BrandSettingsRow } from "@/lib/supabase/types";

export type ActiveBrand = {
  css: string;
  googleFontsHref: string;
  displayFamily: string;
  bodyFamily: string;
};

/**
 * Reads the one brand_settings row (service-role, since the row's own RLS
 * is guild-admin-only and this read serves the whole public site, not an
 * authenticated admin request) and falls back to the Brand Design Tokens
 * phase's static defaults when no row exists yet -- "don't require a
 * Guild admin to touch this screen before the site looks right" (task
 * brief). Every page reads this once, centrally, from the root route's own
 * loader (Step 2) -- never per-component.
 */
export const getActiveBrandTokens = createServerFn({ method: "GET" }).handler(async (): Promise<ActiveBrand> => {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase.from("brand_settings").select("*").maybeSingle();
  const row = data as BrandSettingsRow | null;

  const tokens: BrandTokens = row ? (row.tokens as BrandTokens) : DEFAULT_BRAND_TOKENS;
  const fontPairing = getFontPairingById(row?.font_pairing ?? DEFAULT_FONT_PAIRING_ID) ?? getFontPairingById(DEFAULT_FONT_PAIRING_ID)!;

  const fontVarsCss = `--font-display: "${fontPairing.displayFamily}", system-ui, sans-serif;\n  --font-sans: "${fontPairing.bodyFamily}", system-ui, -apple-system, sans-serif;`;
  const tokenCss = buildBrandTokenCss(tokens);
  // Splice the font-family variables into the same :root block the token
  // CSS builds, so one <style> tag carries both -- never two separate
  // injection points.
  const css = tokenCss.replace(":root {\n", `:root {\n  ${fontVarsCss}\n`);

  return {
    css,
    googleFontsHref: fontPairing.googleFontsHref,
    displayFamily: fontPairing.displayFamily,
    bodyFamily: fontPairing.bodyFamily,
  };
});
```

- [ ] **Step 2: Wire it into the root route**

The current `src/routes/__root.tsx` reads (verified against the actual file in this repo):

```tsx
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: UNDER_CONSTRUCTION ? [ /* ... */ ] : [ /* ... */ ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
```

Add the import:

```tsx
import { getActiveBrandTokens } from "@/lib/brand/active-brand.server";
```

Add a `loader` to the route and change `head` to a function of `{ loaderData }`, replacing the hardcoded Oswald/Inter link with the active pairing's href and appending the injected token/font `<style>` block after the compiled stylesheet:

```tsx
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => getActiveBrandTokens(),
  head: ({ loaderData }) => ({
    meta: UNDER_CONSTRUCTION ? [ /* ...unchanged... */ ] : [ /* ...unchanged... */ ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: loaderData?.googleFontsHref ?? "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Chivo:wght@400;500;600&display=swap" },
    ],
    styles: loaderData ? [{ key: "brand-tokens", children: loaderData.css }] : [],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
```

The injected `<style>` (via `styles`) is listed after `links` in the same `head()` return, and TanStack Start renders `head()` entries into `<head>` in the order given — placing it after the `appCss` stylesheet link means its `:root { ... }` declarations win the CSS cascade over `styles.css`'s own `@theme inline` defaults (both are `:root`-scoped, so it's declaration order, not specificity, that decides). If the installed `@tanstack/react-router` version's `head()` shape doesn't include a `styles` array under this name, check its actual generated types and use whichever field renders a literal `<style>` tag — the fallback default href hardcoded above (Bricolage/Chivo) is deliberately identical to the Brand Design Tokens phase's own static defaults, so a `loaderData` miss (which shouldn't happen once this task lands, since the function always returns a fallback rather than throwing) still renders correctly.

- [ ] **Step 3: Verify the project type-checks and visually confirm**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors. Load the homepage with no `brand_settings` row yet — visually identical to the Brand Design Tokens phase's own static defaults. Save a new hue/lightness from `/guild/brand` (Task 27), reload the homepage, and confirm the primary button's colour has changed to match.

- [ ] **Step 4: Commit**

```bash
git add src/lib/brand/active-brand.server.ts src/routes/__root.tsx
git commit -m "feat: inject the active brand tokens centrally from the root route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 29: Supply categories — CRUD

**Files:**
- Create: `src/lib/categories/categories.server.ts`
- Create: `src/routes/guild.categories.tsx`
- Create: `src/components/guild/CategoriesEditor.tsx`

**Interfaces:**
- Produces: `getCategories()`, `createCategory(input)`, `updateCategory(input)`, `deleteCategory(id)`.
- Consumes: `getSupabaseServerClientForRequest`, `slugify` (Public Member Profile phase, `src/lib/slug.ts`).

No new migration — `categories` already exists with guild-admin-only write RLS (schema plan, Task 9: "categories: anyone can read" / "categories: guild admins can manage").

- [ ] **Step 1: Implement the CRUD functions**

Create `src/lib/categories/categories.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import type { CategoryRow } from "@/lib/supabase/types";

export const getCategories = createServerFn({ method: "GET" }).handler(async (): Promise<CategoryRow[]> => {
  const supabase = await getSupabaseServerClientForRequest();
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
});

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; sortOrder: number }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("categories")
      .insert({ name: data.name, slug: slugify(data.name), sort_order: data.sortOrder });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string; sortOrder: number }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("categories")
      .update({ name: data.name, slug: slugify(data.name), sort_order: data.sortOrder })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

- [ ] **Step 2: Implement the route**

Create `src/routes/guild.categories.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { getCategories } from "@/lib/categories/categories.server";
import { CategoriesEditor } from "@/components/guild/CategoriesEditor";

export const Route = createFileRoute("/guild/categories")({
  loader: async () => getCategories(),
  component: CategoriesRoute,
});

function CategoriesRoute() {
  const categories = Route.useLoaderData();
  return <CategoriesEditor categories={categories} />;
}
```

- [ ] **Step 3: Implement the editor**

Create `src/components/guild/CategoriesEditor.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { createCategory, deleteCategory, updateCategory } from "@/lib/categories/categories.server";
import type { CategoryRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** name/slug/sort_order CRUD over the existing categories table (task brief). */
export function CategoriesEditor({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    await createCategory({ data: { name: newName.trim(), sortOrder: categories.length } });
    setNewName("");
    await router.invalidate();
  }

  async function handleRename(category: CategoryRow, name: string) {
    if (!name.trim() || name === category.name) return;
    await updateCategory({ data: { id: category.id, name: name.trim(), sortOrder: category.sort_order } });
    await router.invalidate();
  }

  async function handleReorder(category: CategoryRow, sortOrder: number) {
    await updateCategory({ data: { id: category.id, name: category.name, sortOrder } });
    await router.invalidate();
  }

  async function handleDelete(category: CategoryRow) {
    if (!window.confirm(`Delete "${category.name}"? This can't be undone.`)) return;
    await deleteCategory({ data: { id: category.id } });
    await router.invalidate();
  }

  return (
    <div className="max-w-xl space-y-6">
      <ul className="space-y-2">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`category-name-${category.id}`}>
              Category name
            </label>
            <Input
              id={`category-name-${category.id}`}
              defaultValue={category.name}
              className="h-11"
              onBlur={(e) => handleRename(category, e.target.value)}
            />
            <label className="sr-only" htmlFor={`category-sort-${category.id}`}>
              Sort order for {category.name}
            </label>
            <Input
              id={`category-sort-${category.id}`}
              type="number"
              defaultValue={category.sort_order}
              className="h-11 w-20"
              onBlur={(e) => handleReorder(category, Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => handleDelete(category)}
              aria-label={`Delete ${category.name}`}
              className="min-h-11 min-w-11 rounded-md border border-danger/50 text-danger hover:bg-danger/10"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="new-category-name">New category</Label>
          <Input
            id="new-category-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 h-11"
          />
        </div>
        <Button type="submit" className="h-11">
          Add
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the project type-checks and dev server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new errors; `/guild/categories` renders the list, rename-on-blur, reorder-on-blur, delete, and add.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categories/categories.server.ts src/routes/guild.categories.tsx src/components/guild/CategoriesEditor.tsx
git commit -m "feat: add supply-category CRUD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 30: Wrangler/env wiring for `IMPERSONATION_COOKIE_SECRET`

**Files:**
- Modify: `.env.example`
- Modify: `wrangler.jsonc`, `wrangler.staging.jsonc` (documentation comment only — Cloudflare secrets aren't set in these files)

**Interfaces:** none new — this task only wires the secret this plan's Task 13 already reads via `getWorkerEnv()`.

- [ ] **Step 1: Add the local-dev entry**

In `.env.example`, add after the existing Supabase entries:

```bash
# Signs the Guild admin impersonation cookie (src/lib/guild/impersonation-token.ts).
# Any long random string -- generate one with `openssl rand -base64 32`.
# Server-only, never prefix with VITE_.
IMPERSONATION_COOKIE_SECRET=
```

- [ ] **Step 2: Set the real secret for local dev**

```bash
openssl rand -base64 32
```

Copy the output into your local `.env` as `IMPERSONATION_COOKIE_SECRET=<value>`, and into `.dev.vars` if this project's local Worker dev flow reads secrets from there instead (check whichever file `npm run dev` actually loads today, per this repo's existing convention for `SUPABASE_SERVICE_ROLE_KEY`).

- [ ] **Step 3: Set the production and staging secrets**

```bash
npx wrangler secret put IMPERSONATION_COOKIE_SECRET
```

Run once against the production Worker (default target) and once with `--config wrangler.staging.jsonc` against staging, pasting a *different* random value each time — reusing the same secret across environments would let a staging-signed cookie verify against production or vice versa.

- [ ] **Step 4: Verify**

```bash
npm run dev
```

Start an impersonation session; confirm no "Missing IMPERSONATION_COOKIE_SECRET" error appears in the terminal.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "chore: document the IMPERSONATION_COOKIE_SECRET env var

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(The actual secret values set via `wrangler secret put` are not committed anywhere — that command writes directly to Cloudflare, not to a file in this repo.)

---

### Task 31: Final accessibility, contrast, and tap-target audit pass

This task has no new application logic — it's a checklist pass across every screen this plan added or modified, run once before calling the phase done, matching the same closing-task pattern the Member Admin phase used (its own Task 33).

**Files:** none created; any fixes found land as small edits to the files already listed above.

- [ ] **Step 1: Tap targets**

Using the browser tool or manual inspection, confirm every interactive element across `/guild/roster`, `/guild/inquiries`, `/guild/brand`, `/guild/categories`, the impersonation banner (`AdminShell.tsx`, `ProfilePreviewBanner.tsx`), and every button added to `RosterTable.tsx`/`InquiriesTable.tsx`/`CategoriesEditor.tsx` computes to at least 44px in height. Every button/input in this plan was written with `h-11`/`min-h-11` (Tailwind's `11` step is 2.75rem = 44px at the default 16px root) — this step is confirming that class actually resolves to 44px in the running app, not re-deriving the rule.

```bash
npm run dev
```

Using the Playwright browser tool, navigate to each route above and evaluate:

```js
() => {
  const results = [];
  for (const el of document.querySelectorAll("button, a, input, select")) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && rect.height < 44) {
      results.push({ tag: el.tagName, text: el.textContent?.trim().slice(0, 40), height: rect.height });
    }
  }
  return results;
}
```

Expected: an empty array on every route. Fix any element it lists by adding/correcting its `h-11`/`min-h-11` class before moving on.

- [ ] **Step 2: Semantic elements and `aria-label`**

```bash
grep -rn "onClick" src/components/guild src/components/admin/AdminShell.tsx | grep -v "<button\|<a "
```

Manually confirm every match above is attached to a real `<button type="button">` or `<a href>`, never a `<div>`. Then:

```bash
grep -rln "aria-label" src/components/guild
```

Confirm the icon-only controls this plan added — the categories editor's "×" delete button — carry `aria-label` (already written that way in Task 29's `CategoriesEditor.tsx`; this step is verifying, not authoring). Every other button in this plan carries visible text, so no additional `aria-label` is needed on them.

- [ ] **Step 3: Contrast**

Using the browser tool, evaluate computed `color`/`background-color` for the impersonation banner (`bg-danger`/`text-white`) and the roster's status-colored buttons (`text-open`/`border-open`, `text-danger`/`border-danger`) against their backgrounds:

```js
() => {
  const el = document.querySelector('[role="alert"]');
  if (!el) return null;
  const style = getComputedStyle(el);
  return { color: style.color, backgroundColor: style.backgroundColor };
}
```

Confirm the resolved colors correspond to `--danger` (`oklch(0.55 0.17 27)`) and white — the same pairing already exercised by `contrast.test.ts` (Task 9), which asserts `--brand`-with-white clears 4.5:1; `--danger` is darker than `--brand`, so it clears by an even wider margin, but this step confirms the class actually resolves to that color in the running app rather than trusting the class name.

- [ ] **Step 4: Confirm the brand editor itself can't produce an inaccessible live site**

Re-run the brand editor's own test suite as a final gate:

```bash
npm test -- contrast
npm test -- default-tokens
```

Expected: both PASS. This is the actual mechanism preventing an inaccessible token set from ever reaching `getActiveBrandTokens()` (Task 28) — `saveBrandSettings` (Task 26) refuses the write server-side before it ever reaches the row `getActiveBrandTokens` reads.

- [ ] **Step 5: Full test suite and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: every test added by this plan passes, including the audit-log coverage test (Task 21) and the impersonation-token/contrast/claim-state/confirmation-state/unique-slug suites (Tasks 5, 6, 7, 8, 9, 10). No type errors anywhere in the project.

- [ ] **Step 6: Commit any fixes found**

```bash
git add -A
git commit -m "fix: accessibility and contrast pass across the Guild admin surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Skip this commit entirely if Steps 1-5 found nothing to fix.

---

## Self-review

**1. Spec coverage.** Walking `docs/member-profiles.md`'s "Roles," "Joining, for now"/"Joining, later," "Editing the brand from the admin," and "Transactional email" sections against the tasks above:

- The two admin surfaces / `is_guild_admin` on `profiles`, not `member_users` — already built by the schema plan; this plan's `/guild` guard (Task 11) and `resolveMemberClaimState` (Task 5) are consistent with it, not re-deciding it. Covered.
- Seeding the first Guild admin — already done by the schema plan (its Task 11); nothing to add here. Not re-covered, correctly, since it isn't this phase's job.
- "The Guild admin creates the member from the roster and sends the invite" — Tasks 12, 14, 15, 16. Covered.
- Applications queue deferred, `status` already supports `applied`/`declined`, nav shows a disabled SOON entry — Task 11 (`GuildShell`'s disabled span), Task 17 (approve/decline act on `applied`-status rows without a dedicated triage screen). Covered, deliberately not more than that.
- The four impersonation rules (logged against the real actor, non-dismissable banner everywhere including previews, no email/sign-in changes, ends on Stop/sign-out/idle-timeout) — Tasks 13, 17-23. Covered, including the two gaps (no sign-out UI at all, the public-profile preview 404) this plan found and closed rather than assumed away.
- Inquiries table shape, Open/Handled/All, `confirmation_sent_at` display rule, "Set them up as a member" — Tasks 1, 8, 24, 25. Covered.
- Brand editor: curated font pairings, hue+lightness with live contrast, refuses to save under 4.5:1, one JSON row injected as CSS custom properties centrally — Tasks 3, 9, 10, 26, 27, 28. Covered.
- Supply categories CRUD over the existing table — Task 29. Covered.
- 44px targets, real semantic elements, `aria-label`, 4.5:1 contrast — woven into every UI task and re-verified in Task 31. Covered.

**2. Placeholder scan.** Searched this plan's own text for "TBD," "implement later," "add appropriate," "handle edge cases," "similar to Task N," and bare prose describing code without showing it. Two intentional, named exceptions, both justified rather than accidental:
- Task 21's table for 13 of the 14 mutation files gives the exact table name, row-id source, and action per file rather than showing a fabricated diff against source code that doesn't exist yet in this repository snapshot — the worked example (`member-basics.server.ts`) is shown in full against its own real, previously-written source, and a coverage test makes the itemized table's completion independently verifiable rather than trust-the-prose.
- `sendTransactionalEmail`'s throwing body (Member Admin phase, unmodified by this plan except for one added union member) is a deliberate cross-phase seam, not a placeholder left by oversight — restated from that phase's own Decision 17, not re-argued here.

No other instance found.

**3. Type consistency.** `MemberSession`'s `memberId`/`userId` field names (Task 19) match every existing call site's destructuring from the Member Admin phase's original `{ memberId, userId }` shape — additive, not renamed. `recordAuditLogIfImpersonating`'s parameter names (`memberId`, `tableName`, `rowId`, `action`) are identical across its definition (Task 13) and every one of the 14 call sites described in Task 21. `BrandTokens`/`BRAND_TOKEN_NAMES` (Task 10) are the single source of truth for token keys used by `buildBrandTokenCss`, `saveBrandSettings`, and `getActiveBrandTokens` — no file re-declares its own token-name list. `ImpersonationState`'s four fields (`actorUserId`, `memberId`, `startedAt`, `lastActivityAt`) are the same shape read and written by `impersonation-token.ts`, `impersonation.server.ts`, `audit-log.server.ts`, and `require-member-session.server.ts` — no file adds or renames a field the others don't share.

