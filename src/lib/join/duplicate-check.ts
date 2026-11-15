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

export function findDuplicate(
  input: {
    businessName: string;
    city: string;
    placeId: string | null;
    ownerEmailMatches: (memberId: string) => boolean;
  },
  roster: RosterCandidate[],
): DuplicateResult {
  const name = normalizeBusinessName(input.businessName);
  const city = input.city.trim().toLowerCase();
  let existing: string | null = null;

  for (const r of roster) {
    if (r.status === "declined") continue;
    const byPlace = !!input.placeId && r.google_place_id === input.placeId;
    const byName =
      name !== "" &&
      normalizeBusinessName(r.business_name) === name &&
      r.city.trim().toLowerCase() === city;
    if (!byPlace && !byName) continue;

    if (r.status === "applied" && r.applied_via_join_at && input.ownerEmailMatches(r.id)) {
      return { kind: "own-application", memberId: r.id };
    }
    if (existing === null) existing = r.id;
  }
  return existing ? { kind: "existing", memberId: existing } : { kind: "none" };
}
