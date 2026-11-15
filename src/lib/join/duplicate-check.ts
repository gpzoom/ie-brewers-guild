import type { MemberStatus } from "@/lib/supabase/types";

export type RosterCandidate = {
  id: string;
  business_name: string;
  city: string;
  status: MemberStatus;
  google_place_id: string | null;
  applied_via_join_at: string | null;
};

export type DuplicateResult =
  | { kind: "none" }
  | { kind: "existing"; memberId: string }
  | { kind: "own-application"; memberId: string };

const TRAILING_SUFFIXES = new Set(["llc", "inc", "co", "company", "corp", "corporation", "ltd"]);

/** Lowercase, drop punctuation, "The" prefix and trailing legal/company words. */
export function normalizeBusinessName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (tokens[0] === "the") tokens.shift();
  while (tokens.length > 1 && TRAILING_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/**
 * The distinct cities to check, case-insensitively: the typed one and, when
 * present, Google's. Order kept (typed first); blanks dropped.
 */
export function citiesToCheck(typedCity: string, googleCity: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [typedCity, googleCity ?? ""]) {
    const city = raw.trim();
    const key = city.toLowerCase();
    if (!city || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

export function findDuplicate(
  input: {
    businessName: string;
    city: string;
    /** Google's city for the picked place, when it differs from the typed one. */
    googleCity?: string | null;
    placeId: string | null;
    ownerEmailMatches: (memberId: string) => boolean;
  },
  roster: RosterCandidate[],
): DuplicateResult {
  const name = normalizeBusinessName(input.businessName);
  const cities = new Set(citiesToCheck(input.city, input.googleCity).map((c) => c.toLowerCase()));
  let existing: string | null = null;

  for (const r of roster) {
    if (r.status === "declined") continue;
    const byPlace = !!input.placeId && r.google_place_id === input.placeId;
    const byName =
      name !== "" &&
      normalizeBusinessName(r.business_name) === name &&
      cities.has(r.city.trim().toLowerCase());
    if (!byPlace && !byName) continue;

    if (r.status === "applied" && r.applied_via_join_at && input.ownerEmailMatches(r.id)) {
      return { kind: "own-application", memberId: r.id };
    }
    if (existing === null) existing = r.id;
  }
  return existing ? { kind: "existing", memberId: existing } : { kind: "none" };
}

/**
 * The already-a-member check before the /join preview (spec §3). The
 * preview has no email (so it can never reveal whose application is whose):
 * a match is never "your own". A pending Join application (applied via Join)
 * is skipped here and left to the submit, which knows the email -- so the
 * same person re-submitting still gets a fresh draft link, and anyone else
 * gets "already a member" from the submit instead.
 */
export function isAlreadyMemberForPreview(
  input: { businessName: string; city: string; googleCity?: string | null; placeId: string | null },
  roster: RosterCandidate[],
): boolean {
  const settled = roster.filter((r) => !(r.status === "applied" && r.applied_via_join_at));
  return findDuplicate({ ...input, ownerEmailMatches: () => false }, settled).kind === "existing";
}
