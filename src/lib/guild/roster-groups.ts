import type { BusinessManagementMode } from "@/lib/supabase/types";
import type { RosterEntry } from "@/lib/guild/roster.server";

/** A multi-location business as the roster shows it (spec 2026-10-15; artboard BZ1). */
export type RosterBusiness = {
  id: string;
  name: string;
  mode: BusinessManagementMode;
  /** A manager is linked (managerEmail can still be null if their account can't be read). */
  hasManager: boolean;
  managerEmail: string | null;
  managerSignedIn: boolean;
};

export type RosterGroup =
  | { kind: "single"; entry: RosterEntry }
  | { kind: "business"; business: RosterBusiness; entries: RosterEntry[] };

/**
 * The roster search: a location's own name or city, or the name of the
 * business it is part of. `query` is already trimmed and lowercased.
 */
export function matchesRosterSearch(
  entry: RosterEntry,
  query: string,
  businessNames: Map<string, string>,
): boolean {
  if (!query) return true;
  const businessName = entry.member.business_id ? businessNames.get(entry.member.business_id) : undefined;
  return (
    entry.member.business_name.toLowerCase().includes(query) ||
    entry.member.city.toLowerCase().includes(query) ||
    Boolean(businessName?.toLowerCase().includes(query))
  );
}

/**
 * Roster rows: a business's matching locations grouped under it (by city),
 * single locations on their own, all ordered by name. `matches` is the
 * search and filters; a business with no matching location is hidden.
 */
export function groupRoster(
  entries: RosterEntry[],
  businesses: RosterBusiness[],
  matches: (entry: RosterEntry) => boolean,
): RosterGroup[] {
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const locations = new Map<string, RosterEntry[]>();
  const groups: RosterGroup[] = [];

  for (const entry of entries) {
    if (!matches(entry)) continue;
    const businessId = entry.member.business_id;
    if (businessId && byId.has(businessId)) {
      const list = locations.get(businessId) ?? [];
      list.push(entry);
      locations.set(businessId, list);
    } else {
      groups.push({ kind: "single", entry });
    }
  }
  for (const [id, list] of locations) {
    groups.push({
      kind: "business",
      business: byId.get(id)!,
      entries: [...list].sort((a, b) => a.member.city.localeCompare(b.member.city)),
    });
  }

  const nameOf = (g: RosterGroup) => (g.kind === "single" ? g.entry.member.business_name : g.business.name);
  return groups.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}
