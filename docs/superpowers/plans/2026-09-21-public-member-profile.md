# Public Member Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public, server-rendered member profile page at `/members/$slug` — one template component driven by a `member_type` flag (producer / mobile / allied), reading real data from the Supabase schema the previous phase created — plus the query-string plumbing on the existing `/members` page needed to link into it and back out of it.

**Architecture:** A new TanStack Router route (`src/routes/members.$slug.tsx`) whose loader calls a `createServerFn` that reads the member, its child rows, and the visitor's directory neighbors from Supabase with the anon key (RLS-scoped to published rows). A second server route streams the private `member-media` bucket through a same-origin `<img>`-friendly URL, re-checking the exact eligibility rule the RLS policy encodes before ever touching the service-role key. Presentation is one `MemberProfileTemplate` component that switches sub-modules by `member_type`, built mobile-first per the spec's own stated build order. Every piece of logic that doesn't need a browser or a database (slugs, the theme table, search-param parsing, list position, image crop math, and the "open now" computation) is a pure function with unit tests — this is also the first plan in the project to add a test runner.

**Tech Stack:** TanStack Start / TanStack Router (file-based routes, `createServerFn`, server routes), Supabase JS client (anon key from the browser and from server functions; service-role key only inside the private-media streaming route), Vitest (new dev dependency), Tailwind v4 tokens from the brand-tokens plan, Cloudflare Workers (`cloudflare:workers` env binding).

**Spec:** `docs/member-profiles.md` — "Member types", "Media model", "Logos and assets", "Events", "Layout and breakpoints", "Empty and error states", "Profiles are pages, not modals", "Computing 'open now'", "Allied Member discount", "Row level security", "Storage buckets". Schema: `docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md`. Tokens: `docs/superpowers/plans/2026-09-21-brand-design-tokens.md`.

## Global Constraints

- One profile template, switched by `member_type`, never forked into three templates. (Spec, "Member types".)
- `member-media` is a **private** bucket — the browser can never fetch it directly; every carousel/cover image goes through a server route using the service-role key. `member-logos` is **public** — use Supabase's direct public storage URL, no custom route. (Spec, "Storage buckets"; schema plan Task 10.)
- Store the original file and a fractional crop rectangle; render crops in CSS for v1 (no server-side pixel resizing yet — that is a stated future optimization, not a silent gap). (Spec, "Media model".)
- Never inline a member-uploaded SVG — always `<img src="...">`, never `dangerouslySetInnerHTML` or inline `<svg>` markup pulled from storage. (Spec, "Logos and assets".)
- Always place a member logo on a light chip when it sits on a dark surface (the cross-link card is the explicit example). (Spec, "Logos and assets".)
- Allied Member discount block uses `--brand` with white text — never `--brand-bright`. (Spec, "Allied Member discount".)
- No "brewery" in member-facing copy anywhere, including the producer cross-link card ("Next on the trail", never "Next brewery"). (Spec, "The Guild Trail".)
- 44px minimum tap targets; real `<button>`/`<a href>`; `aria-label` on icon-only controls; `tel:`, `mailto:`, and maps-link-out for contact fields. (Spec, "Layout and breakpoints".)
- Mobile-first: build the 390px single column first, then the desktop adaptation capped at 1120px. (Spec, "Layout and breakpoints".)
- The Guild Trail passport (progress strip, visited count) renders nothing in this build. Cross-linking is not deferred and renders on every profile regardless of type. (Spec, "The Guild Trail"; task brief.)
- Use the path alias `@/*` → `./src/*` for all new imports. (Codebase convention, `tsconfig.json`.)
- `cloudflare:workers` env access only works reliably inside a `createServerFn`/`createServerOnlyFn` handler, never directly in a route `loader`. `process.env` does not work for secrets in this project (no `nodejs_compat_populate_process_env`). (Task brief, confirmed against `vite.config.ts` and the installed `@tanstack/start-client-core` deployment skill doc.)

## Decisions made while filling gaps the spec and task brief left open

