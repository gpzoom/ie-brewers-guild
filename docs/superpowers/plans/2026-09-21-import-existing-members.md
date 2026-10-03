# Import Existing Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write and run a one-time, idempotent Node script that imports every business currently in `src/data/site.ts` into the finalized Supabase member-profile schema — one `members` row per location, `published`, with logo and social links carried over — so the public directory has real, complete member data from day one instead of empty rows.

**Architecture:** A single standalone script, `scripts/import-existing-members.ts`, run with plain Node (not bundled into the Cloudflare Worker), using the Supabase service-role client to bypass RLS. It flattens `site.ts`'s `members` array (one entry per business, each with 1–4 `locations`) into one row per location, generates a stable slug per row, upserts `members` by that slug, uploads each business's local logo file to the `member-logos` storage bucket once per location-row, and writes `member_links` rows for website/facebook/instagram/untappd. No application code changes — this only writes data into the schema the schema plan already created.

**Tech Stack:** Plain Node (`node --env-file=.env`), `@supabase/supabase-js` (already a project dependency), TypeScript, no new dependencies.

**Spec:** `docs/member-profiles.md` — sections "Migrating the existing members" (the direct source for this plan) and "Data model" (the schema being imported into). `docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md` — the finalized schema, RLS policies, and storage buckets this script writes into; not altered by this plan.

**Prerequisite:** The schema plan above must already be fully applied to the target Supabase project — every table (`members`, `media_assets`, `member_links`, …), the `members_enforce_owner_write_limits` trigger, RLS policies, and the `member-logos`/`member-media` storage buckets must exist before this script's Task 2 runs against real infrastructure.

**Source data snapshot (read in full before writing anything else):** `src/data/site.ts` has 14 businesses in its `members` array. Nine have a single location; three (`Metabolic Brewing Co.`, `Luchador Brewing Co.`, `Coachella Valley Brewing Co.`) have 2 locations; two (`Left Coast Brewing Co.`, `Hangar 24 Brewing Co.`) have 4. That's **23 locations total across 14 businesses** — 23 is the exact `members` row count this import must produce. Every business has a `logo` path, and all 14 files it points to (`allpoints.png`, `carbon.jpg`, `consbeeracy.jpg`, `cvbco.png`, `euryale.png`, `greywolf.png`, `hangar24.png`, `idyllwild.png`, `indio.png`, `leftcoast.gif`, `luchador.jpg`, `mars.jpg`, `metabolic.png`, `norco.jpg`) were confirmed present under `public/members/` before writing this plan. Every business has a non-optional `website` field and an `untappd` field (14 for 14 on both). `facebook` is present on 11 of 14 businesses (Left Coast, Hangar 24, and All Points don't have it), `instagram` on 10 of 14 (Luchador additionally lacks it). Zero of the 14 businesses currently set `tourUrl`. All 23 addresses are in California except one: Hangar 24's "Lake Havasu City" location is in Arizona (`5600 AZ-95 Unit 6, Lake Havasu City, AZ 86404`) — the schema's `state` column defaults to `'CA'`, so this row must not be allowed to fall back to that default. None of the 14 business names contain any allied-supply or mobile/entertainment keyword — every current entry guesses as `member_type = 'producer'`.

## Global Constraints

