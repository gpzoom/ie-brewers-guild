import type { SupabaseClient } from "@supabase/supabase-js";

/** Drops the hidden rows, keeping the order of the rest. */
export function withoutHidden<T extends { id: string }>(rows: T[], hiddenIds: Set<string>): T[] {
  return hiddenIds.size === 0 ? rows : rows.filter((row) => !hiddenIds.has(row.id));
}

/**
 * Which of these events have an open closed-day conflict and must stay off
 * every public view. A failed read hides nothing: it must not blank a page.
 */
export async function loadHiddenEventIds(client: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  try {
    const { data, error } = await client.rpc("open_conflict_event_ids", { p_event_ids: unique });
    if (error) {
      console.error("open_conflict_event_ids failed", error);
      return new Set();
    }
    const out = new Set<string>();
    for (const item of (data ?? []) as Array<string | { open_conflict_event_ids: string }>) {
      out.add(typeof item === "string" ? item : item.open_conflict_event_ids);
    }
    return out;
  } catch (err) {
    console.error("open_conflict_event_ids failed", err);
    return new Set();
  }
}
