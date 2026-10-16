import type { BusinessManagementMode } from "@/lib/supabase/types";
import type { RosterEntry } from "@/lib/guild/roster.server";

/** A multi-location business as the roster shows it (spec 2026-10-15; artboard BZ1). */
export type RosterBusiness = {
  id: string;
  name: string;
  mode: BusinessManagementMode;
  managerEmail: string | null;
  managerSignedIn: boolean;
};

export type RosterGroup =
  | { kind: "single"; entry: RosterEntry }
  | { kind: "business"; business: RosterBusiness; entries: RosterEntry[] };

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