- `status` = `published` for every imported row, even when nothing beyond name/city/logo is filled in. (Spec, "Migrating the existing members".)
- `member_type` is best-guessed (defaulting to `producer` when no allied/mobile keyword matches) — the Guild admin corrects mis-guesses afterward. (Spec, "Migrating the existing members".)
- `slug` is derived from the business name (plus city, for multi-location members), lowercased, non-alphanumerics collapsed to hyphens, with a numeric suffix on collision. Once issued, a slug must never change on a re-run — this script is idempotent, upserting existing rows by looking them up by slug rather than creating duplicates. (Spec, "Migrating the existing members".)
- `latitude`/`longitude` are carried across from `site.ts` as-is. Never re-geocode. (Spec, "Migrating the existing members".)
- `theme` stays at its schema default (`'amber'`); `hours_confirmed_at` stays `null`, meaning "never asked," not stale. Neither is set explicitly by this script. (Spec, "Migrating the existing members" / "Data model".)
- No `auth.users` or `member_users` row is created by this script. Imported members are unclaimed until a Guild admin invites them later (a different, later plan). (Spec, "Migrating the existing members".)
- One-time scripts in this repo run as plain Node: `node --env-file=.env scripts/<name>.ts`, reading `process.env.VITE_SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY` — same convention as `scripts/seed-guild-admin.ts` and `scripts/geocode-members.ts`. This script is not bundled into the Cloudflare Worker build.
- The service-role client bypasses every RLS policy, but does **not** bypass the `members_enforce_owner_write_limits` trigger defined in the schema plan (Task 3) — that trigger calls `is_guild_admin()`, which is `false` under a service-role connection (no `auth.uid()` session). The upsert payload this script writes must never trip it: never change an existing row's `slug` value, never touch `dues_received_at`/`approved_at`/`approved_by_user_id`/`trail_eligible`, and always write `status = 'published'` (a no-op transition once a row is already published).
- `member_links.kind` allowed values, per the schema plan's `member_links` table: `website`, `instagram`, `facebook`, `tiktok`, `taplist`, `menu`, `press_kit`, `catalog`, `other`. There is no dedicated `untappd` kind, so Untappd links use `kind = 'other'` with `label = 'Untappd'`.
- `@supabase/supabase-js` is already a dependency (added by the schema plan's Task 11, `scripts/seed-guild-admin.ts`). This plan does not modify `package.json`.

## Decisions made while filling gaps the spec left open

These aren't spec requirements — they're necessary technical completions the spec's "Migrating the existing members" section didn't spell out, or real properties of the actual `site.ts` data discovered while writing this plan. Flagging them here so they're visible, not silently baked into the script:

1. **Multi-location slugs are `<business-slug>-<city-slug>`**, e.g. `left-coast-brewing-co-irvine`, rather than a bare numeric suffix like `left-coast-brewing-co-3` — it reads naturally in a URL and in admin UI. The spec's own numeric-suffix-on-collision rule is kept as `uniqueSlug()`'s fallback for true collisions, but nothing in today's 23 rows actually triggers it: all 23 generated slugs (listed in full in Task 1) are already distinct from each other before any suffixing.
2. **Shared logo/website/social links across one business's location-rows are duplicated per row, not shared via a single cross-referenced asset or link row.** `media_assets.member_id` and `member_links.member_id` are both single, non-nullable foreign keys to exactly one `members` row in the finalized schema — there is no data-model path to share a child row across several `members` rows without altering that schema, which is out of scope for this plan. The cost is a handful of duplicate small logo files per multi-location business (at most 4, for Left Coast and Hangar 24) — negligible storage, and a straightforward follow-up (a `logo_asset_id` shared across sibling rows of the same business) if it's ever worth building.
3. **`tourUrl` is dropped, not migrated.** It exists purely to gate the current Members-map "Take A Tour" button, a feature the spec explicitly keeps out of scope to change, and no `member_links.kind` in the finalized schema matches its "self-guided tour link" semantics — stashing it under `kind = 'other'` would be inventing meaning the schema doesn't already carry for a feature nobody asked to bring forward. It's also moot for this run: zero of the 14 current `site.ts` entries set `tourUrl`. The script still checks for it and logs a warning if a future entry sets one, so it can't silently vanish without a trace.
4. **`state` and `postal_code` are parsed out of each location's `address` string** (`"<street>, <city>, <ST> <zip>"`) with a regex, rather than trusting the schema's `state` column default of `'CA'`. Hangar 24's Lake Havasu City location is genuinely in Arizona — defaulting to `'CA'` would have silently mis-tagged that one row. `members.city` still comes from `Location.city` (the curated display name, e.g. `"Idyllwild"`), never from the address string's embedded city segment (which for that same entry reads `"Idyllwild-Pine Cove"`) — the address's city segment is only used as a throwaway anchor for the regex, never persisted.
5. **`media_assets.width`/`.height` are left `null`.** Both columns are nullable. Determining real pixel dimensions of a PNG/JPEG/GIF needs an image-parsing dependency this project doesn't have, and isn't worth adding for a one-time import — a member's own re-upload through the future admin media screen will set them correctly.
6. **Two known data-quality issues in the source data are carried through unedited**, per "don't re-geocode": Left Coast Brewing Co.'s "John Wayne Airport" location has no real street address (the location name stands in for one — `address: "John Wayne Airport, Santa Ana, CA 92707"`), and Hangar 24's "Orange County" location carries a `// TODO: user to provide verified Orange County address` comment directly in `src/data/site.ts`, flagging that Hangar 24's own admin should double-check that row once they can sign in. Both import cleanly with today's address data; flagging here so nobody mistakes them for import bugs later.
7. **The "logo file missing" branch in `ensureLogoAsset` is defensive code for a case this run doesn't hit.** All 14 businesses' local logo files were confirmed present under `public/members/` before this plan was written. The check-and-log (rather than crash) behavior is included anyway, per the request, so a future business added to `site.ts` with a typo'd `logo` path logs a clear warning and gets `logo_asset_id = null` instead of aborting the whole import.
8. **`member_type` guessing runs a real keyword check** (allied-supply and mobile/entertainment keyword lists) rather than hardcoding `producer` for every row, even though all 14 current businesses guess as `producer` today (verified by running the dry-run logic in Task 1 against the real file — zero keyword matches). This keeps the guess logic honest for whenever a new business is added to `site.ts` ahead of a future re-run.
9. **The upsert is idempotent by construction, not by an explicit "already imported" flag.** `slug` is a pure function of business name + city (Decision 1), computed identically every run, so looking a `members` row up by slug and updating it in place — rather than tracking any import-run bookkeeping elsewhere — is what keeps re-running safe. This assumes the `members` table has no unrelated rows with a colliding slug before this script's first run, which holds for a freshly migrated, otherwise-empty project per the schema plan.

---

### Task 1: Slug/address/member-type logic and a dry-run inspector

**Files:**
- Create: `scripts/import-existing-members.ts`

**Interfaces:**
- Consumes: `members`, `type Member`, `type Location` exported from `src/data/site.ts`.
- Produces: `slugify(input: string): string`, `uniqueSlug(base: string, used: Set<string>): string`, `parseAddress(fullAddress: string): { street: string; state: string; postalCode: string | null }`, `guessMemberType(businessName: string): "producer" | "mobile" | "allied"`, `type ImportRow`, `buildImportRows(): ImportRow[]`, `logImportRows(rows: ImportRow[]): void`. These all live in this one file (extended in place by later tasks) — nothing here is imported from elsewhere.

- [ ] **Step 1: Write the script's data-transform core and dry-run mode**

Create `scripts/import-existing-members.ts`:

```ts
/**
 * One-time import: migrate existing members from src/data/site.ts into the
 * Supabase member-profile schema (see
 * docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md).
 *
 * Multi-location members (e.g. "Left Coast Brewing Co.", 4 locations) get
 * one `members` row PER location, each with its own slug and its own copy
 * of the shared logo/website/social links -- the schema's member_links and
 * media_assets tables have a single member_id FK, so there is no way to
 * share a child row across multiple `members` rows without a schema
 * change. See "Decisions made while filling gaps the spec left open" in
 * docs/superpowers/plans/2026-09-21-import-existing-members.md for the
 * full reasoning.
 *
 * Run:
 *   node --env-file=.env scripts/import-existing-members.ts --dry-run   # inspect only, no DB/network calls
 *   node --env-file=.env scripts/import-existing-members.ts             # actually import (idempotent, safe to re-run)
 */
import { members, type Member, type Location } from "../src/data/site.ts";

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns `base`, or `base-2`, `base-3`, ... on collision within this run.
 * `used` is mutated. Callers process rows in a fixed order (the order
 * `members` appears in site.ts, then location order within each member),
 * so the same input list always produces the same output slugs across
 * runs -- that determinism is what keeps re-running this script from ever
 * reassigning a slug (see upsertMember in a later task, which looks rows
 * up by slug).
 */
function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// Address parsing
// ---------------------------------------------------------------------------

type ParsedAddress = {
  street: string;
  state: string;
  postalCode: string | null;
};

// Every address in site.ts is "<street>, <city>, <ST> <zip>". We only pull
// the street portion and the state/zip out of this string -- `city` comes
// from the Location.city field instead (the curated display name, e.g.
// "Idyllwild" rather than the address's "Idyllwild-Pine Cove"), which is
// what members.city should hold.
function parseAddress(fullAddress: string): ParsedAddress {
  const match = fullAddress.match(
    /^(.*),\s*[^,]+,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/,
  );
  if (!match) {
    // Defensive fallback -- every current entry matches this shape, but
    // don't crash the whole import over one malformed future entry.
    console.warn(
      `  WARNING: could not parse state/zip out of address "${fullAddress}" -- defaulting state to CA, postal_code to null`,
    );
    return { street: fullAddress, state: "CA", postalCode: null };
  }
  const [, street, state, postalCode] = match;
  return { street: street.trim(), state, postalCode };
}

// ---------------------------------------------------------------------------
// member_type guessing
// ---------------------------------------------------------------------------

const ALLIED_KEYWORDS = [
  "supply",
  "supplies",
  "ingredients",
  "equipment",
  "distributing",
  "distributors",
  "distribution",
  "malting",
  "malt",
  "hops",
  "packaging",
  "labels",
  "insurance",
  "consulting",
];
const MOBILE_KEYWORDS = [
  "food truck",
  "catering",
  "entertainment",
  "mobile",
  "cart",
  "trailer",
  "pop-up",
  "popup",
];

function guessMemberType(businessName: string): "producer" | "mobile" | "allied" {
  const name = businessName.toLowerCase();
  if (ALLIED_KEYWORDS.some((kw) => name.includes(kw))) return "allied";
  if (MOBILE_KEYWORDS.some((kw) => name.includes(kw))) return "mobile";
  return "producer";
}

// ---------------------------------------------------------------------------
// Flattening site.ts into one row per location
// ---------------------------------------------------------------------------

type ImportRow = {
  member: Member;
  location: Location;
  slug: string;
  memberType: "producer" | "mobile" | "allied";
  street: string;
  state: string;
  postalCode: string | null;
};

function buildImportRows(): ImportRow[] {
  const usedSlugs = new Set<string>();
  const rows: ImportRow[] = [];

  for (const member of members) {
    const memberType = guessMemberType(member.name);
    const baseSlug = slugify(member.name);
    const multiLocation = member.locations.length > 1;

    for (const location of member.locations) {
      const slugBase = multiLocation
        ? `${baseSlug}-${slugify(location.city)}`
        : baseSlug;
      const slug = uniqueSlug(slugBase, usedSlugs);
      const { street, state, postalCode } = parseAddress(location.address);

      rows.push({ member, location, slug, memberType, street, state, postalCode });
    }
  }

  return rows;
}

function logImportRows(rows: ImportRow[]): void {
  console.log(`${rows.length} member rows to import (from ${members.length} businesses):\n`);
  for (const row of rows) {
    console.log(
      `  [${row.slug}] ${row.member.name} -- ${row.location.city}, ${row.state} ` +
        `(${row.location.lat}, ${row.location.lng}) type=${row.memberType} ` +
        `street="${row.street}" postal=${row.postalCode ?? "?"} logo=${row.member.logo ?? "(none)"}`,
    );
  }
  const nonProducer = rows.filter((r) => r.memberType !== "producer");
  if (nonProducer.length > 0) {
    console.log(`\n${nonProducer.length} row(s) guessed as non-producer -- review these:`);
    for (const r of nonProducer) console.log(`  - ${r.slug}: guessed ${r.memberType}`);
  } else {
    console.log("\nAll rows guessed as member_type = producer (no allied/mobile keyword matches).");
  }
}

const isDryRun = process.argv.includes("--dry-run");

if (isDryRun) {
  logImportRows(buildImportRows());
  process.exit(0);
}

// The real import (Supabase client, upsert, logo upload, links) is added in
// later tasks of docs/superpowers/plans/2026-09-21-import-existing-members.md.
```

- [ ] **Step 2: Run the dry run against the real data**

```bash
node --env-file=.env scripts/import-existing-members.ts --dry-run
```

(This works even without `.env` filled in — the dry-run branch exits before any Supabase code is reached.)

Expected: first line `23 member rows to import (from 14 businesses):`, followed by 23 lines, one per row, and ending with `All rows guessed as member_type = producer (no allied/mobile keyword matches).`

The 23 slugs, in order, must be exactly:

```
idyllwild-brewpub
euryale-brewing-co
metabolic-brewing-co-ontario
metabolic-brewing-co-chino
luchador-brewing-co-chino-hills
luchador-brewing-co-cathedral-city
mars-brewing-co
carbon-nation-brewing-co
left-coast-brewing-co-ontario
left-coast-brewing-co-irvine
left-coast-brewing-co-san-clemente
left-coast-brewing-co-john-wayne-airport
hangar-24-brewing-co-redlands
hangar-24-brewing-co-riverside
hangar-24-brewing-co-lake-havasu-city
hangar-24-brewing-co-orange-county
all-points-brewing-co
indio-brewing-co
coachella-valley-brewing-co-thousand-palms
coachella-valley-brewing-co-palm-springs
consbeeracy-brewing
greywolf-brewing-co
norco-brewing-co
```

- [ ] **Step 3: Spot-check the one non-California row and the two flagged data-quality rows**

In the printed output, confirm:
- `hangar-24-brewing-co-lake-havasu-city` prints `type=producer` and, since state is parsed from the address rather than defaulted, its line's implicit state (visible if you temporarily log `row.state`, or check in Task 2's `members` row afterward) resolves to `AZ`, not `CA`.
- `left-coast-brewing-co-john-wayne-airport` and `hangar-24-brewing-co-orange-county` both appear in the list — these are the two known data-quality entries called out in "Decisions made while filling gaps the spec left open" above; they're expected to import as-is, not a bug.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-existing-members.ts
git commit -m "feat: add slug/address/member_type transform + dry-run mode for member import" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Supabase client and idempotent `members` upsert

