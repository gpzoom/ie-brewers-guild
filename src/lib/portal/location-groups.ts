import type { PortalRole } from "@/lib/portal/portal-destination";
import type { PortalMembership } from "@/lib/portal/portal-access";

/**
 * Multi-location businesses in the portal (spec 2026-10-15, "Location
 * switcher"; artboard BZ2). Pure: portal-session.server.ts and
 * location-switcher.server.ts pass in the user's memberships.
 */

export type LocationStatus = "live" | "setting_up" | "not_started";

export type ChooserEntry =
  | { kind: "member"; memberId: string; label: string; role: PortalRole }
  | { kind: "business"; businessId: string; label: string; locationCount: number; openMemberId: string };

export type LocationSwitcherData = {
  businessName: string;
  currentMemberId: string;
  locations: Array<{ memberId: string; city: string; status: LocationStatus }>;
};

export function locationStatus(
  m: Pick<PortalMembership, "status" | "typeConfirmedAt" | "setupCompletedAt">,
): LocationStatus {
  if (m.status === "published") return "live";
  if (m.typeConfirmedAt || m.setupCompletedAt) return "setting_up";
  return "not_started";
}

const byCity = (a: PortalMembership, b: PortalMembership) => a.city.localeCompare(b.city);

function oneManagerGroups(memberships: PortalMembership[]): Map<string, PortalMembership[]> {
  const groups = new Map<string, PortalMembership[]>();
  for (const m of memberships) {
    if (!m.businessId || m.businessMode !== "one_manager") continue;
    const list = groups.get(m.businessId) ?? [];
    list.push(m);
    groups.set(m.businessId, list);
  }
  return groups;
}

/**
 * "Choose a business": a one-manager business the user is linked to more
 * than once is one entry (opening its first location by city); every other
 * link is its own entry, labeled "Name · City" when another entry would
 * otherwise read the same.
 */
export function chooserEntries(memberships: PortalMembership[]): ChooserEntry[] {
  const groups = oneManagerGroups(memberships);
  const entries: ChooserEntry[] = [];
  const seenBusinesses = new Set<string>();
  const singles: PortalMembership[] = [];

  for (const m of memberships) {
    const group = m.businessId ? groups.get(m.businessId) : undefined;
    if (group && group.length > 1) {
      if (seenBusinesses.has(m.businessId!)) continue;
      seenBusinesses.add(m.businessId!);
      const sorted = [...group].sort(byCity);
      entries.push({
        kind: "business",
        businessId: m.businessId!,
        label: m.businessDisplayName ?? m.businessName,
        locationCount: group.length,
        openMemberId: sorted[0].memberId,
      });
    } else {
      singles.push(m);
    }
  }

  const nameCounts = new Map<string, number>();
  for (const m of singles) nameCounts.set(m.businessName, (nameCounts.get(m.businessName) ?? 0) + 1);
  for (const m of [...singles].sort((a, b) => a.businessName.localeCompare(b.businessName) || byCity(a, b))) {
    const label = (nameCounts.get(m.businessName) ?? 0) > 1 ? `${m.businessName} · ${m.city}` : m.businessName;
    entries.push({ kind: "member", memberId: m.memberId, label, role: m.role });
  }
  return entries;
}

/** The sidebar menu: only for a one-manager business with two or more of the user's links. */
export function locationSwitcherFor(
  memberships: PortalMembership[],
  currentMemberId: string,
): LocationSwitcherData | null {
  const current = memberships.find((m) => m.memberId === currentMemberId);
  if (!current?.businessId || current.businessMode !== "one_manager") return null;
  const group = memberships.filter((m) => m.businessId === current.businessId);
  if (group.length < 2) return null;
  return {
    businessName: current.businessDisplayName ?? current.businessName,
    currentMemberId,
    locations: [...group].sort(byCity).map((m) => ({ memberId: m.memberId, city: m.city, status: locationStatus(m) })),
  };
}
