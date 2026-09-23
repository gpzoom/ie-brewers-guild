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
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
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
    await ensureLogoAsset(supabase, memberRow.id, row.member);
    await syncMemberLinks(supabase, memberRow.id, row.member);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