1. **Route filename is `src/routes/members.$slug.tsx`.** This project's file-based routing is flat (dot-separated segments, e.g. `about.tsx`, no subdirectories), confirmed by the installed `@tanstack/router-core` path-params skill's own examples (`posts.$postId.tsx` → `/posts/$postId`, `teams.$teamId.members.$memberId.tsx` → `/teams/$teamId/members/$memberId`). A dynamic segment sibling to the existing exact-match `members.tsx` therefore follows the same flat convention. The private-media streaming server route follows the identical convention: `src/routes/api.member-media.$assetId.ts` → `/api/member-media/$assetId`.
2. **`src/lib/theme/member-themes.ts` is created now**, exporting the 8 theme name→hex pairs plus a default and a lookup helper, overriding the brand-tokens plan's stated sequencing (that plan explicitly deferred this table to Member Admin — wrong for this build order, since a profile must render its own theme today). The Member Admin picker (artboard K) must import `MEMBER_THEMES`/`MemberThemeName`/`getMemberThemeHex` from this exact module rather than redefining the table.
3. **Supabase client contract:** `src/lib/supabase/client.ts` exports `getSupabaseBrowserClient()` (anon key, browser-only, memoized). `src/lib/supabase/server.ts` exports `getSupabaseServerClient()` (anon key, server-only, RLS-scoped reads) and `getSupabaseServiceRoleClient()` (service-role key, bypasses RLS — only for code that re-implements the exact access check it needs, as the private-media route does). Both server exports are `createServerOnlyFn`s reading `cloudflare:workers`' `env`, memoized at module scope. Member Admin, Guild Admin, and the data-import phase must import from these two files rather than building their own Supabase client setup.
4. **The existing Members page has no filter or sort UI today** — it is out of scope to add one, and none exists to carry. The query-string contract (`src/lib/directory/search-params.ts`) nonetheless defines `filter` and `sort` alongside the real, wired `mapLat`/`mapLng`/`mapZoom` params, because the profile page's previous/next and cross-link logic must be able to read a filter/sort a *future* Members page revision writes, without another profile-page change. Until that UI exists, `filter`/`sort` will almost always be absent, and previous/next/cross-link fall back to the spec's own stated default: ordered by `business_name`.
5. **The current `/members` page's data (`src/data/site.ts`) has no `slug` field** — data import (a later phase) is what will give the real Supabase `members` table its slugs, generated by the spec's own algorithm (lowercase, non-alphanumerics collapsed to hyphens, numeric suffix on collision). `src/lib/slug.ts` implements that same base algorithm (without collision-suffix logic, since today's hardcoded roster has no colliding names — verified in Task 2) so the Members page can link speculatively to `/members/$slug` today. Before import runs, those links safely resolve to the profile route's own "slug not found" 404 (a required, already-built empty state), not a broken link; once import runs with the same algorithm, they resolve for real. The data-import plan must reuse `slugify()` from this file rather than reinventing it, so slugs match exactly.
6. **The public-404 / preview-banner split (spec, "Empty and error states"):** this plan implements only the public half — an unpublished, draft, applied, declined, or nonexistent slug renders the directory's own 404 offering the member list. The other half ("preview banner to its own members") needs member auth, which does not exist until the Member Admin phase. This is called out explicitly in the route file's own comment and in Task 17 below, not left as a silent gap.
7. **Desktop cover crop:** the schema (`members.cover_crop`) stores exactly one crop rectangle. The spec's desktop layout describes a *wider*, independently-composed 4:1 crop "from the same original" as the mobile 2.5:1 band — that would need either a second stored rectangle or member-admin UI to set one, both out of this plan's scope (schema is frozen from the prior phase; the cropping UI is Member Admin's). For v1, the desktop cover band reuses the same stored rectangle, letterboxed/stretched into the wider `aspect-[4/1]` container by the same crop-math the mobile band uses. This is a flagged v1 limitation, not a silent gap — noted again in Task 12's component comment.
8. **`getMemberProfileData` computes two independent "next" relationships**, because the spec describes two different rules: the header previous/next nav uses the visitor's own filter/sort across *all* published members (falling back to `business_name` order per Decision 4), while the cross-link card is always scoped to the *current member's own* `member_type` (a producer always points at another producer, etc.) regardless of how the visitor arrived, per the spec's explicit per-type cross-link wording.
9. **JSON-LD/OG image URLs** are built server-side inside `getMemberProfileData` using `getRequest()`'s origin (from `@tanstack/react-start/server`), not a hardcoded domain — so previews are correct in local dev, staging, and production without a config flag.

## File Structure

Pure logic (each gets its own test file, run under Vitest):
- `src/lib/slug.ts` — business-name → URL slug.
- `src/lib/theme/member-themes.ts` — the 8-theme table.
- `src/lib/directory/search-params.ts` — the shared `/members` ⇄ `/members/$slug` query-string schema.
- `src/lib/directory/list-position.ts` — previous/next-with-wraparound over an ordered list.
- `src/lib/media/crop.ts` — fractional crop rect → CSS style.
- `src/lib/hours/open-now.ts` — the "open now" algorithm.

Data access (server-only):
- `src/lib/supabase/types.ts` — hand-written row types matching the schema plan's tables.
- `src/lib/supabase/client.ts` — browser Supabase client (anon key).
- `src/lib/supabase/server.ts` — server Supabase clients (anon key + service role).
- `src/lib/members/member-profile.server.ts` — the one `createServerFn` the profile route's loader calls.

Routes:
- `src/routes/members.$slug.tsx` — the profile page.
- `src/routes/api.member-media.$assetId.ts` — private-bucket image streaming.

Presentation (`src/components/profile/`):
- `LogoChip.tsx`, `MemberImage.tsx` — shared image primitives.
- `ProfileHero.tsx`, `StatusBlock.tsx` — top of page.
- `ScheduleChips.tsx`, `EventsModule.tsx` — schedule/events.
- `DiscountBlock.tsx`, `CategoryChips.tsx`, `LinkPills.tsx`, `ContactBlock.tsx` — mid-page modules.
- `MediaCarousel.tsx`, `CrossLinkCard.tsx`, `HeaderNav.tsx` — carousel and navigation.
- `MemberProfileTemplate.tsx` — assembles all of the above, switched by `member_type`.

Existing files modified:
- `vite.config.ts` — Cloudflare plugin also runs in dev.
- `src/components/site/MembersMap.tsx` — profile links, map-position tracking.
- `src/routes/members.tsx` — profile links, query-string plumbing, "Back to members".
- `package.json` — `vitest`, `@supabase/supabase-js` (if not already present), `test` script.

---

### Task 1: Make `cloudflare:workers` resolve in dev, and generate Worker env types

**Files:**
- Modify: `vite.config.ts`
- Create: `.dev.vars.example`
- Modify: `.gitignore` (verify `.dev.vars` already ignored — it is, per the existing "Wrangler / Cloudflare" block)
- Create (generated): `worker-configuration.d.ts`
- Modify: `package.json` (add a `cf-typegen` script)

**Interfaces:**
- Produces: a dev server in which `import { env } from "cloudflare:workers"` resolves, and a generated `Env` type every later server-only module can reference.

- [ ] **Step 1: Remove the build-only gate on the Cloudflare plugin**

In `vite.config.ts`, replace:

```ts
  // Cloudflare plugin only applies to production builds, matching the
  // original config's behavior (it never ran in `vite dev`).
  if (command === "build") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    const configPath = mode === "staging" ? "./wrangler.staging.jsonc" : "./wrangler.jsonc";
    plugins.push(cloudflare({ configPath, viteEnvironment: { name: "ssr" } }));
  }
```

with:

```ts
  // The Cloudflare plugin must also run in `vite dev` so that
  // `import { env } from "cloudflare:workers"` resolves locally inside
  // createServerFn/createServerOnlyFn handlers (src/lib/supabase/server.ts
  // and the private-media streaming route depend on this). It previously
  // only ran for `command === "build"" -- that gate is gone.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const configPath = mode === "staging" ? "./wrangler.staging.jsonc" : "./wrangler.jsonc";
  plugins.push(cloudflare({ configPath, viteEnvironment: { name: "ssr" } }));
```

- [ ] **Step 2: Add the `cf-typegen` script and generate Worker env types**

In `package.json`, add under `"scripts"`:

```json
    "cf-typegen": "wrangler types",
```

Run:

```bash
npx wrangler types
```

Expected: creates `worker-configuration.d.ts` at the project root with an `Env` interface (empty or near-empty today, since no bindings/vars are declared in `wrangler.jsonc` yet — that's fine, `env.SUPABASE_SERVICE_ROLE_KEY` etc. are Worker *secrets*, which `wrangler types` does not need declared to exist at runtime; the file mainly gives you the `Env` type shape for anything that *is* declared).

- [ ] **Step 3: Create `.dev.vars.example` and your own local `.dev.vars`**

Create `.dev.vars.example`:

```bash
# Cloudflare Worker secrets for local `vite dev` / `wrangler dev`.
# Copy this file to `.dev.vars` (gitignored) and fill in real values from
# the Supabase dashboard (Project Settings -> API).
#
# These are read at runtime via `cloudflare:workers`' `env`, inside
# createServerFn/createServerOnlyFn handlers only -- see
# src/lib/supabase/server.ts. This is a *different* mechanism from the
# VITE_* build-time variables in .env.example: those get inlined into the
# client bundle at build time, these stay server-only at request time.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Copy it to `.dev.vars` and fill in the same three values you already have from the schema/RLS/storage phase's `.env` (same Supabase project). `.dev.vars` is already covered by the repo's existing `.gitignore` entry — no change needed there.

- [ ] **Step 4: Verify `npm run dev` still starts cleanly**

```bash
npm run dev
```

Expected: starts on `http://localhost:8080/` with no build errors. If you hit friction here specifically attributable to TanStack Router Devtools (a known community report exists for this exact combination — the Cloudflare plugin newly running in dev alongside the router devtools), note the exact error message plainly in your task notes rather than guessing a fix, and check whether disabling devtools in dev unblocks you before escalating.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts package.json .dev.vars.example worker-configuration.d.ts
git commit -m "chore: run the Cloudflare plugin in dev so cloudflare:workers resolves locally"
```

(`.dev.vars` itself is gitignored and must not be committed.)

---

### Task 2: `slugify()` and the Vitest test runner

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/slug.ts`
- Create: `src/lib/slug.test.ts`
- Modify: `package.json` (add `vitest` dev dependency, `test` script)

**Interfaces:**
- Produces: `slugify(businessName: string): string`, and the Vitest harness every later pure-logic task runs its tests under.

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// A separate, minimal Vite config for tests -- the app's own vite.config.ts
// pulls in the Cloudflare and TanStack Start plugins, neither of which
// pure-logic unit tests need or can run under Vitest's Node environment.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, add under `"scripts"`:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates a simple name", () => {
    expect(slugify("Idyllwild BrewPub")).toBe("idyllwild-brewpub");
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(slugify("Euryale Brewing Co.")).toBe("euryale-brewing-co");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  --Metabolic Brewing Co.--  ")).toBe("metabolic-brewing-co");
  });

  it("handles an ampersand and apostrophe", () => {
    expect(slugify("Bob's Brew & Barrel")).toBe("bob-s-brew-barrel");
  });

  it("returns an empty string for a name with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});
```

- [ ] **Step 5: Run the test and confirm it fails**

```bash
npm test -- slug
```

Expected: FAIL — `src/lib/slug.ts` does not exist yet.

- [ ] **Step 6: Implement `slugify`**

Create `src/lib/slug.ts`:

```ts
/**
 * Business name -> URL slug, per the spec's own migration algorithm
 * ("Migrating the existing members"): lowercased, non-alphanumerics
 * collapsed to hyphens. Collision-suffix logic ("a numeric suffix on
 * collision") is the data-import phase's job, once it has the whole
 * roster in hand to detect collisions against -- this function only
 * produces the base slug. The data-import plan must import and reuse
 * this exact function rather than reimplementing the algorithm, so a
 * link generated anywhere else in the app resolves to the same slug the
 * import produces.
 */
export function slugify(businessName: string): string {
  return businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 7: Run the test and confirm it passes**

```bash
npm test -- slug
```

Expected: PASS, 5 tests.

- [ ] **Step 8: Verify today's roster has no slug collisions**

```bash
node -e "
const { members } = require('./src/data/site.ts');
" 2>/dev/null || true
```

That won't run directly (TS + CJS mismatch) — instead, write a one-off check inline in Node via `tsx`-free plain JS by hand-listing the current business names from `src/data/site.ts` and confirming none of them collapse to the same slug. Read `src/data/site.ts` and, for each member's `name`, mentally (or in a scratch script) apply the same lowercase/hyphenate rule; confirm no two produce the same string. If the file has grown collisions since this plan was written, note it — the Members page (Task 19) will still work correctly (both members would 404 to the directory's own 404 until data import disambiguates them), but it's worth knowing before shipping.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/slug.ts src/lib/slug.test.ts
git commit -m "feat: add slugify() and the Vitest test runner"
```

---

### Task 3: Member theme table

**Files:**
- Create: `src/lib/theme/member-themes.ts`
- Create: `src/lib/theme/member-themes.test.ts`

**Interfaces:**
- Produces: `MemberThemeName`, `MEMBER_THEMES`, `DEFAULT_MEMBER_THEME`, `getMemberThemeHex(name)`. The Member Admin phase's theme picker (artboard K) must import these rather than redefining the table (Decision 2).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/theme/member-themes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_MEMBER_THEME, getMemberThemeHex, MEMBER_THEMES } from "./member-themes";

describe("MEMBER_THEMES", () => {
  it("has exactly the 8 themes from the spec, in order", () => {
    expect(MEMBER_THEMES.map((t) => t.name)).toEqual([
      "amber",
      "rust",
      "garnet",
      "plum",
      "indigo",
      "teal",
      "forest",
      "olive",
    ]);
  });

  it("matches the spec's hex values", () => {
    expect(MEMBER_THEMES.find((t) => t.name === "amber")?.hex).toBe("#B45309");
    expect(MEMBER_THEMES.find((t) => t.name === "olive")?.hex).toBe("#55621C");
  });

  it("defaults to amber", () => {
    expect(DEFAULT_MEMBER_THEME).toBe("amber");
  });
});

describe("getMemberThemeHex", () => {
  it("returns the hex for a known theme", () => {
    expect(getMemberThemeHex("teal")).toBe("#17605F");
  });

  it("falls back to the first theme's hex for an unrecognized value", () => {
    // @ts-expect-error -- deliberately passing an invalid value to test the fallback
    expect(getMemberThemeHex("neon")).toBe("#B45309");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- member-themes
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/theme/member-themes.ts`:

```ts
/**
 * The 8 member profile themes (spec, "Profile hero and theme"). This is
 * the single source of truth for the theme table -- the Member Admin
 * phase's theme picker (artboard K) must import from this file rather
 * than redefining the table, per this plan's own Decisions section.
 *
 * Member themes are a separate system from the Guild's own brand tokens
 * (src/styles.css's --brand/--brand-bright/etc.) -- a member theme colours
 * only what sits inside the Guild's dark frame on that member's own page.
 */
export type MemberThemeName =
  | "amber"
  | "rust"
  | "garnet"
  | "plum"
  | "indigo"
  | "teal"
  | "forest"
  | "olive";

export type MemberTheme = {
  name: MemberThemeName;
  label: string;
  hex: string;
};

export const MEMBER_THEMES: MemberTheme[] = [
  { name: "amber", label: "Amber", hex: "#B45309" },
  { name: "rust", label: "Rust", hex: "#9A3412" },
  { name: "garnet", label: "Garnet", hex: "#9B2242" },
  { name: "plum", label: "Plum", hex: "#6B2D6B" },
  { name: "indigo", label: "Indigo", hex: "#3B4B9A" },
  { name: "teal", label: "Teal", hex: "#17605F" },
  { name: "forest", label: "Forest", hex: "#2F6B33" },
  { name: "olive", label: "Olive", hex: "#55621C" },
];

export const DEFAULT_MEMBER_THEME: MemberThemeName = "amber";

export function getMemberThemeHex(name: MemberThemeName): string {
  return MEMBER_THEMES.find((theme) => theme.name === name)?.hex ?? MEMBER_THEMES[0].hex;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- member-themes
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme/member-themes.ts src/lib/theme/member-themes.test.ts
git commit -m "feat: add the 8-theme member theme table"
```

---

### Task 4: Directory search-param schema

**Files:**
- Create: `src/lib/directory/search-params.ts`
- Create: `src/lib/directory/search-params.test.ts`

**Interfaces:**
- Produces: `DirectorySearch` type and `validateDirectorySearch(search: Record<string, unknown>): DirectorySearch`, used as the `validateSearch` on both `/members` (Task 19) and `/members/$slug` (Task 17), so the two routes agree on param names and round-trip each other's query strings exactly.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/directory/search-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDirectorySearch } from "./search-params";

describe("validateDirectorySearch", () => {
  it("returns an empty object for no params", () => {
    expect(validateDirectorySearch({})).toEqual({});
  });

  it("accepts a valid member_type filter", () => {
    expect(validateDirectorySearch({ filter: "mobile" })).toEqual({ filter: "mobile" });
  });

  it("drops an invalid filter value", () => {
    expect(validateDirectorySearch({ filter: "brewery" })).toEqual({});
  });

  it("accepts the one supported sort value", () => {
    expect(validateDirectorySearch({ sort: "business_name" })).toEqual({ sort: "business_name" });
  });

  it("drops an unsupported sort value", () => {
    expect(validateDirectorySearch({ sort: "distance" })).toEqual({});
  });

  it("parses numeric map position from string search params", () => {
    expect(validateDirectorySearch({ mapLat: "33.95", mapLng: "-117.3", mapZoom: "9" })).toEqual({
      mapLat: 33.95,
      mapLng: -117.3,
      mapZoom: 9,
    });
  });

  it("accepts numeric map position values directly", () => {
    expect(validateDirectorySearch({ mapLat: 33.95, mapZoom: 9 })).toEqual({
      mapLat: 33.95,
      mapZoom: 9,
    });
  });

  it("drops a non-numeric map position value", () => {
    expect(validateDirectorySearch({ mapLat: "not-a-number" })).toEqual({});
  });

  it("carries every valid field at once", () => {
    expect(
      validateDirectorySearch({
        filter: "producer",
        sort: "business_name",
        mapLat: 34,
        mapLng: -117,
        mapZoom: 10,
      }),
    ).toEqual({
      filter: "producer",
      sort: "business_name",
      mapLat: 34,
      mapLng: -117,
      mapZoom: 10,
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- search-params
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/directory/search-params.ts`:

```ts
import type { MemberType } from "@/lib/supabase/types";

/**
 * Shared query-string contract between /members and /members/$slug (spec,
 * "Keeping the visitor's place" and "Next in the directory, not nearest").
 * Both routes' validateSearch must point at this exact function so a link
 * from one round-trips cleanly through the other.
 *
 * `filter`/`sort` are read-only-so-far from this route's point of view --
 * the current /members page has no UI to set them (see this plan's
 * Decisions section) -- but the schema is defined now so a future filter
 * or sort control on that page needs no change here or on the profile
 * route to start working.
 */
export type DirectorySort = "business_name";

export type DirectorySearch = {
  filter?: MemberType;
  sort?: DirectorySort;
  mapLat?: number;
  mapLng?: number;
  mapZoom?: number;
};

const MEMBER_TYPES: ReadonlySet<string> = new Set(["producer", "mobile", "allied"]);
const NUMERIC_KEYS = ["mapLat", "mapLng", "mapZoom"] as const;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function validateDirectorySearch(search: Record<string, unknown>): DirectorySearch {
  const result: DirectorySearch = {};

  if (typeof search.filter === "string" && MEMBER_TYPES.has(search.filter)) {
    result.filter = search.filter as MemberType;
  }

  if (search.sort === "business_name") {
    result.sort = "business_name";
  }

  for (const key of NUMERIC_KEYS) {
    const parsed = toFiniteNumber(search[key]);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- search-params
```

Expected: PASS, 8 tests. (Task 8 creates `src/lib/supabase/types.ts` — if you're executing tasks in order, `MemberType` won't exist yet; this task's test file doesn't need it to pass since it only exercises the validator with plain objects, but the type-only import will fail `tsc`/build until Task 8 lands. That's fine within this one phase — note it and move on; Vitest type-checks lazily and the test above will still run correctly under `vitest run`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/directory/search-params.ts src/lib/directory/search-params.test.ts
git commit -m "feat: add the shared /members <-> /members/\$slug search-param schema"
```

---

### Task 5: List-position (previous/next with wraparound)

**Files:**
- Create: `src/lib/directory/list-position.ts`
- Create: `src/lib/directory/list-position.test.ts`

**Interfaces:**
- Produces: `DirectoryEntry` type and `getAdjacentInList(items, currentId): { prev: DirectoryEntry | null; next: DirectoryEntry | null }`. Consumed by `member-profile.server.ts` (Task 10) for both the header prev/next nav and the cross-link card.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/directory/list-position.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAdjacentInList, type DirectoryEntry } from "./list-position";

const entry = (id: string): DirectoryEntry => ({
  id,
  slug: id,
  businessName: id,
  city: "Riverside",
  memberType: "producer",
});

describe("getAdjacentInList", () => {
  it("returns null/null for a list with fewer than two items", () => {
    expect(getAdjacentInList([], "a")).toEqual({ prev: null, next: null });
    expect(getAdjacentInList([entry("a")], "a")).toEqual({ prev: null, next: null });
  });

  it("returns null/null when the current id is not in the list", () => {
    expect(getAdjacentInList([entry("a"), entry("b")], "z")).toEqual({ prev: null, next: null });
  });

  it("returns the neighbors of a middle item", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    expect(getAdjacentInList(items, "b")).toEqual({ prev: entry("a"), next: entry("c") });
  });

  it("wraps the next pointer from the last item back to the first", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    expect(getAdjacentInList(items, "c").next).toEqual(entry("a"));
  });

  it("wraps the prev pointer from the first item back to the last", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    expect(getAdjacentInList(items, "a").prev).toEqual(entry("c"));
  });

  it("wraps both directions for a two-item list", () => {
    const items = [entry("a"), entry("b")];
    expect(getAdjacentInList(items, "a")).toEqual({ prev: entry("b"), next: entry("b") });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- list-position
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/directory/list-position.ts`:

```ts
import type { MemberType } from "@/lib/supabase/types";

export type DirectoryEntry = {
  id: string;
  slug: string;
  businessName: string;
  city: string;
  memberType: MemberType;
};

/**
 * Previous/next with wraparound over an already-ordered list (spec,
 * "Next in the directory, not nearest"). Wraps so the last item's "next"
 * is the first item rather than a dead end -- there is no natural end to
 * a directory a visitor is browsing.
 */
export function getAdjacentInList(
  items: DirectoryEntry[],
  currentId: string,
): { prev: DirectoryEntry | null; next: DirectoryEntry | null } {
  if (items.length < 2) {
    return { prev: null, next: null };
  }

  const index = items.findIndex((item) => item.id === currentId);
  if (index === -1) {
    return { prev: null, next: null };
  }

  const prevIndex = (index - 1 + items.length) % items.length;
  const nextIndex = (index + 1) % items.length;

  return { prev: items[prevIndex], next: items[nextIndex] };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- list-position
```

Expected: PASS, 6 tests. (Same note as Task 4 about the `MemberType` import resolving fully once Task 8 lands.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/directory/list-position.ts src/lib/directory/list-position.test.ts
git commit -m "feat: add getAdjacentInList() for directory previous/next with wraparound"
```

---

### Task 6: Crop-rectangle CSS math

**Files:**
- Create: `src/lib/media/crop.ts`
- Create: `src/lib/media/crop.test.ts`

**Interfaces:**
- Produces: `CropRect` type and `computeCropStyle(crop: CropRect): React.CSSProperties`. Consumed by `MemberImage.tsx` (Task 12).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/media/crop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeCropStyle } from "./crop";

describe("computeCropStyle", () => {
  it("returns a full-bleed style for the identity crop", () => {
    expect(computeCropStyle({ x: 0, y: 0, w: 1, h: 1 })).toEqual({
      position: "absolute",
      width: "100.0000%",
      height: "100.0000%",
      left: "-0.0000%",
      top: "-0.0000%",
      maxWidth: "none",
    });
  });

  it("scales and shifts for a horizontally centered half-width crop", () => {
    const style = computeCropStyle({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(style.width).toBe("200.0000%");
    expect(style.left).toBe("-50.0000%");
    expect(style.height).toBe("100.0000%");
    expect(style.top).toBe("-0.0000%");
  });

  it("scales and shifts for a crop offset from the top-left", () => {
    const style = computeCropStyle({ x: 0.1, y: 0.2, w: 0.8, h: 0.6 });
    expect(style.width).toBe("125.0000%");
    expect(style.height).toBe("166.6667%");
    expect(style.left).toBe("-12.5000%");
    expect(style.top).toBe("-33.3333%");
  });

  it("falls back to a full-bleed style for a degenerate zero-size crop", () => {
    expect(computeCropStyle({ x: 0, y: 0, w: 0, h: 1 })).toEqual({
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- crop
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/media/crop.ts`:

```ts
import type { CSSProperties } from "react";

/** Fractions of the original image's width/height (spec, "Media model"). */
export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * Renders an arbitrary fractional crop rectangle in pure CSS: scale the
 * full original image up so the cropped fraction fills the container
 * edge-to-edge, then translate so the crop's top-left lands on the
 * container's top-left. The caller wraps the returned style on an <img>
 * inside a `position: relative; overflow: hidden` container sized to the
 * display aspect ratio (spec: "the cropper reconciles it" to that
 * ratio -- this function trusts the stored rectangle is already correct
 * for the slot it's rendered into).
 *
 * This is the v1, CSS-only rendering path the spec explicitly allows
 * ("real server-side pixel resizing is a future optimization").
 */
export function computeCropStyle(crop: CropRect): CSSProperties {
  const { x, y, w, h } = crop;

  if (w <= 0 || h <= 0) {
    return { position: "absolute", inset: 0, width: "100%", height: "100%" };
  }

  return {
    position: "absolute",
    width: `${(100 / w).toFixed(4)}%`,
    height: `${(100 / h).toFixed(4)}%`,
    left: `${(-(x / w) * 100).toFixed(4)}%`,
    top: `${(-(y / h) * 100).toFixed(4)}%`,
    maxWidth: "none",
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- crop
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/crop.ts src/lib/media/crop.test.ts
git commit -m "feat: add computeCropStyle() for CSS-only fractional-crop rendering"
```

---

### Task 7: "Open now" computation

**Files:**
- Create: `src/lib/hours/open-now.ts`
- Create: `src/lib/hours/open-now.test.ts`

**Interfaces:**
- Produces: `WeekdayHours`, `SpecialHoursDay`, `OpenNowResult` types, `computeOpenNow(params)`, and the exported formatting helper `formatDurationLabel(minutes)`. Consumed by `StatusBlock.tsx` (Task 12) and `ScheduleChips.tsx` (Task 13).
- Consumes: nothing.

This is the module the task brief calls out as needing real edge-case coverage — it earns the longest test file in this plan.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hours/open-now.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeOpenNow, formatDurationLabel } from "./open-now";

const PT = "America/Los_Angeles";

describe("formatDurationLabel", () => {
  it("formats hours and minutes", () => {
    expect(formatDurationLabel(160)).toBe("2 hr 40 min");
  });

  it("formats a duration under one hour", () => {
    expect(formatDurationLabel(30)).toBe("0 hr 30 min");
  });
});

describe("computeOpenNow", () => {
  it("reports unknown when there are no hours at all", () => {
    expect(
      computeOpenNow({ now: new Date("2026-09-22T20:00:00Z"), timezone: PT, hours: [], specialHours: [] }),
    ).toEqual({ status: "unknown" });
  });

  it("is open during a normal same-day interval", () => {
    // Tuesday 2026-09-22, 20:00 UTC = 13:00 PDT.
    const result = computeOpenNow({
      now: new Date("2026-09-22T20:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 2, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "open", closesInLabel: "Closes in 4 hr 0 min", note: null });
  });

  it("is closed before opening, and reports the next opening later the same day", () => {
    // Tuesday 2026-09-22, 14:00 UTC = 07:00 PDT.
    const result = computeOpenNow({
      now: new Date("2026-09-22T14:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 2, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Tuesday 9am", note: null });
  });

  it("is open after midnight via an interval that closes the next day, found by checking yesterday's row", () => {
    // Saturday 2026-09-26, 07:30 UTC = 00:30 PDT. Friday's row runs 18:00-01:00.
    const result = computeOpenNow({
      now: new Date("2026-09-26T07:30:00Z"),
      timezone: PT,
      hours: [{ weekday: 5, opensAt: "18:00", closesAt: "01:00", closesNextDay: true, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "open", closesInLabel: "Closes in 0 hr 30 min", note: null });
  });

  it("a special_hours closure for today wins outright, even over normally-open weekly hours", () => {
    // Thanksgiving, Thursday 2026-11-26, 20:00 UTC = 12:00 PST.
    const result = computeOpenNow({
      now: new Date("2026-11-26T20:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 4, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [
        { date: "2026-11-26", isClosed: true, opensAt: null, closesAt: null, closesNextDay: false, note: "Thanksgiving" },
      ],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Thursday 9am", note: "Thanksgiving" });
  });

  it("a special_hours override for today can also open narrower hours than usual", () => {
    // Thursday 2026-12-24, 21:00 UTC = 13:00 PST.
    const result = computeOpenNow({
      now: new Date("2026-12-24T21:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 4, opensAt: "09:00", closesAt: "21:00", closesNextDay: false, isClosed: false }],
      specialHours: [
        {
          date: "2026-12-24",
          isClosed: false,
          opensAt: "10:00",
          closesAt: "14:00",
          closesNextDay: false,
          note: "Christmas Eve — early close",
        },
      ],
    });
    expect(result).toEqual({
      status: "open",
      closesInLabel: "Closes in 1 hr 0 min",
      note: "Christmas Eve — early close",
    });
  });

  it("searches forward across the week to find the next opening on a later weekday", () => {
    // Sunday 2026-09-20, 20:00 UTC = 13:00 PDT. Only Tuesday has hours.
    const result = computeOpenNow({
      now: new Date("2026-09-20T20:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 2, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Tuesday 9am", note: null });
  });

  it("finds a later interval later the same day when hours are split", () => {
    // Tuesday 2026-09-22, 22:00 UTC = 15:00 PDT, between a lunch and dinner block.
    const result = computeOpenNow({
      now: new Date("2026-09-22T22:00:00Z"),
      timezone: PT,
      hours: [
        { weekday: 2, opensAt: "11:00", closesAt: "14:00", closesNextDay: false, isClosed: false },
        { weekday: 2, opensAt: "17:00", closesAt: "21:00", closesNextDay: false, isClosed: false },
      ],
      specialHours: [],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Tuesday 5pm", note: null });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- open-now
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/hours/open-now.ts`:

```ts
/**
 * Computes "open now" per the spec's exact algorithm ("Computing 'open
 * now'"). All arithmetic happens on a unified "minutes relative to the
 * member's local midnight today" timeline, built from Intl.DateTimeFormat
 * parts for the member's own IANA timezone -- never the server's or the
 * visitor's (spec, rule 1). This avoids needing a timezone-database
 * dependency: Intl already has one.
 */

export type WeekdayHours = {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  opensAt: string | null; // "HH:MM" or "HH:MM:SS", local wall-clock
  closesAt: string | null;
  closesNextDay: boolean;
  isClosed: boolean;
};

export type SpecialHoursDay = {
  date: string; // "YYYY-MM-DD"
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  closesNextDay: boolean;
  note: string | null;
};

export type OpenNowResult =
  | { status: "open"; closesInLabel: string; note: string | null }
  | { status: "closed"; nextOpenLabel: string | null; note: string | null }
  | { status: "unknown" };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MINUTES_PER_DAY = 1440;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatClockLabel(minutesSinceMidnight: number): string {
  const wrapped = ((minutesSinceMidnight % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

export function formatDurationLabel(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs} hr ${mins} min`;
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The member's local wall-clock date (YYYY-MM-DD), weekday (0-6), and
 * minutes-since-local-midnight for a given instant and IANA timezone.
 */
export function getZonedNow(instant: Date, timeZone: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  // Some Intl implementations render local midnight as hour "24" rather
  // than "00" under hour12: false -- normalize defensively.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return { date, weekday: weekdayOf(date), minutes: hour * 60 + minute };
}

type Interval = { startMinutes: number; endMinutes: number }; // relative to today's local midnight = 0

function intervalsForDate(params: {
  weekday: number;
  hours: WeekdayHours[];
  special: SpecialHoursDay | undefined;
  dayOffsetMinutes: number;
}): Interval[] {
  const { weekday, hours, special, dayOffsetMinutes } = params;

  if (special) {
    if (special.isClosed || !special.opensAt || !special.closesAt) return [];
    const start = toMinutes(special.opensAt) + dayOffsetMinutes;
    const end = toMinutes(special.closesAt) + dayOffsetMinutes + (special.closesNextDay ? MINUTES_PER_DAY : 0);
    return [{ startMinutes: start, endMinutes: end }];
  }

  return hours
    .filter((row) => row.weekday === weekday && !row.isClosed && row.opensAt && row.closesAt)
    .map((row) => ({
      startMinutes: toMinutes(row.opensAt as string) + dayOffsetMinutes,
      endMinutes:
        toMinutes(row.closesAt as string) + dayOffsetMinutes + (row.closesNextDay ? MINUTES_PER_DAY : 0),
    }));
}

export function computeOpenNow(params: {
  now: Date;
  timezone: string;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
}): OpenNowResult {
  const { now, timezone, hours, specialHours } = params;

  if (hours.length === 0 && specialHours.length === 0) {
    return { status: "unknown" };
  }

  const zoned = getZonedNow(now, timezone);
  const specialByDate = new Map(specialHours.map((row) => [row.date, row]));
  const todaySpecial = specialByDate.get(zoned.date);

  const todayIntervals = intervalsForDate({
    weekday: zoned.weekday,
    hours,
    special: todaySpecial,
    dayOffsetMinutes: 0,
  });

  // A special_hours row for today wins outright (spec, rule 2: "if one
  // exists it wins outright"), so it replaces both today's weekly hours
  // AND any overnight bleed-over from yesterday -- an explicit override
  // for today is absolute, full stop.
  const yesterdayIntervals = todaySpecial
    ? []
    : intervalsForDate({
        weekday: (zoned.weekday + 6) % 7,
        hours,
        special: specialByDate.get(addDays(zoned.date, -1)),
        dayOffsetMinutes: -MINUTES_PER_DAY,
      });

  const note = todaySpecial?.note ?? null;
  const openInterval = [...todayIntervals, ...yesterdayIntervals].find(
    (interval) => zoned.minutes >= interval.startMinutes && zoned.minutes < interval.endMinutes,
  );

  if (openInterval) {
    return {
      status: "open",
      closesInLabel: `Closes in ${formatDurationLabel(openInterval.endMinutes - zoned.minutes)}`,
      note,
    };
  }

  // Closed. Find the earliest future interval across the next 7 days,
  // special_hours applied per date (spec, rule 7).
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidateDate = addDays(zoned.date, dayOffset);
    const candidateWeekday = weekdayOf(candidateDate);
    const dayOffsetMinutes = dayOffset * MINUTES_PER_DAY;

    const intervals = intervalsForDate({
      weekday: candidateWeekday,
      hours,
      special: specialByDate.get(candidateDate),
      dayOffsetMinutes,
    })
      .filter((interval) => interval.startMinutes >= zoned.minutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    if (intervals.length > 0) {
      const clock = formatClockLabel(intervals[0].startMinutes - dayOffsetMinutes);
      return {
        status: "closed",
        nextOpenLabel: `Opens ${WEEKDAY_NAMES[candidateWeekday]} ${clock}`,
        note,
      };
    }
  }

  return { status: "closed", nextOpenLabel: null, note };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- open-now
```

Expected: PASS, 10 tests. If a date-arithmetic test fails, double check against a calendar rather than adjusting the expected string blind — every date in the test file was hand-verified against 2026's actual weekdays (2026-01-01 is a Thursday) when this plan was written.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/open-now.ts src/lib/hours/open-now.test.ts
git commit -m "feat: add computeOpenNow(), the timezone-aware open/closed algorithm"
```

---

### Task 8: Supabase row types

**Files:**
- Create: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `MemberType`, `MemberStatus`, `MemberRow`, `MediaAssetRow`, `CarouselSlideRow`, `MemberLinkRow`, `HoursRow`, `SpecialHoursRow`, `EventRow`, `CategoryRow`. Consumed by every data-access and pure-logic module referencing these names (Tasks 4, 5, 9, 10).
- Consumes: nothing.

This task has no test — it's type declarations with no runtime behavior, matching the schema plan's table definitions column-for-column.

- [ ] **Step 1: Write the types**

Create `src/lib/supabase/types.ts`:

```ts
/**
 * Hand-written row types matching
 * docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md
 * column-for-column, limited to the columns the public profile actually
 * reads. Not a generated Supabase client type -- there is no `supabase gen
 * types` step in this project yet. If one is added later, this file
 * should be regenerated from it rather than hand-maintained twice.
 */

export type MemberType = "producer" | "mobile" | "allied";
export type MemberStatus = "applied" | "declined" | "draft" | "published" | "suspended";
export type ThemeName = "amber" | "rust" | "garnet" | "plum" | "indigo" | "teal" | "forest" | "olive";

export type CropRect = { x: number; y: number; w: number; h: number };

export type MemberRow = {
  id: string;
  slug: string;
  member_type: MemberType;
  business_name: string;
  tagline: string | null;
  city: string;
  state: string;
  street_address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  service_area: string | null;
  lead_time: string | null;
  phone: string | null;
  contact_email: string | null;
  timezone: string;
  theme: ThemeName;
  logo_asset_id: string | null;
  cover_asset_id: string | null;
  cover_crop: CropRect | null;
  member_since_year: number | null;
  discount_percent: number | null;
  discount_no_fixed_percent: boolean;
  discount_redeem_text: string | null;
  status: MemberStatus;
  hours_confirmed_at: string | null;
  published_at: string | null;
};

export type MediaAssetRow = {
  id: string;
  member_id: string;
  storage_path: string;
  kind: "image" | "video";
  mime_type: string;
  width: number | null;
  height: number | null;
  review_status: "pending" | "approved" | "rejected";
};

export type CarouselSlideRow = {
  id: string;
  member_id: string;
  asset_id: string;
  crop: CropRect;
  outbound_url: string | null;
  sort_order: number;
};

export type MemberLinkKind =
  | "website"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "taplist"
  | "menu"
  | "press_kit"
  | "catalog"
  | "other";

export type MemberLinkRow = {
  id: string;
  member_id: string;
  kind: MemberLinkKind;
  label: string | null;
  url: string;
  sort_order: number;
};

export type HoursRow = {
  id: string;
  member_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  is_closed: boolean;
};

export type SpecialHoursRow = {
  id: string;
  member_id: string;
  date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  note: string | null;
};

export type EventOverlayStatus = "postponed" | "rescheduled" | "canceled";

export type EventRow = {
  id: string;
  member_id: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  city: string | null;
  address: string | null;
  overlay_status: EventOverlayStatus | null;
  overlay_starts_at: string | null;
  overlay_note: string | null;
  is_hidden: boolean;
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};
```

- [ ] **Step 2: Verify the project still type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors introduced by this file (pre-existing errors, if any, are out of scope for this task).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add hand-written Supabase row types for the member profile tables"
```

---

### Task 9: Supabase client contract (browser + server)

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Modify: `package.json` (add `@supabase/supabase-js`, unless already installed by the schema/RLS/storage phase's seed script)

**Interfaces:**
- Produces: `getSupabaseBrowserClient()` (browser), `getSupabaseServerClient()` and `getSupabaseServiceRoleClient()` (server-only). These are the exact three names later phases (Member Admin, Guild Admin, data import) must import rather than re-creating their own Supabase setup (Decision 3).
- Consumes: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (browser, build-time), `cloudflare:workers`' `env` (server, request-time).

- [ ] **Step 1: Confirm the dependency is installed**

```bash
npm ls @supabase/supabase-js
```

If missing:

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client, anon key only. Safe to import from any
 * client component. There is no user session/auth in this phase --
 * cookie-based session handling is the Member Admin phase's job. Later
 * phases should extend this file rather than creating their own client
 * setup (this plan's Decisions section).
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
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return browserClient;
}
```

- [ ] **Step 3: Write the server clients**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerOnlyFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase clients. Both exports are createServerOnlyFns --
 * call them from inside a createServerFn handler (as
 * src/lib/members/member-profile.server.ts and the private-media
 * streaming route do), not directly from a route loader. Loaders are
 * isomorphic and bundled for the client too, so `cloudflare:workers`
 * does not resolve reliably there.
 *
 * Later phases (Member Admin, Guild Admin, data import) must import
 * these two functions rather than re-creating their own Supabase client
 * setup (this plan's Decisions section).
 */

type WorkerEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

let anonClient: SupabaseClient | undefined;
let serviceRoleClient: SupabaseClient | undefined;

const getWorkerEnv = createServerOnlyFn(async (): Promise<WorkerEnv> => {
  const { env } = await import("cloudflare:workers");
  return env as WorkerEnv;
});

/** Anon-key client for server-side reads of published, public data (RLS-scoped). */
export const getSupabaseServerClient = createServerOnlyFn(async (): Promise<SupabaseClient> => {
  if (anonClient) return anonClient;
  const env = await getWorkerEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the Worker environment.");
  }
  anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  return anonClient;
});

/**
 * Service-role client -- bypasses RLS entirely. Only for code that
 * independently re-implements the exact access rule it needs before
 * using it (the private member-media streaming route is the only
 * consumer in this plan). Never pipe unauthenticated input into a query
 * built on this client without that check.
 */
export const getSupabaseServiceRoleClient = createServerOnlyFn(async (): Promise<SupabaseClient> => {
  if (serviceRoleClient) return serviceRoleClient;
  const env = await getWorkerEnv();
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the Worker environment.");
  }
  serviceRoleClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return serviceRoleClient;
});
```

- [ ] **Step 4: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/client.ts src/lib/supabase/server.ts package.json package-lock.json
git commit -m "feat: establish the browser and server Supabase client contract"
```

---

### Task 10: Member profile data-fetching server function

**Files:**
- Create: `src/lib/members/member-profile.server.ts`

**Interfaces:**
- Produces: `getMemberProfileData(input: { slug: string; filter?: MemberType; sort?: DirectorySort }): Promise<MemberProfileData>`, throwing `notFound()` (from `@tanstack/react-router`) when the slug doesn't resolve to a published member. `MemberProfileData` is the exact shape `MemberProfileTemplate.tsx` (Task 16) and the route's `head()` (Task 17) consume.
- Consumes: `getSupabaseServerClient` (Task 9), `getAdjacentInList`/`DirectoryEntry` (Task 5), row types (Task 8), `DirectorySort` (Task 4).

- [ ] **Step 1: Implement the module**

Create `src/lib/members/member-profile.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAdjacentInList, type DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySort } from "@/lib/directory/search-params";
import type {
  CarouselSlideRow,
  CategoryRow,
  EventRow,
  HoursRow,
  MediaAssetRow,
  MemberLinkRow,
  MemberRow,
  MemberType,
  SpecialHoursRow,
} from "@/lib/supabase/types";

export type MemberProfileData = {
  member: MemberRow;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
  carouselSlides: (CarouselSlideRow & { asset: MediaAssetRow })[];
  links: MemberLinkRow[];
  events: EventRow[];
  categories: CategoryRow[];
  logoAsset: MediaAssetRow | null;
  coverAsset: MediaAssetRow | null;
  logoPublicUrl: string | null;
  crossLink: DirectoryEntry | null;
  headerPrev: DirectoryEntry | null;
  headerNext: DirectoryEntry | null;
  ogImageUrl: string | null;
  siteOrigin: string;
};

type GetMemberProfileInput = {
  slug: string;
  filter?: MemberType;
  sort?: DirectorySort;
};

/**
 * Fetches everything the public profile page needs for one slug, in one
 * server round trip. RLS (anon key, "members: public can read published
 * rows" and the matching child-table policies) is what actually enforces
 * "published only" here -- this function doesn't re-check status itself
 * beyond noticing an empty result.
 */
export const getMemberProfileData = createServerFn({ method: "GET" })
  .inputValidator((data: GetMemberProfileInput) => data)
  .handler(async ({ data }): Promise<MemberProfileData> => {
    const supabase = await getSupabaseServerClient();
    const request = getRequest();
    const siteOrigin = new URL(request.url).origin;

    const { data: member, error: memberError } = await supabase
      .from("members")
      // Explicit column list, not select("*") -- application_note,
      // dues_received_at, approved_at, and approved_by_user_id are
      // revoked from anon at the column level and must not be requested.
      .select(
        "id, slug, member_type, business_name, tagline, city, state, street_address, postal_code, latitude, longitude, service_area, lead_time, phone, contact_email, timezone, theme, logo_asset_id, cover_asset_id, cover_crop, member_since_year, discount_percent, discount_no_fixed_percent, discount_redeem_text, status, hours_confirmed_at, published_at, trail_eligible, created_at, updated_at",
      )
      .eq("slug", data.slug)
      .maybeSingle();

    // Covers both "no such slug" and "slug exists but the row isn't
    // published" -- RLS already filtered the second case out before this
    // code runs, so both look identical from here: the directory's own
    // 404 (spec, "Slug not found"). The other spec 404 case -- "draft or
    // still an application: 404 to the public, preview banner to its own
    // members" -- is only half-implementable today: there is no member
    // auth yet to show that banner to (Member Admin phase). This
    // function only ever implements the public-404 half.
    if (memberError || !member) {
      throw notFound();
    }

    const typedMember = member as MemberRow;

    const [
      { data: hours },
      { data: specialHours },
      { data: slides },
      { data: links },
      { data: events },
      { data: memberCategories },
    ] = await Promise.all([
      supabase.from("hours").select("*").eq("member_id", typedMember.id),
      supabase.from("special_hours").select("*").eq("member_id", typedMember.id),
      supabase.from("carousel_slides").select("*").eq("member_id", typedMember.id).order("sort_order"),
      supabase.from("member_links").select("*").eq("member_id", typedMember.id).order("sort_order"),
      supabase.from("events").select("*").eq("member_id", typedMember.id).order("starts_at"),
      supabase.from("member_categories").select("category_id").eq("member_id", typedMember.id),
    ]);

    const assetIds = new Set<string>();
    for (const slide of slides ?? []) assetIds.add((slide as CarouselSlideRow).asset_id);
    if (typedMember.logo_asset_id) assetIds.add(typedMember.logo_asset_id);
    if (typedMember.cover_asset_id) assetIds.add(typedMember.cover_asset_id);

    const { data: assets } = assetIds.size
      ? await supabase.from("media_assets").select("*").in("id", Array.from(assetIds))
      : { data: [] as MediaAssetRow[] };
    const assetsById = new Map((assets ?? []).map((asset) => [(asset as MediaAssetRow).id, asset as MediaAssetRow]));

    const categoryIds = (memberCategories ?? []).map((row) => row.category_id as string);
    const { data: categories } = categoryIds.length
      ? await supabase.from("categories").select("*").in("id", categoryIds).order("sort_order")
      : { data: [] as CategoryRow[] };

    const logoAsset = typedMember.logo_asset_id ? assetsById.get(typedMember.logo_asset_id) ?? null : null;
    const coverAsset = typedMember.cover_asset_id ? assetsById.get(typedMember.cover_asset_id) ?? null : null;

    const logoPublicUrl = logoAsset
      ? supabase.storage.from("member-logos").getPublicUrl(logoAsset.storage_path).data.publicUrl
      : null;

    const coverAssetIsMediaBucket = Boolean(coverAsset);
    const ogImageUrl = coverAssetIsMediaBucket
      ? `${siteOrigin}/api/member-media/${coverAsset!.id}`
      : logoPublicUrl;

    // Header prev/next: the visitor's own browsing order (spec, "Next in
    // the directory, not nearest"). If the visitor's filter doesn't
    // actually match this member (e.g. a shared link with a stale or
    // mismatched filter), fall back to the unfiltered default order
    // rather than silently excluding the member they're looking at.
    const effectiveFilter = data.filter === typedMember.member_type ? data.filter : undefined;
    let directoryQuery = supabase
      .from("members")
      .select("id, slug, business_name, city, member_type")
      .eq("status", "published")
      .order("business_name");
    if (effectiveFilter) {
      directoryQuery = directoryQuery.eq("member_type", effectiveFilter);
    }
    const { data: directoryRows } = await directoryQuery;
    const directoryEntries: DirectoryEntry[] = (directoryRows ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      businessName: row.business_name as string,
      city: row.city as string,
      memberType: row.member_type as MemberType,
    }));
    const { prev: headerPrev, next: headerNext } = getAdjacentInList(directoryEntries, typedMember.id);

    // Cross-link card: always scoped to this member's own type, regardless
    // of how the visitor arrived (spec: producers point at another
    // producer, mobile members at another mobile member, Allied Members
    // at another Allied Member).
    const { data: sameTypeRows } = await supabase
      .from("members")
      .select("id, slug, business_name, city, member_type")
      .eq("status", "published")
      .eq("member_type", typedMember.member_type)
      .order("business_name");
    const sameTypeEntries: DirectoryEntry[] = (sameTypeRows ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      businessName: row.business_name as string,
      city: row.city as string,
      memberType: row.member_type as MemberType,
    }));
    const crossLink = getAdjacentInList(sameTypeEntries, typedMember.id).next;

    return {
      member: typedMember,
      hours: (hours ?? []) as HoursRow[],
      specialHours: (specialHours ?? []) as SpecialHoursRow[],
      carouselSlides: (slides ?? []).map((slide) => ({
        ...(slide as CarouselSlideRow),
        asset: assetsById.get((slide as CarouselSlideRow).asset_id) as MediaAssetRow,
      })),
      links: (links ?? []) as MemberLinkRow[],
      events: (events ?? []) as EventRow[],
      categories: (categories ?? []) as CategoryRow[],
      logoAsset,
      coverAsset,
      logoPublicUrl,
      crossLink,
      headerPrev,
      headerNext,
      ogImageUrl,
      siteOrigin,
    };
  });
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors. This module has no unit test of its own — it's a thin data-shaping layer over live Supabase calls, which is why Tasks 3-7 pulled every piece of *decision-making* logic (list position, crop math, open-now) out into pure functions first. Its correctness is verified end-to-end in Task 20 against the real database.

- [ ] **Step 3: Commit**

```bash
git add src/lib/members/member-profile.server.ts
git commit -m "feat: add getMemberProfileData(), the profile route's single data source"
```

---

### Task 11: Private media streaming route

**Files:**
- Create: `src/routes/api.member-media.$assetId.ts`

**Interfaces:**
- Produces: `GET /api/member-media/$assetId`, a same-origin, publicly-fetchable (no auth header) image URL usable directly as an `<img src>`, that re-implements the `media_assets` public-select RLS rule before ever using the service-role key.
- Consumes: `getSupabaseServiceRoleClient` (Task 9).

- [ ] **Step 1: Implement the route**

Create `src/routes/api.member-media.$assetId.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Streams an original file out of the private `member-media` bucket.
 * `member-media` has no anon/public storage policy at all (schema plan,
 * Task 10) -- this route is the only way a browser ever sees its
 * contents, and it does so only after re-implementing, in application
 * code, the exact rule the RLS policy on `media_assets` encodes:
 * `review_status = 'approved'` AND referenced by a published member's
 * logo, cover, or carousel slide. The service-role client bypasses RLS
 * entirely, so this check is the only thing standing between "anyone
 * with an asset id" and every private file in the bucket -- do not relax
 * it without re-deriving it from the RLS policy in
 * docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md.
 *
 * v1 serves the original file as-is; the crop rectangle is applied in
 * CSS by the caller (src/lib/media/crop.ts), not resized server-side.
 */
async function findEligibleAsset(assetId: string) {
  const supabase = await getSupabaseServiceRoleClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_path, mime_type, review_status")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset || asset.review_status !== "approved") {
    return null;
  }

  const { data: asLogoOrCover } = await supabase
    .from("members")
    .select("id")
    .or(`logo_asset_id.eq.${assetId},cover_asset_id.eq.${assetId}`)
    .eq("status", "published")
    .maybeSingle();
  if (asLogoOrCover) {
    return asset;
  }

  const { data: slides } = await supabase.from("carousel_slides").select("member_id").eq("asset_id", assetId);
  const memberIds = (slides ?? []).map((slide) => slide.member_id as string);
  if (memberIds.length === 0) {
    return null;
  }

  const { data: publishedMember } = await supabase
    .from("members")
    .select("id")
    .in("id", memberIds)
    .eq("status", "published")
    .maybeSingle();

  return publishedMember ? asset : null;
}

export const Route = createFileRoute("/api/member-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const asset = await findEligibleAsset(params.assetId);
        if (!asset) {
          return new Response("Not found", { status: 404 });
        }

        const supabase = await getSupabaseServiceRoleClient();
        const { data: file, error } = await supabase.storage.from("member-media").download(asset.storage_path);
        if (error || !file) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(file, {
          headers: {
            "Content-Type": asset.mime_type,
            // Public is correct here: eligibility was already re-checked
            // above and this is public marketing content once eligible,
            // not identity-scoped data (see start-core/server-functions
            // skill's Cache-Control warning -- it doesn't apply to this
            // response).
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
```

- [ ] **Step 2: Verify the project type-checks and the dev server starts**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new type errors; dev server starts cleanly. Full end-to-end verification (an actual image byte response) happens in Task 20 once there's a real published member with a real asset to request.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.member-media.\$assetId.ts
git commit -m "feat: add the private member-media streaming route"
```

---

### Task 12: Image primitives — `LogoChip` and `MemberImage`

**Files:**
- Create: `src/components/profile/LogoChip.tsx`
- Create: `src/components/profile/MemberImage.tsx`

**Interfaces:**
- Produces: `<LogoChip>` (light chip + logo, for any dark surface) and `<MemberImage>` (crop-aware `<img>` for both public logos and private member-media, with a themed fallback block on load failure).
- Consumes: `computeCropStyle`/`CropRect` (Task 6), `getMemberThemeHex` (Task 3).

- [ ] **Step 1: Implement `MemberImage`**

Create `src/components/profile/MemberImage.tsx`:

```tsx
import { useState } from "react";
import { computeCropStyle, type CropRect } from "@/lib/media/crop";
import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";
import { cn } from "@/lib/utils";

type MemberImageProps = {
  src: string | null;
  crop: CropRect | null;
  alt: string;
  theme: MemberThemeName;
  aspectClassName: string; // e.g. "aspect-[4/5]" or "aspect-[2.5/1]"
  className?: string;
};

/**
 * Crop-aware image for both the public member-logos bucket (direct
 * public URL) and the private member-media streaming route
 * (/api/member-media/$assetId) -- both are plain <img src> URLs from
 * this component's point of view. On load failure, or when there's no
 * image at all, renders a theme-coloured block instead of a broken-image
 * icon (spec, "Empty and error states": "An image fails to load ->
 * Theme-coloured block in its place, never a broken-image icon or alt
 * text alone").
 */
export function MemberImage({ src, crop, alt, theme, aspectClassName, className }: MemberImageProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={cn("relative overflow-hidden rounded-card", aspectClassName, className)}>
      {showFallback ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: getMemberThemeHex(theme) }}
          role="img"
          aria-label={alt}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          style={crop ? computeCropStyle(crop) : { position: "absolute", inset: 0, width: "100%", height: "100%" }}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `LogoChip`**

Create `src/components/profile/LogoChip.tsx`:

```tsx
import { cn } from "@/lib/utils";

type LogoChipProps = {
  src: string | null;
  alt: string;
  size?: number; // px; defaults to 72 (mobile). Pass 104 for the desktop hero.
  className?: string;
};

/**
 * Always places a member logo on a light chip, never directly on a dark
 * surface (spec, "Logos and assets": a transparent PNG of a dark-ink
 * mark disappears against the dark guild chrome). Every logo render in
 * this build goes through this component -- most importantly the
 * cross-link card at the bottom of every profile, which the spec calls
 * out by name as where this bites.
 *
 * Renders through a plain <img>, never inlined markup -- a member-
 * uploaded SVG logo can carry script and must never be parsed as markup
 * in this page's origin (spec, "Logos and assets").
 */
export function LogoChip({ src, alt, size = 72, className }: LogoChipProps) {
  if (!src) return null;

  return (
    <div
      className={cn("flex items-center justify-center rounded-full bg-canvas p-2 shadow-sm", className)}
      style={{ width: size, height: size }}
    >
      <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/MemberImage.tsx src/components/profile/LogoChip.tsx
git commit -m "feat: add MemberImage and LogoChip profile image primitives"
```

---

### Task 13: `ProfileHero` and `StatusBlock`

**Files:**
- Create: `src/components/profile/ProfileHero.tsx`
- Create: `src/components/profile/StatusBlock.tsx`

**Interfaces:**
- Produces: `<ProfileHero>` (cover band, logo chip, name, badge, tagline) and `<StatusBlock>` (the per-type status line + second line + primary action, per the "Member types" comparison table).
- Consumes: `MemberImage`/`LogoChip` (Task 12), `computeOpenNow`/`OpenNowResult` (Task 7), `MemberRow`/`EventRow` (Task 8).

- [ ] **Step 1: Implement `ProfileHero`**

Create `src/components/profile/ProfileHero.tsx`:

```tsx
import { MemberImage } from "@/components/profile/MemberImage";
import { LogoChip } from "@/components/profile/LogoChip";
import type { MemberRow } from "@/lib/supabase/types";

type ProfileHeroProps = {
  member: MemberRow;
  coverUrl: string | null;
  logoUrl: string | null;
};

const MEMBER_TYPE_BADGE: Record<MemberRow["member_type"], string> = {
  producer: "Producer",
  mobile: "Mobile Member",
  allied: "Allied Member",
};

/**
 * The cover band, logo chip, name/badge, and tagline. On phone the cover
 * is 2.5:1; the desktop split (Task 17's route component) swaps in a
 * wider aspect class via the `aspectClassName` prop's caller, per the
 * spec's own breakpoint description. See this plan's Decisions section
 * for why the desktop crop reuses the same stored rectangle rather than
 * an independently-composed 4:1 crop.
 */
export function ProfileHero({ member, coverUrl, logoUrl }: ProfileHeroProps) {
  return (
    <div className="relative">
      <MemberImage
        src={coverUrl}
        crop={member.cover_crop}
        alt={`${member.business_name} cover photo`}
        theme={member.theme}
        aspectClassName="aspect-[2.5/1] md:aspect-[4/1]"
        className="rounded-none md:rounded-card"
      />
      <div className="relative -mt-9 flex items-end gap-4 px-4 md:-mt-13 md:px-6">
        <LogoChip src={logoUrl} alt={`${member.business_name} logo`} size={72} className="md:hidden" />
        <LogoChip src={logoUrl} alt={`${member.business_name} logo`} size={104} className="hidden md:flex" />
        <div className="flex flex-1 flex-col pb-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display text-2xl text-ink md:text-3xl">{member.business_name}</h1>
            <span className="rounded-pill bg-canvas-2 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {MEMBER_TYPE_BADGE[member.member_type]}
            </span>
          </div>
          <p className="text-sm text-ink-muted">{member.city}, {member.state}</p>
        </div>
      </div>
      {/* Spec, "Empty and error states": "No tagline -> Line omitted, name
          and badge close up." Omitting the element entirely (rather than
          rendering an empty <p>) is what makes that close-up happen. */}
      {member.tagline && (
        <p className="mt-3 px-4 text-base italic text-ink-muted md:px-6">{member.tagline}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `StatusBlock`**

Create `src/components/profile/StatusBlock.tsx`:

```tsx
import { computeOpenNow, type OpenNowResult, type SpecialHoursDay, type WeekdayHours } from "@/lib/hours/open-now";
import type { EventRow, MemberRow } from "@/lib/supabase/types";
import { Phone } from "lucide-react";

type StatusBlockProps = {
  member: MemberRow;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
  tonightEvent: EventRow | null; // the earliest non-postponed/canceled event starting today, if any
};

function formatHoursConfirmedLabel(hoursConfirmedAt: string | null): string | null {
  if (!hoursConfirmedAt) return null;
  const confirmedDate = new Date(hoursConfirmedAt);
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  if (confirmedDate.getTime() > ninetyDaysAgo) return null;
  return `Hours confirmed ${confirmedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

/**
 * The status line + second line + primary action, switched per the
 * "Member types" comparison table. Producer and Allied Member both show
 * open/closed with a phone-number fallback when there are no hours at
 * all (spec, "Empty and error states": "Hours not listed"); mobile shows
 * the next-appearance line instead, since mobile members have no weekly
 * hours (spec, "Events": "for a mobile member, events *are* the
 * schedule").
 */
export function StatusBlock({ member, hours, specialHours, tonightEvent }: StatusBlockProps) {
  const hasHours = hours.length > 0 || specialHours.length > 0;
  const openNow: OpenNowResult = hasHours
    ? computeOpenNow({ now: new Date(), timezone: member.timezone, hours, specialHours })
    : { status: "unknown" };
  const staleLabel = formatHoursConfirmedLabel(member.hours_confirmed_at);

  if (member.member_type === "mobile") {
    return (
      <div className="rounded-inset bg-canvas-2 p-4">
        {tonightEvent ? (
          <>
            <p className="font-display text-lg text-ink">Next appearance: {new Date(tonightEvent.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>
            <p className="text-sm text-ink-muted">{tonightEvent.venue_name ?? member.service_area}{tonightEvent.city ? `, ${tonightEvent.city}` : ""}</p>
          </>
        ) : (
          <p className="font-display text-lg text-ink">No dates announced yet</p>
        )}
        <a
          href={member.phone ? `tel:${member.phone}` : undefined}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Phone className="h-4 w-4" /> Book us
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-inset bg-canvas-2 p-4">
      {!hasHours || openNow.status === "unknown" ? (
        <>
          <p className="font-display text-lg text-ink">Hours not listed</p>
          {member.phone && (
            <a href={`tel:${member.phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Phone className="h-4 w-4" /> {member.phone}
            </a>
          )}
        </>
      ) : (
        <>
          <p className="font-display text-lg text-ink">
            {openNow.status === "open" ? (
              <>
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-open align-middle" aria-hidden="true" />
                Open now &middot; {openNow.closesInLabel}
              </>
            ) : (
              <>Closed{openNow.nextOpenLabel ? ` — ${openNow.nextOpenLabel}` : ""}</>
            )}
          </p>
          {tonightEvent && member.member_type !== "allied" && (
            <p className="text-sm text-ink-muted">Tonight: {tonightEvent.venue_name ?? "on tap"}</p>
          )}
          {staleLabel && <p className="mt-1 text-xs text-warn">{staleLabel}</p>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the project type-checks**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfileHero.tsx src/components/profile/StatusBlock.tsx
git commit -m "feat: add ProfileHero and StatusBlock profile components"
```

---

### Task 14: `ScheduleChips` and `EventsModule`

**Files:**
- Create: `src/components/profile/ScheduleChips.tsx`
- Create: `src/components/profile/EventsModule.tsx`

**Interfaces:**
- Produces: `<ScheduleChips>` (seven-day or five-day hour chips, producer/allied only) and `<EventsModule>` (the events list with status overlays, every type, heading text switched per type).
- Consumes: `WeekdayHours` (Task 7), `EventRow`/`MemberType` (Task 8).

- [ ] **Step 1: Implement `ScheduleChips`**

Create `src/components/profile/ScheduleChips.tsx`:

```tsx
import type { WeekdayHours } from "@/lib/hours/open-now";
import type { MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type ScheduleChipsProps = {
  hours: WeekdayHours[];
  memberType: MemberType;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Producer and Allied Member both get seven-day chips; the "five-day
// business hour chips" line in the spec's comparison table describes a
// typical Allied Member's actual schedule (closed weekends), not a
// different component -- the same seven-slot chip row just renders
// "Closed" for the days the member has none.
function formatChipTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour24 >= 12 ? "p" : "a";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

/** Seven-day hour chips (spec, "Member types": producer and Allied Member both get this module, mobile members get EventsModule instead). */
export function ScheduleChips({ hours, memberType }: ScheduleChipsProps) {
  if (memberType === "mobile" || hours.length === 0) return null;

  return (
    <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Weekly hours">
      {WEEKDAY_LABELS.map((label, weekday) => {
        const rowsForDay = hours.filter((row) => row.weekday === weekday);
        const isClosed = rowsForDay.length === 0 || rowsForDay.every((row) => row.isClosed);
        return (
          <div
            key={weekday}
            role="listitem"
            className="flex min-h-11 flex-col items-center justify-center rounded-md border border-canvas-border bg-canvas px-1 py-2 text-center"
          >
            <span className="text-[11px] font-semibold uppercase text-ink-muted">{label}</span>
            {isClosed ? (
              <span className="text-xs text-ink-muted">Closed</span>
            ) : (
              rowsForDay.map((row, i) => (
                <span key={i} className="text-xs text-ink">
                  {row.opensAt && formatChipTime(row.opensAt)}&ndash;{row.closesAt && formatChipTime(row.closesAt)}
                </span>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `EventsModule`**

Create `src/components/profile/EventsModule.tsx`:

```tsx
import type { EventRow, MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type EventsModuleProps = {
  events: EventRow[];
  memberType: MemberType;
};

const HEADINGS: Record<MemberType, string> = {
  producer: "Coming up",
  mobile: "Where we'll be",
  allied: "Coming up",
};

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Every member type gets this module (spec, "Events": "Every member type
 * can list events, not just mobile members"). Status overlays render per
 * the spec's table: postponed strikes the original date with no new
 * date, rescheduled shows the new date/time, canceled mutes the row and
 * strikes its details but the row stays visible (spec: "a silently
 * vanished row teaches them nothing").
 */
export function EventsModule({ events, memberType }: EventsModuleProps) {
  const visibleEvents = events.filter((event) => !event.is_hidden);

  if (memberType === "mobile" && visibleEvents.filter((e) => e.overlay_status !== "canceled").length === 0) {
    // Spec, "Empty and error states": "Mobile member, no upcoming events ->
    // 'No dates announced yet' with the booking button still present --
    // never an empty list." The booking button itself lives in
    // StatusBlock for mobile members, so this module just steps aside
    // rather than rendering a duplicate CTA.
    return (
      <section>
        <h2 className="font-display text-lg text-ink">{HEADINGS[memberType]}</h2>
        <p className="mt-2 text-sm text-ink-muted">No dates announced yet</p>
      </section>
    );
  }

  if (visibleEvents.length === 0) {
    // Spec's general rule: a module with nothing in it disappears rather
    // than rendering an empty container -- this is the "no exceptions
    // listed" case for producer/Allied Member.
    return null;
  }

  return (
    <section>
      <h2 className="font-display text-lg text-ink">{HEADINGS[memberType]}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {visibleEvents.map((event) => {
          const isPostponed = event.overlay_status === "postponed";
          const isCanceled = event.overlay_status === "canceled";
          const isRescheduled = event.overlay_status === "rescheduled";

          return (
            <li
              key={event.id}
              className={cn(
                "flex flex-col gap-0.5 rounded-md border border-canvas-border bg-canvas px-3 py-2",
                isCanceled && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("text-sm text-ink", (isPostponed || isCanceled) && "line-through")}>
                  {formatEventDate(event.starts_at)}
                </span>
                {event.overlay_status && (
                  <span className="rounded-pill bg-warn/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-warn">
                    {event.overlay_status}
                  </span>
                )}
              </div>
              {isRescheduled && event.overlay_starts_at && (
                <span className="text-sm font-medium text-ink">
                  New time: {formatEventDate(event.overlay_starts_at)}
                </span>
              )}
              {(event.venue_name || event.city) && !isCanceled && (
                <span className="text-xs text-ink-muted">
                  {[event.venue_name, event.city].filter(Boolean).join(", ")}
                </span>
              )}
              {event.overlay_note && <span className="text-xs text-ink-muted">{event.overlay_note}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Verify the project type-checks**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ScheduleChips.tsx src/components/profile/EventsModule.tsx
git commit -m "feat: add ScheduleChips and EventsModule profile components"
```

---

### Task 15: `DiscountBlock`, `CategoryChips`, `LinkPills`, `ContactBlock`

**Files:**
- Create: `src/components/profile/DiscountBlock.tsx`
- Create: `src/components/profile/CategoryChips.tsx`
- Create: `src/components/profile/LinkPills.tsx`
- Create: `src/components/profile/ContactBlock.tsx`

**Interfaces:**
- Produces: four small, self-contained modules, each rendering nothing when its data is absent per the "Empty and error states" table.
- Consumes: `MemberRow`/`CategoryRow`/`MemberLinkRow` (Task 8).

- [ ] **Step 1: Implement `DiscountBlock`**

Create `src/components/profile/DiscountBlock.tsx`:

```tsx
import type { MemberRow } from "@/lib/supabase/types";

type DiscountBlockProps = {
  member: MemberRow;
};

/**
 * Allied Member only. Renders large, in `--brand` with white text --
 * never `--brand-bright` (spec, "Allied Member discount": "The block
 * uses --brand, the deeper amber, because it carries white text. Never
 * build it on --brand-bright."). Omitted entirely when no discount is
 * set (spec, "Empty and error states").
 */
export function DiscountBlock({ member }: DiscountBlockProps) {
  if (member.member_type !== "allied") return null;
  if (!member.discount_no_fixed_percent && member.discount_percent == null) return null;

  return (
    <div className="rounded-inset bg-brand px-4 py-4 text-white">
      <p className="font-display text-2xl">
        {member.discount_no_fixed_percent ? "Discounts available to members in good standing" : `${member.discount_percent}% off`}
      </p>
      {!member.discount_no_fixed_percent && <p className="text-sm text-white/85">for members in good standing</p>}
      {member.discount_redeem_text && <p className="mt-1 text-sm text-white/85">{member.discount_redeem_text}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implement `CategoryChips`**

Create `src/components/profile/CategoryChips.tsx`:

```tsx
import type { CategoryRow } from "@/lib/supabase/types";

type CategoryChipsProps = {
  categories: CategoryRow[];
};

/** "What they supply" -- Allied Member only in practice, since only Allied Members have member_categories rows. Omitted entirely when empty. */
export function CategoryChips({ categories }: CategoryChipsProps) {
  if (categories.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Supply categories">
      {categories.map((category) => (
        <li key={category.id} className="rounded-pill border border-canvas-border bg-canvas-2 px-3 py-1 text-sm text-ink">
          {category.name}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Implement `LinkPills`**

Create `src/components/profile/LinkPills.tsx`:

```tsx
import type { MemberLinkRow } from "@/lib/supabase/types";
import { ExternalLink } from "lucide-react";

type LinkPillsProps = {
  links: MemberLinkRow[];
};

const LABELS: Record<MemberLinkRow["kind"], string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  taplist: "Tap list",
  menu: "Menu",
  press_kit: "Press kit",
  catalog: "Catalog",
  other: "Link",
};

/**
 * Renders every configured link as a pill, real <a href> per spec's
 * tap-target rules. The "third link pill" the comparison table calls
 * out (Tap list / Press kit / Catalog) is just whichever of those three
 * kinds happens to be present -- no special-casing needed here, the
 * member only sets links relevant to their own type.
 */
export function LinkPills({ links }: LinkPillsProps) {
  if (links.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-canvas-border bg-canvas px-4 text-sm font-medium text-ink hover:border-brand-bright"
          >
            {link.label ?? LABELS[link.kind]} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Implement `ContactBlock`**

Create `src/components/profile/ContactBlock.tsx`:

```tsx
import type { MemberRow } from "@/lib/supabase/types";
import { Mail, MapPin, Phone } from "lucide-react";

type ContactBlockProps = {
  member: MemberRow;
};

/**
 * Location field + contact, switched per type per the comparison table:
 * street address for producer/Allied Member, service area for mobile;
 * phone for producer/mobile, phone + email for Allied Member. Address
 * links out to maps, phone is tel:, email is mailto: (spec's tap-target
 * rules).
 */
export function ContactBlock({ member }: ContactBlockProps) {
  const locationText =
    member.member_type === "mobile" ? member.service_area : member.street_address;
  const mapsQuery = member.street_address ? `${member.street_address}, ${member.city}, ${member.state}` : null;

  return (
    <div className="flex flex-col gap-2 text-sm text-ink">
      {locationText && (
        <a
          href={mapsQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}` : undefined}
          target={mapsQuery ? "_blank" : undefined}
          rel={mapsQuery ? "noreferrer" : undefined}
          className="inline-flex min-h-11 items-center gap-2"
        >
          <MapPin className="h-4 w-4 shrink-0 text-brand-bright" /> {locationText}
        </a>
      )}
      {member.phone && (
        <a href={`tel:${member.phone}`} className="inline-flex min-h-11 items-center gap-2">
          <Phone className="h-4 w-4 shrink-0 text-brand-bright" /> {member.phone}
        </a>
      )}
      {member.member_type === "allied" && member.contact_email && (
        <a href={`mailto:${member.contact_email}`} className="inline-flex min-h-11 items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-brand-bright" /> {member.contact_email}
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify the project type-checks**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/DiscountBlock.tsx src/components/profile/CategoryChips.tsx src/components/profile/LinkPills.tsx src/components/profile/ContactBlock.tsx
git commit -m "feat: add DiscountBlock, CategoryChips, LinkPills, ContactBlock"
```

---

### Task 16: `MediaCarousel`, `CrossLinkCard`, `HeaderNav`

**Files:**
- Create: `src/components/profile/MediaCarousel.tsx`
- Create: `src/components/profile/CrossLinkCard.tsx`
- Create: `src/components/profile/HeaderNav.tsx`

**Interfaces:**
- Produces: `<MediaCarousel>` (4:5 slides, no dots for a single slide, omitted for none), `<CrossLinkCard>` (dark card, logo-on-light-chip, per-type wording), `<HeaderNav>` (previous/next links, search-param-preserving).
- Consumes: `MemberImage`/`LogoChip` (Task 12), `DirectoryEntry` (Task 5), `DirectorySearch` (Task 4), the existing `carousel` shadcn component (`src/components/ui/carousel.tsx`, already in the project via `embla-carousel-react`).

- [ ] **Step 1: Implement `MediaCarousel`**

Create `src/components/profile/MediaCarousel.tsx`:

```tsx
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { MemberImage } from "@/components/profile/MemberImage";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import type { MemberThemeName } from "@/lib/theme/member-themes";

type MediaCarouselProps = {
  slides: (CarouselSlideRow & { asset: MediaAssetRow })[];
  memberName: string;
  theme: MemberThemeName;
};

/**
 * Spec, "The slot": one 4:5 ratio for every slide, max four, no dots for
 * a single slide. Spec, "Empty and error states": no slides -> module
 * omitted entirely, the cover and hero carry the page.
 */
export function MediaCarousel({ slides, memberName, theme }: MediaCarouselProps) {
  if (slides.length === 0) return null;

  return (
    <Carousel className="w-full md:w-[420px]">
      <CarouselContent>
        {slides.map((slide) => {
          const image = (
            <MemberImage
              src={`/api/member-media/${slide.asset.id}`}
              crop={slide.crop}
              alt={`${memberName} photo`}
              theme={theme}
              aspectClassName="aspect-[4/5]"
            />
          );
          return (
            <CarouselItem key={slide.id}>
              {slide.outbound_url ? (
                <a href={slide.outbound_url} target="_blank" rel="noreferrer" className="block">
                  {image}
                </a>
              ) : (
                image
              )}
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}
```

- [ ] **Step 2: Implement `CrossLinkCard`**

Create `src/components/profile/CrossLinkCard.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { LogoChip } from "@/components/profile/LogoChip";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { MemberType } from "@/lib/supabase/types";

type CrossLinkCardProps = {
  entry: DirectoryEntry | null;
  memberType: MemberType;
  logoUrlByMemberId?: never; // deliberately not plumbed in v1 -- see note below
};

// Copy per type (spec, "The Guild Trail" + "Member types" comparison
// table). Never "brewery" -- the Guild takes meaderies, cideries, and
// distilleries too.
const CROSS_LINK_HEADING: Record<MemberType, string> = {
  producer: "Next on the trail",
  mobile: "Playing nearby",
  allied: "Another Allied Member",
};

/**
 * Renders on every profile regardless of type -- cross-linking is not
 * deferred, only the Trail passport/progress-strip is (spec, "The Guild
 * Trail"). Dark card, so any logo shown on it MUST sit on a light chip
 * (LogoChip) -- this is the exact place the spec calls out by name.
 *
 * v1 does not fetch the target member's logo (that would mean a second
 * asset lookup inside getMemberProfileData for a card that, at launch,
 * mostly points at name+city-only imported members anyway per "Most
 * profiles will be that member for a long time"). Renders name/city only
 * until a follow-up wires the logo through; the LogoChip usage above
 * documents where it plugs in once it does.
 */
export function CrossLinkCard({ entry, memberType }: CrossLinkCardProps) {
  if (!entry) return null;

  return (
    <Link
      to="/members/$slug"
      params={{ slug: entry.slug }}
      className="flex min-h-11 items-center gap-4 rounded-card bg-surface px-5 py-4 text-text hover:bg-surface-2"
    >
      <LogoChip src={null} alt="" size={56} />
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-bright">
          {CROSS_LINK_HEADING[memberType]}
        </span>
        <span className="font-display text-lg">{entry.businessName}</span>
        <span className="text-sm text-text-muted">{entry.city}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Implement `HeaderNav`**

Create `src/components/profile/HeaderNav.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { ChevronLeft, ChevronRight } from "lucide-react";

type HeaderNavProps = {
  prev: DirectoryEntry | null;
  next: DirectoryEntry | null;
  search: DirectorySearch;
};

/**
 * Previous/next across the visitor's own browsing order (spec, "Next in
 * the directory, not nearest"). Preserves the current search state on
 * navigation so filter/sort/map-position keep carrying forward, and so
 * "Back to members" from the *next* profile still restores the original
 * view (spec, "Keeping the visitor's place").
 */
export function HeaderNav({ prev, next, search }: HeaderNavProps) {
  if (!prev && !next) return null;

  return (
    <nav className="flex items-center justify-between" aria-label="Directory navigation">
      {prev ? (
        <Link
          to="/members/$slug"
          params={{ slug: prev.slug }}
          search={search}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-text hover:text-brand-bright"
          aria-label={`Previous: ${prev.businessName}`}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          to="/members/$slug"
          params={{ slug: next.slug }}
          search={search}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-text hover:text-brand-bright"
          aria-label={`Next: ${next.businessName}`}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Verify the project type-checks**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/MediaCarousel.tsx src/components/profile/CrossLinkCard.tsx src/components/profile/HeaderNav.tsx
git commit -m "feat: add MediaCarousel, CrossLinkCard, HeaderNav profile components"
```

---

### Task 17: Assemble `MemberProfileTemplate`

**Files:**
- Create: `src/components/profile/MemberProfileTemplate.tsx`

**Interfaces:**
- Produces: `<MemberProfileTemplate data={MemberProfileData} search={DirectorySearch} />` — the single template every member type renders through.
- Consumes: everything from Tasks 12-16, `MemberProfileData` (Task 10).

- [ ] **Step 1: Implement the template**

Create `src/components/profile/MemberProfileTemplate.tsx`:

```tsx
import { ProfileHero } from "@/components/profile/ProfileHero";
import { StatusBlock } from "@/components/profile/StatusBlock";
import { ScheduleChips } from "@/components/profile/ScheduleChips";
import { EventsModule } from "@/components/profile/EventsModule";
import { DiscountBlock } from "@/components/profile/DiscountBlock";
import { CategoryChips } from "@/components/profile/CategoryChips";
import { LinkPills } from "@/components/profile/LinkPills";
import { ContactBlock } from "@/components/profile/ContactBlock";
import { MediaCarousel } from "@/components/profile/MediaCarousel";
import { CrossLinkCard } from "@/components/profile/CrossLinkCard";
import { HeaderNav } from "@/components/profile/HeaderNav";
import type { MemberProfileData } from "@/lib/members/member-profile.server";
import type { DirectorySearch } from "@/lib/directory/search-params";

type MemberProfileTemplateProps = {
  data: MemberProfileData;
  search: DirectorySearch;
};

/**
 * ONE template, switched by member_type at the module level -- never
 * forked into three templates (spec, "Member types": "Build it that way
 * from the start -- forking the template per type is the failure mode").
 * Mobile-first: this component's own markup is the single column;
 * src/routes/members.$slug.tsx (Task 18) is what adds the desktop split
 * around it, per the spec's stated build order.
 */
export function MemberProfileTemplate({ data, search }: MemberProfileTemplateProps) {
  const { member, hours, specialHours, events, carouselSlides, links, categories, crossLink, headerPrev, headerNext, logoPublicUrl, coverAsset } = data;

  const now = Date.now();
  const tonightEvent =
    events.find((event) => {
      if (event.overlay_status === "postponed" || event.overlay_status === "canceled") return false;
      const startsAt = new Date(event.overlay_starts_at ?? event.starts_at).getTime();
      return startsAt >= now;
    }) ?? null;

  const coverUrl = coverAsset ? `/api/member-media/${coverAsset.id}` : null;

  return (
    <article className="mx-auto max-w-[1120px]">
      <div className="px-4 pt-4 md:px-6">
        <HeaderNav prev={headerPrev} next={headerNext} search={search} />
      </div>

      <ProfileHero member={member} coverUrl={coverUrl} logoUrl={logoPublicUrl} />

      <div className="mt-6 flex flex-col gap-6 px-4 md:flex-row md:px-6">
        <div className="md:w-[420px] md:shrink-0">
          <MediaCarousel slides={carouselSlides} memberName={member.business_name} theme={member.theme} />
        </div>

        <div className="flex flex-1 flex-col gap-6">
          <StatusBlock member={member} hours={hours} specialHours={specialHours} tonightEvent={tonightEvent} />

          <DiscountBlock member={member} />
          <CategoryChips categories={categories} />

          <ScheduleChips hours={hours} memberType={member.member_type} />
          <EventsModule events={events} memberType={member.member_type} />

          <LinkPills links={links} />
          <ContactBlock member={member} />
        </div>
      </div>

      <div className="mt-8 px-4 md:px-6">
        <CrossLinkCard entry={crossLink} memberType={member.member_type} />
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/MemberProfileTemplate.tsx
git commit -m "feat: assemble MemberProfileTemplate, the single per-type-switched profile template"
```

---

### Task 18: The route — `src/routes/members.$slug.tsx`

**Files:**
- Create: `src/routes/members.$slug.tsx`

**Interfaces:**
- Produces: `GET /members/$slug` — the actual public page: loader, `notFoundComponent`, meta/OG/Twitter/JSON-LD `head()`, and the rendered `MemberProfileTemplate`.
- Consumes: `getMemberProfileData` (Task 10), `validateDirectorySearch`/`DirectorySearch` (Task 4), `MemberProfileTemplate` (Task 17).

- [ ] **Step 1: Implement the route**

Create `src/routes/members.$slug.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { getMemberProfileData } from "@/lib/members/member-profile.server";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";

export const Route = createFileRoute("/members/$slug")({
  validateSearch: validateDirectorySearch,
  loaderDeps: ({ search }) => ({ filter: search.filter, sort: search.sort }),
  loader: async ({ params, deps }) =>
    getMemberProfileData({ data: { slug: params.slug, filter: deps.filter, sort: deps.sort } }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { member, ogImageUrl, siteOrigin } = loaderData;
    const description =
      member.tagline ?? `${member.business_name} — an independent ${member.member_type === "producer" ? "producer" : member.member_type === "mobile" ? "mobile" : "supply"} member of the IE Brewers Guild in ${member.city}.`;
    const canonicalUrl = `${siteOrigin}/members/${member.slug}`;

    return {
      meta: [
        { title: `${member.business_name} — IE Brewers Guild` },
        { name: "description", content: description },
        { property: "og:title", content: member.business_name },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl },
        ...(ogImageUrl ? [{ property: "og:image", content: ogImageUrl }] : []),
        { name: "twitter:card", content: ogImageUrl ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: member.business_name },
        { name: "twitter:description", content: description },
        ...(ogImageUrl ? [{ name: "twitter:image", content: ogImageUrl }] : []),
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: member.business_name,
            description,
            url: canonicalUrl,
            image: ogImageUrl ?? undefined,
            telephone: member.phone ?? undefined,
            address: member.street_address
              ? {
                  "@type": "PostalAddress",
                  streetAddress: member.street_address,
                  addressLocality: member.city,
                  addressRegion: member.state,
                  postalCode: member.postal_code ?? undefined,
                }
              : undefined,
          }),
        },
      ],
    };
  },
  component: MemberProfilePage,
  // Catches notFound() thrown from THIS route's own loader (an
  // unpublished/nonexistent slug) -- per the installed router-core
  // not-found-and-errors skill, a leaf route's notFoundComponent works
  // for exactly this case even though it can't catch unmatched-path
  // not-founds. This gives the spec's required "directory's own 404,
  // offering the member list" instead of the generic site 404 in
  // __root.tsx. It does NOT yet cover the spec's other 404 case --
  // "profile is a draft or still an application: ... preview banner to
  // its own members" -- because member auth doesn't exist until the
  // Member Admin phase. When that lands, this loader needs to branch:
  // if the requester is an authenticated editor of this member, render
  // the preview instead of throwing notFound(). Tracked here, not
  // silently dropped.
  notFoundComponent: () => (
    <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-2xl text-ink">We couldn't find that member</h1>
      <p className="text-ink-muted">They may have moved, or the profile isn't published yet.</p>
      <Link
        to="/members"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Browse all members
      </Link>
    </div>
  ),
});

function MemberProfilePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <MemberProfileTemplate data={data} search={search} />;
}
```

- [ ] **Step 2: Verify the project type-checks and the dev server starts**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new type errors; dev server starts. Full behavior against real data is verified in Task 20.

- [ ] **Step 3: Commit**

```bash
git add src/routes/members.\$slug.tsx
git commit -m "feat: add the /members/\$slug route (loader, meta/OG/JSON-LD, 404, template)"
```

---

### Task 19: `MembersMap` — profile links and view-position tracking

**Files:**
- Modify: `src/components/site/MembersMap.tsx`

**Interfaces:**
- Consumes: `slugify` (Task 2), `DirectorySearch` (Task 4).
- Produces: a `slug` field on each map pin, a "View profile" link in the pin callout, and an `onViewChange` callback the parent (Task 20) uses to write map position into the query string.

- [ ] **Step 1: Add `slug` to the pin shape and a "View profile" link to the callout**

In `src/components/site/MembersMap.tsx`, update the imports and the `Pin` type/`membersToPins`:

```ts
import { APIProvider, Map, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Member } from "@/data/site";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { slugify } from "@/lib/slug";
import { Compass, ExternalLink, Navigation } from "lucide-react";

type Pin = {
  brewery: string;
  slug: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  website: string;
  tourUrl?: string;
};

function membersToPins(members: Member[]): Pin[] {
  return members.flatMap((m) =>
    m.locations.map((l) => ({
      brewery: m.name,
      slug: slugify(m.name),
      city: l.city,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      website: m.website,
      tourUrl: m.tourUrl,
    })),
  );
}
```

Add a "View profile" link into the `InfoWindow`'s button row, alongside the existing Website/Take A Tour/Directions buttons:

```tsx
                  <Link
                    to="/members/$slug"
                    params={{ slug: active.slug }}
                    search={linkSearch}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-700 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
                  >
                    View profile
                  </Link>
```

(Add this `<Link>` as the first item inside the existing `<div className="mt-3 flex flex-wrap gap-2">` block, before the Website link.)

- [ ] **Step 2: Accept `linkSearch` and view-tracking props on `MembersMap`**

Update the component's signature and add camera-change tracking with a small inline debounce (no new dependency):

```tsx
type MembersMapProps = {
  members: Member[];
  linkSearch: DirectorySearch;
  initialView?: { lat: number; lng: number; zoom: number };
  onViewChange?: (view: { lat: number; lng: number; zoom: number }) => void;
};

export function MembersMap({ members, linkSearch, initialView, onViewChange }: MembersMapProps) {
  const pins = useMemo(() => membersToPins(members), [members]);
  const [active, setActive] = useState<Pin | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleCameraChanged = (event: { detail: { center: { lat: number; lng: number }; zoom: number } }) => {
    if (!onViewChange) return;
    clearTimeout(debounceRef.current);
    // Debounced so a drag/zoom gesture writes one query-string update when
    // it settles, not one per intermediate frame (spec: "a couple of URL
    // parameters, not an architecture" -- this keeps it lightweight).
    debounceRef.current = setTimeout(() => {
      onViewChange({ lat: event.detail.center.lat, lng: event.detail.center.lng, zoom: event.detail.zoom });
    }, 400);
  };

  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-border shadow-[var(--shadow-glow)] md:h-[600px]">
        <Map
          defaultCenter={initialView ? { lat: initialView.lat, lng: initialView.lng } : { lat: 33.95, lng: -117.3 }}
          defaultZoom={initialView?.zoom ?? 9}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl
          onCameraChanged={handleCameraChanged}
        >
          {!initialView && <FitToPins pins={pins} />}
```

(Keep everything else in the file the same — `FitToPins`, markers, and the rest of the `InfoWindow` body are unchanged except for the added "View profile" link from Step 1. `FitToPins` is now conditional on `!initialView` so restoring a saved map position — Task 20's "Back to members" — doesn't immediately get overridden by the auto-fit-to-bounds behavior.)

- [ ] **Step 3: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: `src/routes/members.tsx` (not yet updated) will now show a type error at its `<MembersMap members={members} />` call site, missing the new required `linkSearch` prop — that's expected and gets fixed in Task 20, the very next task.

- [ ] **Step 4: Commit**

```bash
git add src/components/site/MembersMap.tsx
git commit -m "feat: add profile links and map-position tracking to MembersMap"
```

---

### Task 20: `members.tsx` — profile links, search-param plumbing, "Back to members"

**Files:**
- Modify: `src/routes/members.tsx`

**Interfaces:**
- Consumes: `validateDirectorySearch`/`DirectorySearch` (Task 4), `slugify` (Task 2), the updated `MembersMap` (Task 19).

- [ ] **Step 1: Add `validateSearch` and read/write the map position**

In `src/routes/members.tsx`, update the imports and `Route` definition:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHero } from "@/components/site/PageHero";
import { SectionHeader } from "@/components/site/SectionHeader";
import { MembersMap } from "@/components/site/MembersMap";
import { members, type Location } from "@/data/site";
import { slugify } from "@/lib/slug";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { Beer, ExternalLink, Facebook, Instagram, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import heroImg from "@/assets/pillar-events.jpg";

export const Route = createFileRoute("/members")({
  validateSearch: validateDirectorySearch,
  head: () => ({
    meta: [
      { title: "Member Breweries — IE Brewers Guild" },
      { name: "description", content: "Discover the independent craft breweries that make up the IE Brewers Guild." },
      { property: "og:title", content: "Member Breweries" },
      { property: "og:description", content: "Independent breweries in the guild." },
    ],
  }),
  component: MembersPage,
});
```

- [ ] **Step 2: Wire the map's `linkSearch`, `initialView`, and `onViewChange`**

Inside `MembersPage`, replace the existing `<MembersMap members={members} />` call:

```tsx
function MembersPage() {
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/members" });

  const initialView =
    search.mapLat !== undefined && search.mapLng !== undefined && search.mapZoom !== undefined
      ? { lat: search.mapLat, lng: search.mapLng, zoom: search.mapZoom }
      : undefined;

  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="Our members"
        title="The breweries behind the guild."
        subtitle="Every member is independently owned and proud of it."
        minHeight="min-h-[50vh]"
      />

      <section className="mx-auto max-w-7xl px-4 pt-20 md:px-6">
        <SectionHeader
          eyebrow="Find a member"
          title="Breweries on the map."
          subtitle="Click any pin for the address, website, and driving directions."
          align="center"
        />
        <div className="mt-10">
          <MembersMap
            members={members}
            linkSearch={search}
            initialView={initialView}
            onViewChange={(view) =>
              navigate({
                search: (prev) => ({ ...prev, mapLat: view.lat, mapLng: view.lng, mapZoom: view.zoom }),
                replace: true,
              })
            }
          />
        </div>
      </section>
```

(`replace: true` keeps map panning from spamming browser history — the spec's "keeping the visitor's place" is about restoring state on return, not about making every pan/zoom its own back-button stop.)

- [ ] **Step 3: Add a "View profile" link to each card in the grid**

Inside the card-grid `<article>` (right after the closing `</p>` of the location chips, before the existing `<a href={m.website} ...>` "Visit" link), add:

```tsx
              <Link
                to="/members/$slug"
                params={{ slug: slugify(m.name) }}
                search={search}
                className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                View profile
              </Link>
```

- [ ] **Step 4: Verify the project type-checks and the dev server starts**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no type errors; visiting `http://localhost:8080/members` shows a "View profile" link on each card and in each map pin's callout.

- [ ] **Step 5: Commit**

```bash
git add src/routes/members.tsx
git commit -m "feat: link from the Members page into profiles and carry map position in the URL"
```

---

### Task 21: End-to-end verification

**Files:** none created or modified.

This task has no unit tests of its own — it is the final pass confirming Tasks 1-20 work together against a real (or at least one seeded) Supabase member row, matching this plan's own required-implementation checklist.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: every test from Tasks 2-7 passes (slugify, member-themes, search-params, list-position, crop, open-now).

- [ ] **Step 2: Type-check the whole project**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Seed one real member row of each type for manual verification**

Using the Supabase dashboard's SQL editor (or `npx supabase db execute`), insert three published members — one of each `member_type` — with enough data to exercise every module: hours + special_hours for the producer, events for the mobile member, a discount + categories for the Allied Member. Note their slugs.

- [ ] **Step 4: Start the dev server and load each profile**

```bash
npm run dev
```

Using the Playwright browser tool, navigate to `http://localhost:8080/members/<producer-slug>`, `.../<mobile-slug>`, and `.../<allied-slug>`. For each, confirm by eye against the "Member types" comparison table: correct status line, second line, primary action, schedule vs. events module, discount block only on the Allied Member, "Next on the trail"/"Playing nearby"/"Another Allied Member" wording on the cross-link card (with no member of that type published yet, the card should simply not render — that's the wraparound-safe `null` case from `getAdjacentInList`).

- [ ] **Step 5: Verify the empty-state rows that don't need a full seeded member**

Navigate to `http://localhost:8080/members/does-not-exist`. Expected: the profile-specific 404 ("We couldn't find that member" / "Browse all members" link), not the generic site 404. Then seed a `draft`-status member and navigate to its slug directly — expected: the same 404 (RLS hides it from the anon read, so it looks identical to a nonexistent slug, per this plan's Decision 6).

- [ ] **Step 6: Verify the private-media route**

For the producer member, upload a test image into the `member-media` bucket at `{member_id}/test.jpg`, insert a `media_assets` row pointing at it with `review_status = 'approved'`, and set it as that member's `cover_asset_id`. Reload the profile — the cover band should show the image (not the theme-colour fallback). Then request `http://localhost:8080/api/member-media/<some-other-unapproved-or-unreferenced-asset-id>` directly — expected: `404 Not found`, confirming the eligibility check actually blocks ineligible assets rather than only being exercised by the happy path.

- [ ] **Step 7: Verify "Keeping the visitor's place"**

On `/members`, pan/zoom the map, then click a card's "View profile" link. On the profile page, click "Back to members" (rendered via `HeaderNav`'s search-preserving pattern — confirm the Members page itself has a literal "Back to members" link near its own header using the same `search={search}` pattern; if it's missing, add one). Expected: the map returns to the panned/zoomed position, not the default auto-fit view.

- [ ] **Step 8: Confirm meta tags and JSON-LD render**

With a profile loaded, use the Playwright browser tool's `browser_evaluate` to run:

```js
() => {
  const ld = document.querySelector('script[type="application/ld+json"]');
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    jsonLd: ld ? JSON.parse(ld.textContent ?? "{}") : null,
  };
}
```

Expected: `title` includes the business name, `description` is the tagline (or the generated fallback), `ogImage` is either a `/api/member-media/...` URL or the public logo URL, and `jsonLd["@type"]` is `"LocalBusiness"` with the right `name`/`address`.

No commit for this task — it's a verification pass. If any step doesn't match, go back and fix the responsible task before considering this phase done.

---

## Self-review

**1. Spec coverage.** Walked every section named in the task brief's "Required reading" and "What your plan must implement" lists against the tasks above:
- Member types comparison table → Tasks 12-17 (`StatusBlock`, `ScheduleChips`/`EventsModule`, `DiscountBlock`, `ContactBlock`, `LinkPills`, `CrossLinkCard`, assembled in `MemberProfileTemplate`).
- Media model / slot rules → Task 16 (`MediaCarousel`: max four slides, no dots for one, omitted for none) and Task 6 (crop math).
- Logos and assets (light chip, `<img>` never inline) → Task 12 (`LogoChip`), used in Task 13 (`ProfileHero`) and Task 16 (`CrossLinkCard`, the explicitly-called-out case).
- Events + status overlays → Task 14 (`EventsModule`).
- Layout and breakpoints (mobile-first, 1120px cap, desktop split) → Task 17 (`MemberProfileTemplate`'s single-column-then-`md:flex-row` structure) and Task 13 (hero's `md:` cover/logo-size swap).
- Empty and error states table → cross-checked row by row: no slides (Task 16 early return), one slide/no dots (embla's default single-item behavior — no dot indicator code was added, matching "renders without carousel dots"), no cover (Task 12's `MemberImage` fallback), no tagline (Task 13's conditional render), no hours (Task 13's `StatusBlock` "Hours not listed" branch), stale hours (Task 13's `formatHoursConfirmedLabel`), mobile no events (Task 14's early branch), sync failing (out of scope — no sync exists yet in this phase, correctly: nothing in this plan writes `calendar_connections.sync_status`), no discount/no categories (Tasks 15's early returns), image load failure (Task 12's `onError` fallback), draft/application 404 and slug-not-found 404 (Task 18, with the auth-half gap explicitly flagged per Decision 6).
- Profiles are pages, not modals: routes, meta/OG/Twitter/JSON-LD → Task 18. Keeping the visitor's place → Tasks 4, 19, 20, verified in Task 21 Step 7. Next in the directory, not nearest → Tasks 5, 10, 16.
- Computing "open now" → Task 7, with the exact yesterday-bleed and special-hours-wins-outright rules tested.
- Allied Member discount, brand-not-bright-amber → Task 15.
- Row level security / storage buckets → Task 11 (re-implements the exact public-select rule before the service-role key ever touches a request), Task 9 (never exposes the service-role key to the browser).
- Codebase conventions: Cloudflare Worker secrets pattern → Task 1 + Task 9. No test runner existed → Task 2 introduces Vitest and is used by every subsequent pure-logic task. No Supabase client existed → Task 9, named exactly as later phases need to find it. 44px targets / real anchors-buttons / `aria-label` / `tel:`/`mailto:`/maps-link → applied throughout Tasks 12-16 (`min-h-11` on every interactive element, `aria-label` on `HeaderNav`'s icon-bearing links, `tel:`/`mailto:`/maps directions link in `ContactBlock` and `StatusBlock`).
- Members page changes: profile links from card grid and map popup → Tasks 19-20. Query-string carrying → Tasks 4, 19, 20.

No gap found without either a task covering it or an explicit, named Decision explaining why it's out of scope for this phase (draft-preview-banner auth gap, desktop-cover-crop limitation, filter/sort UI absence).

**2. Placeholder scan.** Searched the plan for "TBD"/"TODO"/"handle appropriately"/"similar to Task N"/unshown code. None found — every step that produces a file shows its complete contents; the one step that intentionally doesn't run tests to completion (Task 10) explains why (it's a thin data-shaping layer over pure functions that already have their own tests, verified end-to-end in Task 21) rather than skipping verification silently.

**3. Type consistency.** Traced the names that cross task boundaries:
- `MemberType`, `MemberRow`, `MediaAssetRow`, `CarouselSlideRow`, `MemberLinkRow`, `HoursRow`, `SpecialHoursRow`, `EventRow`, `CategoryRow`, `ThemeName`, `CropRect` — all defined once in Task 8 (`src/lib/supabase/types.ts`) and imported by name (not redefined) everywhere else they appear (Tasks 4, 5, 7 note the forward-reference, 9, 10, 12-17, 19).
- `DirectorySearch`/`DirectorySort`/`validateDirectorySearch` — defined once in Task 4, imported identically by both routes (Tasks 18, 20) and by `HeaderNav` (Task 16).
- `DirectoryEntry`/`getAdjacentInList` — defined once in Task 5, consumed by `member-profile.server.ts` (Task 10) and referenced by type in `CrossLinkCard`/`HeaderNav` (Task 16).
- `CropRect`/`computeCropStyle` — defined once in Task 6 (note: `CropRect` is defined independently in both Task 6's `src/lib/media/crop.ts` and Task 8's `src/lib/supabase/types.ts` with the identical `{x,y,w,h}` shape; `MemberImage`, Task 12, imports the one from `crop.ts` since that's the function signature it calls directly — both are structurally identical so this is not a functional mismatch, but noted here for visibility rather than silently duplicated).
- `MemberThemeName`/`MEMBER_THEMES`/`getMemberThemeHex` — defined once in Task 3, consumed by `MemberImage` (Task 12) and `MediaCarousel`/`MemberProfileTemplate` (Tasks 16-17) by the same names throughout.
- `MemberProfileData` — defined once in Task 10, consumed by `MemberProfileTemplate` (Task 17) and the route's `head()`/loader (Task 18) with matching field names (`member`, `hours`, `specialHours`, `carouselSlides`, `links`, `events`, `categories`, `logoAsset`, `coverAsset`, `logoPublicUrl`, `crossLink`, `headerPrev`, `headerNext`, `ogImageUrl`, `siteOrigin`) used consistently in both places.

One duplication was found and is flagged above (`CropRect`) rather than silently left; it is not a bug since both definitions are structurally identical, but a future cleanup could re-export one from the other.
