import type { MemberType } from "@/lib/supabase/types";

/** Search, filter and Near-me order for the Members page v2 list (spec "Search, filter and order"). Pure. */
export type FilterableCard = {
  name: string;
  memberType: MemberType;
  locations: Array<{ city: string; lat: number | null; lng: number | null }>;
};

export type LatLng = { lat: number; lng: number };

export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesSearch(card: FilterableCard, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return [card.name, ...card.locations.map((l) => l.city)].some((text) => normalizeForSearch(text).includes(q));
}

export function filterCards<T extends FilterableCard>(cards: T[], opts: { query: string; type?: MemberType }): T[] {
  return cards.filter((c) => (!opts.type || c.memberType === opts.type) && matchesSearch(c, opts.query));
}

const EARTH_RADIUS_MILES = 3958.8;

export function distanceMiles(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export function nearestDistance(points: LatLng[], origin: LatLng): number | null {
  if (points.length === 0) return null;
  return Math.min(...points.map((p) => distanceMiles(origin, p)));
}

export function orderByDistance<T>(
  cards: T[],
  origin: LatLng,
  pointsOf: (card: T) => LatLng[],
  nameOf: (card: T) => string,
): T[] {
  return [...cards]
    .map((card) => ({ card, d: nearestDistance(pointsOf(card), origin) }))
    .sort((a, b) => {
      if (a.d === null && b.d === null) return nameOf(a.card).localeCompare(nameOf(b.card));
      if (a.d === null) return 1;
      if (b.d === null) return -1;
      return a.d - b.d;
    })
    .map((x) => x.card);
}

export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

export function splitLocations<T>(locations: T[], shown = 2): { shown: T[]; hidden: T[] } {
  return { shown: locations.slice(0, shown), hidden: locations.slice(shown) };
}

/** Near me: a card's location rows nearest first, rows with no pin last; no origin keeps the order. */
export function orderLocations<T extends { lat: number | null; lng: number | null }>(locations: T[], origin: LatLng | null): T[] {
  if (!origin) return locations;
  const d = (l: T) => (l.lat === null || l.lng === null ? Infinity : distanceMiles(origin, { lat: l.lat, lng: l.lng }));
  return [...locations].sort((a, b) => d(a) - d(b));
}
