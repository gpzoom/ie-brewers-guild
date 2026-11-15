import type { SupabaseClient } from "@supabase/supabase-js";
import type { RosterCandidate } from "./duplicate-check";

const COLUMNS = "id, business_name, city, status, google_place_id, applied_via_join_at";

/** Escape LIKE wildcards so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Members in the same city (case-insensitive) plus any member with the same
 * Google place id. Two simple queries merged by id, so no hand-built .or() string.
 */
export async function loadRosterCandidates(
  serviceClient: SupabaseClient,
  city: string,
  placeId: string | null,
): Promise<RosterCandidate[]> {
  const byId = new Map<string, RosterCandidate>();

  const trimmed = city.trim();
  if (trimmed) {
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