**Files:**
- Modify: `scripts/import-existing-members.ts`

**Interfaces:**
- Consumes: `buildImportRows()`, `logImportRows()`, `type ImportRow` from Task 1.
- Produces: `requireSupabaseCredentials(): { url: string; key: string }`, `type MemberRowResult = { id: string; slug: string }`, `upsertMember(supabase: SupabaseClient, row: ImportRow): Promise<MemberRowResult>`, `main(): Promise<void>`.

- [ ] **Step 1: Add the Supabase client, the upsert function, and `main()`**

Replace the file's final two lines (the `// The real import ...` comment) with:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireSupabaseCredentials(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill both in.",
    );
    process.exit(1);
  }
  return { url, key };
}

type MemberRowResult = {
  id: string;
  slug: string;
};

/**
 * Upsert one `members` row by slug. Slug is a pure function of business
 * name + city (see buildImportRows above) and is computed identically on
 * every run, so looking a row up by its slug and updating that row in
 * place -- rather than tracking ids anywhere else -- is what keeps this
 * script idempotent without ever changing the slug column's value (the
 * members_enforce_owner_write_limits trigger from the schema plan blocks
 * that for non-guild-admin writes, which this service-role script counts
 * as, since it has no auth.uid() session).
 */
async function upsertMember(supabase: SupabaseClient, row: ImportRow): Promise<MemberRowResult> {
  const { data: existing, error: selectError } = await supabase
    .from("members")
    .select("id")
    .eq("slug", row.slug)
    .maybeSingle();
  if (selectError) throw selectError;

  const payload = {
    slug: row.slug,
    member_type: row.memberType,
    business_name: row.member.name,
    city: row.location.city,
    state: row.state,
    street_address: row.street,
    postal_code: row.postalCode,
    latitude: row.location.lat,
    longitude: row.location.lng,
    status: "published",
  };

  if (existing) {
    const { error: updateError } = await supabase.from("members").update(payload).eq("id", existing.id);
    if (updateError) throw updateError;
    return { id: existing.id as string, slug: row.slug };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("members")
    .insert(payload)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return { id: inserted.id as string, slug: row.slug };
}

async function main(): Promise<void> {
  const { url, key } = requireSupabaseCredentials();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = buildImportRows();
  logImportRows(rows);

  console.log(`\nImporting ${rows.length} rows into Supabase...\n`);

  for (const row of rows) {
    const memberRow = await upsertMember(supabase, row);
    console.log(`  [${memberRow.slug}] members row ready (id=${memberRow.id})`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

(The `if (isDryRun) { ...; process.exit(0); }` block from Task 1 stays exactly where it is, directly above this. It still exits before `main()` is ever called when `--dry-run` is passed.)

- [ ] **Step 2: Fill in real Supabase credentials, if not already done**

`.env` needs `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — same values used by `scripts/seed-guild-admin.ts`. Skip this step if `.env` is already configured from that earlier plan.

- [ ] **Step 3: Run the import for real against the already-migrated Supabase project**

```bash
node --env-file=.env scripts/import-existing-members.ts
```

Expected: the same 23-line dry-run-style log, followed by 23 lines like `  [idyllwild-brewpub] members row ready (id=<uuid>)`, ending in `Done.`

- [ ] **Step 4: Verify row count, status, and slug uniqueness**

```bash
npx supabase db execute --sql "
select count(*) as total,
       count(*) filter (where status = 'published') as published,
       count(distinct slug) as distinct_slugs
from members;
"
```

Expected: `total = 23`, `published = 23`, `distinct_slugs = 23`.

- [ ] **Step 5: Verify the one Arizona row parsed correctly**

```bash
npx supabase db execute --sql "select slug, city, state, street_address, postal_code from members where slug = 'hangar-24-brewing-co-lake-havasu-city';"
```

Expected: `city = Lake Havasu City`, `state = AZ`, `street_address = 5600 AZ-95 Unit 6`, `postal_code = 86404`. This confirms the address-parsing decision (Decision 4) actually worked against the one row that would have silently defaulted to `CA` otherwise.

- [ ] **Step 6: Re-run to confirm idempotency (no duplicate rows, no slug changes)**

```bash
node --env-file=.env scripts/import-existing-members.ts
npx supabase db execute --sql "select count(*) from members;"
```

Expected: the script runs again with no errors, and the count is still exactly `23` — the second run updated the same 23 rows in place rather than inserting new ones.

- [ ] **Step 7: Commit**

```bash
git add scripts/import-existing-members.ts
git commit -m "feat: add idempotent members upsert to the member import script" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Logo upload, `media_assets`, and `logo_asset_id`

**Files:**
- Modify: `scripts/import-existing-members.ts`

**Interfaces:**
- Consumes: `upsertMember()`, `main()` from Task 2.
- Produces: `ensureLogoAsset(supabase: SupabaseClient, memberId: string, member: Member): Promise<void>`.

- [ ] **Step 1: Add the Node imports this step needs**

Add to the top of the file, alongside the existing `import { members, ... }` line:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
```

- [ ] **Step 2: Add `ensureLogoAsset`**

Insert this above `async function main()`:

```ts
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/**
 * Uploads the member's local logo file (from public/members/...) to the
 * member-logos bucket and creates its media_assets row, then points
 * members.logo_asset_id at it. Skipped entirely if the row already has a
 * logo_asset_id (idempotent) or if the local file is missing (logged, not
 * fatal -- an import shouldn't abort over one bad path).
 *
 * Every members row gets its OWN media_assets row and its OWN storage
 * object, even when several rows share one business's logo file --
 * media_assets.member_id and the member-logos storage path convention
 * ({member_id}/...) are both scoped to a single members row in the
 * finalized schema. See "Decisions made while filling gaps the spec left
 * open" (Decision 2) in the plan this implements.
 */
async function ensureLogoAsset(
  supabase: SupabaseClient,
  memberId: string,
  member: Member,
): Promise<void> {
  if (!member.logo) return;

  const { data: memberRow, error: fetchError } = await supabase
    .from("members")
    .select("logo_asset_id")
    .eq("id", memberId)
    .single();
  if (fetchError) throw fetchError;
  if (memberRow.logo_asset_id) {
    console.log(`    logo already set (asset ${memberRow.logo_asset_id}), skipping upload`);
    return;
  }

  const localPath = resolve(process.cwd(), "public", member.logo.replace(/^\//, ""));
  if (!existsSync(localPath)) {
    console.warn(`    WARNING: logo file not found at ${localPath} -- leaving logo_asset_id null for ${member.name}`);
    return;
  }

  const ext = extname(localPath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    console.warn(`    WARNING: unrecognized logo file extension "${ext}" for ${member.name} -- leaving logo_asset_id null`);
    return;
  }

  const fileBuffer = readFileSync(localPath);
  const storagePath = `${memberId}/logo${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("member-logos")
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .insert({
      member_id: memberId,
      storage_path: storagePath,
      kind: "image",
      mime_type: mimeType,
      byte_size: fileBuffer.byteLength,
      original_filename: basename(localPath),
      source: "member_upload",
      review_status: "approved",
    })
    .select("id")
    .single();
  if (assetError) throw assetError;

  const { error: linkError } = await supabase
    .from("members")
    .update({ logo_asset_id: asset.id })
    .eq("id", memberId);
  if (linkError) throw linkError;

  console.log(`    uploaded logo -> ${storagePath} (asset ${asset.id})`);
}
```

- [ ] **Step 3: Wire it into `main()`'s loop**

In `main()`, change:

```ts
  for (const row of rows) {
    const memberRow = await upsertMember(supabase, row);
    console.log(`  [${memberRow.slug}] members row ready (id=${memberRow.id})`);
  }
```

to:

```ts
  for (const row of rows) {
    const memberRow = await upsertMember(supabase, row);
    console.log(`  [${memberRow.slug}] members row ready (id=${memberRow.id})`);
    await ensureLogoAsset(supabase, memberRow.id, row.member);
  }
```

- [ ] **Step 4: Run the import**

```bash
node --env-file=.env scripts/import-existing-members.ts
```

Expected: each of the 23 lines is now followed by an `    uploaded logo -> <memberId>/logo.<ext> (asset <uuid>)` line (all 23 businesses have a confirmed-present local logo file, so no "WARNING: logo file not found" lines are expected on this run).

- [ ] **Step 5: Verify every row has a logo asset**

```bash
npx supabase db execute --sql "
select count(*) filter (where logo_asset_id is not null) as with_logo,
       count(*) as total
from members;
"
```

Expected: `with_logo = 23`, `total = 23`.

```bash
npx supabase db execute --sql "select count(*) from media_assets where kind = 'image' and source = 'member_upload';"
```

Expected: `23`.

```bash
npx supabase db execute --sql "select count(*) from storage.objects where bucket_id = 'member-logos';"
```

Expected: `23`.

- [ ] **Step 6: Re-run to confirm the logo step is idempotent (no duplicate assets)**

```bash
node --env-file=.env scripts/import-existing-members.ts
```

Expected: each row now logs `    logo already set (asset <uuid>), skipping upload` instead of re-uploading.

```bash
npx supabase db execute --sql "select count(*) from media_assets where kind = 'image' and source = 'member_upload';"
```

Expected: still `23`, not `46` — confirms `ensureLogoAsset`'s already-set check actually prevents duplicate uploads on a re-run.

- [ ] **Step 7: Commit**

```bash
git add scripts/import-existing-members.ts
git commit -m "feat: upload member logos and create media_assets rows in the import script" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `member_links` (website, facebook, instagram, Untappd)

**Files:**
- Modify: `scripts/import-existing-members.ts`

**Interfaces:**
- Consumes: `ensureLogoAsset()`, `main()` from Task 3.
- Produces: `buildLinkInserts(memberId: string, member: Member): LinkInsert[]`, `syncMemberLinks(supabase: SupabaseClient, memberId: string, member: Member): Promise<void>`, `type LinkInsert`.

- [ ] **Step 1: Add the link-building and sync functions**

Insert this above `async function main()`, after `ensureLogoAsset`:

```ts
const MANAGED_LINK_KINDS = ["website", "facebook", "instagram", "other"];

type LinkInsert = {
  member_id: string;
  kind: "website" | "facebook" | "instagram" | "other";
  label: string | null;
  url: string;
  sort_order: number;
};

function buildLinkInserts(memberId: string, member: Member): LinkInsert[] {
  const links: LinkInsert[] = [];
  let sortOrder = 0;

  if (member.website) {
    links.push({ member_id: memberId, kind: "website", label: null, url: member.website, sort_order: sortOrder++ });
  }
  if (member.facebook) {
    links.push({ member_id: memberId, kind: "facebook", label: null, url: member.facebook, sort_order: sortOrder++ });
  }
  if (member.instagram) {
    links.push({ member_id: memberId, kind: "instagram", label: null, url: member.instagram, sort_order: sortOrder++ });
  }
  if (member.untappd) {
    // No dedicated `untappd` kind in the member_links.kind check constraint
    // -- use 'other' with a label, per the schema plan's allowed values.
    links.push({ member_id: memberId, kind: "other", label: "Untappd", url: member.untappd, sort_order: sortOrder++ });
  }
  if (member.tourUrl) {
    // Dropped, not migrated -- see "Decisions made while filling gaps the
    // spec left open" (Decision 3) in the plan this implements. Logged so
    // a future tourUrl addition to site.ts doesn't silently vanish.
    console.warn(`    NOTE: ${member.name} has a tourUrl (${member.tourUrl}) -- not imported, no matching member_links kind`);
  }

  return links;
}

/**
 * Replaces this member's website/facebook/instagram/other links with the
 * current set from site.ts. Delete-then-insert, scoped to member_id and to
 * the kinds this script manages -- safe because imported members are
 * unclaimed (no member_users row yet, per the spec), so nothing else has
 * written to member_links for these rows.
 */
async function syncMemberLinks(
  supabase: SupabaseClient,
  memberId: string,
  member: Member,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("member_links")
    .delete()
    .eq("member_id", memberId)
    .in("kind", MANAGED_LINK_KINDS);
  if (deleteError) throw deleteError;

  const links = buildLinkInserts(memberId, member);
  if (links.length === 0) return;

  const { error: insertError } = await supabase.from("member_links").insert(links);
  if (insertError) throw insertError;

  console.log(`    synced ${links.length} link(s)`);
}
```

- [ ] **Step 2: Wire it into `main()`'s loop**

Change:

```ts
  for (const row of rows) {
    const memberRow = await upsertMember(supabase, row);
    console.log(`  [${memberRow.slug}] members row ready (id=${memberRow.id})`);
    await ensureLogoAsset(supabase, memberRow.id, row.member);
  }
```

to:

```ts
  for (const row of rows) {
    const memberRow = await upsertMember(supabase, row);
    console.log(`  [${memberRow.slug}] members row ready (id=${memberRow.id})`);
    await ensureLogoAsset(supabase, memberRow.id, row.member);
    await syncMemberLinks(supabase, memberRow.id, row.member);
  }
```

- [ ] **Step 3: Run the import**

```bash
node --env-file=.env scripts/import-existing-members.ts
```

Expected: each row now also logs `    synced N link(s)`, and no `NOTE: ... has a tourUrl` lines appear (none of the 14 businesses currently set one).

- [ ] **Step 4: Verify the exact expected link counts**

Computed directly from the real `site.ts` data: every business has a `website` and an `untappd` (14/14 each, across all 23 rows → 23 website + 23 other), 11 of 14 businesses have `facebook` (covering 14 of the 23 rows, since Metabolic, Luchador, and Coachella Valley each contribute 2 rows), and 10 of 14 have `instagram` (covering 12 of the 23 rows, since Luchador — which has facebook but not instagram — is the one 2-location business excluded). Total: 23 + 23 + 14 + 12 = **72**.

```bash
npx supabase db execute --sql "select count(*) from member_links;"
```

Expected: `72`.

```bash
npx supabase db execute --sql "select kind, count(*) from member_links group by kind order by kind;"
```

Expected:
```
   kind    | count
-----------+-------
 facebook  |    14
 instagram |    12
 other     |    23
 website   |    23
```

- [ ] **Step 5: Re-run to confirm the link sync is idempotent (no duplicate links)**

```bash
node --env-file=.env scripts/import-existing-members.ts
npx supabase db execute --sql "select count(*) from member_links;"
```

Expected: still `72`, not `144` — the delete-then-insert pattern replaced each member's links rather than appending a second copy.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-existing-members.ts
git commit -m "feat: sync website/facebook/instagram/untappd links in the import script" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Full-import verification

This task has no new code — it's a final pass confirming the complete import (all four tasks' work combined) holds up against the real, already-migrated Supabase project. Run this after Task 4's commit, with the script already having been run at least once in that task.

**Files:** none created or modified.

- [ ] **Step 1: Re-run the finished script one more time, as the actual "production" import run**

```bash
node --env-file=.env scripts/import-existing-members.ts
```

Expected: 23 rows, each logging `members row ready`, `logo already set (asset ...), skipping upload` (or `uploaded logo -> ...` if this is genuinely the first run in this environment), and `synced N link(s)`, ending in `Done.` with no errors.

- [ ] **Step 2: Confirm row count, status, and slug uniqueness**

```bash
npx supabase db execute --sql "
select count(*) as total,
       count(*) filter (where status <> 'published') as not_published,
       count(*) - count(distinct slug) as duplicate_slugs
from members;
"
```

Expected: `total = 23`, `not_published = 0`, `duplicate_slugs = 0`.

- [ ] **Step 3: Confirm every row has a logo asset that actually exists and is referenced correctly**

```bash
npx supabase db execute --sql "
select count(*) as members_with_logo,
       count(*) filter (where ma.id is null) as dangling_references
from members m
left join media_assets ma on ma.id = m.logo_asset_id
where m.logo_asset_id is not null;
"
```

Expected: `members_with_logo = 23`, `dangling_references = 0`.

- [ ] **Step 4: Confirm the member_links totals match the hand-computed expectation**

```bash
npx supabase db execute --sql "select kind, count(*) from member_links group by kind order by kind;"
```

Expected exactly:
```
   kind    | count
-----------+-------
 facebook  |    14
 instagram |    12
 other     |    23
 website   |    23
```

- [ ] **Step 5: Confirm no `member_users` rows exist (imported members are unclaimed)**

```bash
npx supabase db execute --sql "select count(*) from member_users;"
```

Expected: `0`. If this is nonzero, something outside this script (or a bug in it) created ownership rows that shouldn't exist yet.

- [ ] **Step 6: Spot-check three specific rows end to end**

```bash
npx supabase db execute --sql "
select m.slug, m.business_name, m.city, m.state, m.status, m.member_type,
       ma.storage_path,
       (select count(*) from member_links ml where ml.member_id = m.id) as link_count
from members m
left join media_assets ma on ma.id = m.logo_asset_id
where m.slug in ('idyllwild-brewpub', 'left-coast-brewing-co-john-wayne-airport', 'hangar-24-brewing-co-lake-havasu-city')
order by m.slug;
"
```

Expected: three rows, all `status = published`, all `member_type = producer`, each with a non-null `storage_path` under `member-logos`, and `link_count` of `4` for `idyllwild-brewpub` (website, facebook, instagram, untappd), `2` for `left-coast-brewing-co-john-wayne-airport` (website, untappd only — Left Coast has no facebook/instagram), and `2` for `hangar-24-brewing-co-lake-havasu-city` (same reason).

No commit for this task — it's a verification pass, not a code change. If any step doesn't match its expected output, stop and fix the script (and re-run the affected earlier task's steps) before considering this plan done.
