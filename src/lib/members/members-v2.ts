import type { DirectoryMember, DirectoryMemberRow } from "@/lib/members/directory";
import { mobileIconFor, mobileTagFor, type MobileCategory, type MobileIcon } from "@/lib/members/mobile-category";
import { summarizeStops, type HostLocation, type StopEvent, type StopSummary } from "@/lib/members/mobile-stops";

/** Members page v2's cards and pins (spec; artboards B2-B6). Pure: the server function loads the inputs. */
export type V2Card = DirectoryMember & {
  /** Stable key: the business name (cards are one per business). */
  key: string;
  /** ALLIED, a mobile member's first category (or MOBILE), or null for producers. */
  tag: string | null;
  mobileIcon: MobileIcon | null;
  stop: StopSummary | null;
  stopPin: { lat: number; lng: number } | null;
};

export type V2Pin = {
  key: string;
  cardKey: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  kind: "location" | "mobile";
  icon: MobileIcon | null;
  website: string | null;
  /** The pop-up's line for a mobile pin: "Today 5–9 pm at All Points Brewing Co." */
  stopLine: string | null;
};

function hostsFrom(members: DirectoryMember[]): HostLocation[] {
  return members
    .filter((m) => m.memberType !== "mobile")
    .flatMap((m) =>
      m.locations.flatMap((l) =>
        l.lat !== null && l.lng !== null ? [{ name: m.name, slug: l.slug, city: l.city, street: l.street, lat: l.lat, lng: l.lng }] : [],
      ),
    );
}

function stopLineFor(summary: StopSummary): string | null {
  if (summary.state === "at-member") return `Today ${summary.time} at ${summary.hostName}`;
  if (summary.state === "at-address") return `Today ${summary.time} at ${summary.venue}`;
  return null;
}

export function buildV2(args: {
  members: DirectoryMember[];
  rows: DirectoryMemberRow[];
  categoriesByMemberId: Map<string, MobileCategory[]>;
  stopsByMemberId: Map<string, StopEvent[]>;
  now: Date;
}): { cards: V2Card[]; pins: V2Pin[] } {
  const idBySlug = new Map(args.rows.map((r) => [r.slug, r.id]));
  const hosts = hostsFrom(args.members);
  const cards: V2Card[] = [];
  const pins: V2Pin[] = [];

  for (const m of args.members) {
    const key = m.name;
    if (m.memberType === "mobile") {
      const memberId = idBySlug.get(m.locations[0]?.slug ?? "") ?? "";
      const categories = args.categoriesByMemberId.get(memberId) ?? [];
      const { summary, placement } = summarizeStops(args.stopsByMemberId.get(memberId) ?? [], hosts, args.now);
      const stopPin = placement.kind === "none" ? null : { lat: placement.lat, lng: placement.lng };
      const icon = mobileIconFor(categories);
      cards.push({ ...m, key, tag: mobileTagFor(categories), mobileIcon: icon, stop: summary, stopPin });
      if (stopPin) {
        pins.push({
          key: `${key}::stop`,
          cardKey: key,
          slug: m.locations[0]?.slug ?? "",
          name: m.name,
          city: m.locations[0]?.city ?? "",
          address: summary.state === "at-address" ? summary.address : "",
          lat: stopPin.lat,
          lng: stopPin.lng,
          kind: "mobile",
          icon,
          website: m.website,
          stopLine: stopLineFor(summary),
        });
      }
      continue;
    }
    cards.push({ ...m, key, tag: m.memberType === "allied" ? "ALLIED" : null, mobileIcon: null, stop: null, stopPin: null });
    for (const l of m.locations) {
      if (l.lat === null || l.lng === null) continue;
      pins.push({
        key: `${key}::${l.slug}`,
        cardKey: key,
        slug: l.slug,
        name: m.name,
        city: l.city,
        address: l.address,
        lat: l.lat,
        lng: l.lng,
        kind: "location",
        icon: null,
        website: m.website,
        stopLine: null,
      });
    }
  }
  return { cards, pins };
}
