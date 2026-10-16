import type { PortalRole } from "@/lib/portal/portal-destination";
import type { PortalMembership } from "@/lib/portal/portal-access";

/**
 * Multi-location businesses in the portal (spec 2026-10-15, "Location
 * switcher"; artboard BZ2). Pure: portal-session.server.ts and
 * require-member-session.server.ts pass in the user's memberships.
 */

export type LocationStatus = "live" | "setting_up" | "not_started";

export type ChooserEntry =
  | { kind: "member"; memberId: string; label: string; role: PortalRole }
  | { kind: "business"; businessId: string; label: string; locationCount: number; openMemberId: string };

export type LocationSwitcherData = {
  businessName: string;
  currentMemberId: string;
  locations: Array<{ memberId: string; city: string; label: string; status: LocationStatus }>;
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
 * than once is one entry (reopening the remembered location, else its first by city); every other
 * link is its own entry, labeled "Name · City" when another entry would
 * otherwise read the same.
 */
export function chooserEntries(memberships: PortalMembership[], rememberedMemberId?: string | null): ChooserEntry[] {
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
        openMemberId: sorted.find((g) => g.memberId === rememberedMemberId)?.memberId ?? sorted[0].memberId,
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

/**
 * What each location is called in the menu: its city, or "City · tiebreak"
 * when several share a city (its own business name if that differs from the
 * business's, else its street address), else "City (n)" in created order.
 * `group` is in created order (listPortalMemberships order).
 */
function locationLabels(group: PortalMembership[], displayName: string): Map<string, string> {
  const labels = new Map<string, string>();
  const byCityName = new Map<string, PortalMembership[]>();
  for (const m of group) byCityName.set(m.city, [...(byCityName.get(m.city) ?? []), m]);
  for (const [city, same] of byCityName) {
    if (same.length === 1) {
      labels.set(same[0].memberId, city);
      continue;
    }
    same.forEach((m, i) => {
      const own = m.businessName.trim();
      const tiebreak = own && own !== displayName ? own : m.streetAddress?.trim() || "";
      labels.set(m.memberId, tiebreak ? `${city} · ${tiebreak}` : `${city} (${i + 1})`);
    });
  }
  return labels;
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
  const businessName = current.businessDisplayName ?? current.businessName;
  const labels = locationLabels(group, businessName);
  return {
    businessName,
    currentMemberId,
    locations: [...group].sort(byCity).map((m) => ({
      memberId: m.memberId,
      city: m.city,
      label: labels.get(m.memberId) ?? m.city,
      status: locationStatus(m),
    })),
  };
}

/**
 * "Set up [city] next" on the You're live screen (artboard BZ3): the first
 * location in the switcher's order, other than this one, that isn't live
 * yet; null when there's no switcher or every other location is live.
 */
export function nextLocationToSetUp(
  switcher: LocationSwitcherData | null | undefined,
  currentMemberId: string,
): LocationSwitcherData["locations"][number] | null {
  if (!switcher) return null;
  return (
    switcher.locations.find((l) => l.memberId !== currentMemberId && l.status !== "live") ?? null
  );
}

/** Which member /admin opens: the portal's remembered choice when it's one of the user's links, else the oldest link. */
export function adminMemberIdFor(
  memberships: PortalMembership[],
  cookieMemberId: string | null | undefined,
): string | null {
  if (cookieMemberId && memberships.some((m) => m.memberId === cookieMemberId)) return cookieMemberId;
  return memberships[0]?.memberId ?? null;
}
