import type { SupabaseClient } from "@supabase/supabase-js";
import type { RosterCandidate } from "./duplicate-check";

const COLUMNS = "id, business_name, city, status, google_place_id, applied_via_join_at";

/** Escape LIKE wildcards so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Members in any of the given cities (case-insensitive; callers pass the
 * typed city and, when present, Google's -- see citiesToCheck) plus any
 * member with the same Google place id. Simple queries merged by id, so no
 * hand-built .or() string.
 */
export async function loadRosterCandidates(
  serviceClient: SupabaseClient,
  cities: string[],
  placeId: string | null,
): Promise<RosterCandidate[]> {
  const byId = new Map<string, RosterCandidate>();

  for (const city of cities) {
    const trimmed = city.trim();
    if (!trimmed) continue;
    const { data, error } = await serviceClient
      .from("members")
      .select(COLUMNS)
      .ilike("city", escapeLike(trimmed));
    if (error) throw new Error(`Could not load roster by city: ${error.message}`);
    for (const r of (data ?? []) as RosterCandidate[]) byId.set(r.id, r);
  }

  if (placeId) {
    const { data, error } = await serviceClient
      .from("members")
      .select(COLUMNS)
      .eq("google_place_id", placeId);
    if (error) throw new Error(`Could not load roster by place id: ${error.message}`);
    for (const r of (data ?? []) as RosterCandidate[]) byId.set(r.id, r);
  }

  return [...byId.values()];
}
