/**
 * Pure mapping of a Google Place Details (REST, Places API New) response onto
 * our profile fields. No network, no server code.
 */
import { parsePlaceAddress } from "@/lib/geo/places-address";
import type { DraftHours } from "@/lib/drafts/sections";
import { TAGLINE_MAX } from "@/lib/drafts/validate-patch";

export { TAGLINE_MAX };

type PlacePoint = { day: number; hour: number; minute: number };

export type GooglePlaceDetails = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  location?: { latitude: number; longitude: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: {
    periods?: { open: PlacePoint; close?: PlacePoint }[];
  };
  editorialSummary?: { text: string };
  businessStatus?: string;
};

export type PlaceProfile = {
  placeId: string;
  businessName: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  tagline: string | null;
  hours: DraftHours[] | null;
  permanentlyClosed: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (p: { hour: number; minute: number }) => `${pad(p.hour)}:${pad(p.minute)}`;
const minutes = (p: { hour: number; minute: number }) => p.hour * 60 + p.minute;

export function mapOpeningHours(
  periods: NonNullable<GooglePlaceDetails["regularOpeningHours"]>["periods"],
): DraftHours[] | null {
  if (!periods) return null;
  // A close-less period is Google's "open 24 hours" (and anything else we
  // can't express): don't guess, let the person fill the hours in.
  if (periods.some((p) => !p.close)) return null;

  type Span = { open: PlacePoint; close: PlacePoint | undefined; closeMin: number };
  const byDay = new Map<number, Span[]>();
  for (const period of periods) {
    const day = period.open.day;
    const nextDay = !!period.close && period.close.day !== day;
    // Compare closes on one scale: after-midnight closes sort later.
    const closeMin = period.close ? minutes(period.close) + (nextDay ? 24 * 60 : 0) : 0;
    const list = byDay.get(day) ?? [];
    list.push({ open: period.open, close: period.close, closeMin });
    byDay.set(day, list);
  }

  const rows: DraftHours[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const spans = byDay.get(weekday);
    if (!spans || spans.length === 0) {
      rows.push({
        weekday,
        opens_at: null,
        closes_at: null,
        closes_next_day: false,
        is_closed: true,
      });
      continue;
    }
    const earliest = spans.reduce((a, b) => (minutes(b.open) < minutes(a.open) ? b : a));
    const withClose = spans.filter((s) => s.close);
    const latest = withClose.length
      ? withClose.reduce((a, b) => (b.closeMin > a.closeMin ? b : a))
      : null;
    rows.push({
      weekday,
      opens_at: hhmm(earliest.open),
      closes_at: latest?.close ? hhmm(latest.close) : null,
      closes_next_day: !!latest && latest.closeMin >= 24 * 60,
      is_closed: false,
    });
  }
  return rows;
}

export function mapPlaceToProfile(place: GooglePlaceDetails): PlaceProfile {
  const address = parsePlaceAddress(
    (place.addressComponents ?? []).map((c) => ({
      longText: c.longText ?? null,
      shortText: c.shortText ?? null,
      types: c.types ?? [],
    })),
    place.location ? { lat: place.location.latitude, lng: place.location.longitude } : null,
  );
  const summary = place.editorialSummary?.text?.trim() ?? "";
  return {
    placeId: place.id,
    businessName: place.displayName?.text?.trim() || null,
    ...address,
    phone: place.nationalPhoneNumber?.trim() || null,
    website: place.websiteUri?.trim() || null,
    tagline: summary && summary.length <= TAGLINE_MAX ? summary : null,
    hours: mapOpeningHours(place.regularOpeningHours?.periods),
    permanentlyClosed: place.businessStatus === "CLOSED_PERMANENTLY",
  };
}
