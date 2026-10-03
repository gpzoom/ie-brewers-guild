import type { MemberLinkKind, MemberType } from "@/lib/supabase/types";

/**
 * The public /members page (map + card grid), built from the database:
 * every PUBLISHED member row becomes part of a card, and a row moved back
 * to draft simply stops being returned (RLS + the explicit status filter in
 * directory.server.ts). This module is the pure shaping step -- no I/O --
 * so it can be unit tested.
 *
 * One card per BUSINESS, like the old hard-coded list in src/data/site.ts:
 * a multi-location business is several member rows sharing a
 * business_name (the same rule the profile page's "Next location" uses),
 * shown as one card with one clickable city per location.
 */

/** The members columns the directory reads -- all in anon's column grant. */
export const DIRECTORY_MEMBER_COLUMNS =
  "id, slug, member_type, business_name, city, state, street_address, postal_code, latitude, longitude, logo_asset_id";

export type DirectoryMemberRow = {
  id: string;
  slug: string;
  member_type: MemberType;
  business_name: string;
  city: string;
  state: string;
  street_address: string | null;
  postal_code: string | null;
  // PostgREST sends numeric columns as JSON numbers, but tolerate strings.
  latitude: number | string | null;
  longitude: number | string | null;
  logo_asset_id: string | null;
};

export type DirectoryLinkRow = {
  member_id: string;
  kind: MemberLinkKind;
  label: string | null;
  url: string;
  sort_order: number;
};

export type DirectoryLocation = {
  /** The real profile slug of this location's member row. */
  slug: string;
  city: string;
  /** One-line address for the address dialog and map popup. */
  address: string;
  /** Null when the location has no street address or no coordinates yet -- no map pin. */
  lat: number | null;
  lng: number | null;
};

export type DirectoryMember = {
  name: string;
  memberType: MemberType;
  locations: DirectoryLocation[];
  website: string | null;
  logo: string | null;
  facebook?: string;
  instagram?: string;
  untappd?: string;
  tourUrl?: string;
};

function toCoordinate(value: number | string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** "2060 Chicago Ave STE A17, Riverside, CA 92507"; "Riverside, CA" with no street address. */
export function formatDirectoryAddress(row: Pick<
  DirectoryMemberRow,
  "street_address" | "city" | "state" | "postal_code"
>): string {
  const cityState = [nonEmpty(row.city), nonEmpty(row.state)].filter(Boolean).join(", ");
  const tail = [cityState, nonEmpty(row.postal_code)].filter(Boolean).join(" ");
  return [nonEmpty(row.street_address), tail].filter(Boolean).join(", ");
}

function isUntappd(link: DirectoryLinkRow): boolean {
  if (link.label?.trim().toLowerCase() === "untappd") return true;
  try {
    const host = new URL(link.url).hostname.toLowerCase();
    return host === "untappd.com" || host.endsWith(".untappd.com");
  } catch {
    return false;
  }
}

function toLocation(row: DirectoryMemberRow): DirectoryLocation {
  const lat = toCoordinate(row.latitude);
  const lng = toCoordinate(row.longitude);
  // A pin needs a real street address (mobile members have none) AND coordinates.
  const pinnable = nonEmpty(row.street_address) !== null && lat !== null && lng !== null;
  return {
    slug: row.slug,
    city: row.city,
    address: formatDirectoryAddress(row),
    lat: pinnable ? lat : null,
    lng: pinnable ? lng : null,
  };
}

/**
 * Rows -> cards. Cards are ordered by business name (the same order the
 * profile page's prev/next uses); a business's locations by city (the same
 * order as the profile's "Next location"), so the card's "View profile"
 * lands on the first of them. Social links come from the business's first
 * location that has one.
 */
export function buildDirectoryMembers(args: {
  rows: DirectoryMemberRow[];
  links: DirectoryLinkRow[];
  /** logo_asset_id -> public URL; missing ids (unapproved, unreadable) get the fallback icon. */
  logoUrls: ReadonlyMap<string, string>;
}): DirectoryMember[] {
  const linksByMember = new Map<string, DirectoryLinkRow[]>();
  for (const link of [...args.links].sort((a, b) => a.sort_order - b.sort_order)) {
    const list = linksByMember.get(link.member_id) ?? [];
    list.push(link);
    linksByMember.set(link.member_id, list);
  }

  const byBusiness = new Map<string, DirectoryMemberRow[]>();
  for (const row of args.rows) {
    const list = byBusiness.get(row.business_name) ?? [];
    list.push(row);
    byBusiness.set(row.business_name, list);
  }

  const cards: DirectoryMember[] = [];
  for (const [name, rows] of byBusiness) {
    const sorted = [...rows].sort(
      (a, b) => a.city.localeCompare(b.city) || a.slug.localeCompare(b.slug),
    );
    const allLinks = sorted.flatMap((row) => linksByMember.get(row.id) ?? []);
    const firstUrl = (match: (link: DirectoryLinkRow) => boolean) =>
      allLinks.find(match)?.url ?? undefined;

    const logoAssetId = sorted.find((row) => row.logo_asset_id && args.logoUrls.has(row.logo_asset_id))
      ?.logo_asset_id;

    const card: DirectoryMember = {
      name,
      memberType: sorted[0].member_type,
      locations: sorted.map(toLocation),
      website: firstUrl((link) => link.kind === "website") ?? null,
      logo: logoAssetId ? (args.logoUrls.get(logoAssetId) ?? null) : null,
    };
    const facebook = firstUrl((link) => link.kind === "facebook");
    const instagram = firstUrl((link) => link.kind === "instagram");
    const untappd = firstUrl((link) => link.kind === "other" && isUntappd(link));
    if (facebook) card.facebook = facebook;
    if (instagram) card.instagram = instagram;
    if (untappd) card.untappd = untappd;
    cards.push(card);
  }

  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

export type DirectoryPin = {
  brewery: string;
  slug: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  website: string | null;
  tourUrl?: string;
};

/** One map pin per location that has coordinates (and a street address). */
export function directoryPins(members: DirectoryMember[]): DirectoryPin[] {
  return members.flatMap((m) =>
    m.locations.flatMap((l) =>
      l.lat !== null && l.lng !== null
        ? [
            {
              brewery: m.name,
              // Each pin links to ITS OWN location's profile.
              slug: l.slug,
              city: l.city,
              address: l.address,
              lat: l.lat,
              lng: l.lng,
              website: m.website,
              tourUrl: m.tourUrl,
            },
          ]
        : [],
    ),
  );
}

/** Google Maps directions: exact coordinates when known, otherwise the address text. */
export function directionsUrl(location: Pick<DirectoryLocation, "lat" | "lng" | "address">): string {
  const destination =
    location.lat !== null && location.lng !== null
      ? `${location.lat},${location.lng}`
      : encodeURIComponent(location.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
