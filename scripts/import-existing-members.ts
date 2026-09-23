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
