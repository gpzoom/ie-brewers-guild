import { roundCoordinate, type PickedPlace } from "@/lib/geo/places-address";

/**
 * The Events editor's Venue box with Google suggestions (owner, 2026-10-05):
 * picking a place saves its name, full address, city and exact position, so
 * a mobile member's stop gets an accurate pin anywhere -- not only beside a
 * Guild member. Pure; the editor and updateEvent use these.
 */
export type VenuePatch = {
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** The address the position belongs to (events.geocoded_address); the map uses a position only while it matches `address`. */
  geocodedAddress?: string | null;
};

function tidy(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function venuePickPatch(picked: PickedPlace, typedText: string): Required<VenuePatch> {
  const venueName =
    tidy(picked.businessName) || tidy(picked.address.street_address) || tidy(picked.address.city) || tidy(typedText) || null;
  const address = tidy(picked.formattedAddress) || null;
  const { latitude, longitude } = cleanCoordinates(picked.address.latitude, picked.address.longitude);
  const hasPosition = address !== null && latitude !== null;
  return {
    venueName,
    address,
    city: tidy(picked.address.city) || null,
    latitude: hasPosition ? latitude : null,
    longitude: hasPosition ? longitude : null,
    geocodedAddress: hasPosition ? address : null,
  };
}

/** Typing over a picked venue clears its address and position; otherwise only the name changes. */
export function venueHandEditPatch(text: string, opts: { hadPickedAddress: boolean }): VenuePatch {
  const venueName = tidy(text) || null;
  if (!opts.hadPickedAddress) return { venueName };
  return { venueName, address: null, city: null, latitude: null, longitude: null, geocodedAddress: null };
}

/** A real map position, rounded like events.latitude/longitude (numeric(9, 6)), or both null. */
export function cleanCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { latitude: number | null; longitude: number | null } {
  const ok =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  return ok ? { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) } : { latitude: null, longitude: null };
}

/**
 * The events columns a save writes for a position: nothing when the save
 * doesn't mention one; otherwise a checked position with the address it
 * belongs to, or all three cleared.
 */
export function positionColumns(
  patch: VenuePatch,
): { latitude?: number | null; longitude?: number | null; geocoded_address?: string | null } {
  if (patch.latitude === undefined && patch.longitude === undefined && patch.geocodedAddress === undefined) return {};
  const { latitude, longitude } = cleanCoordinates(patch.latitude, patch.longitude);
  const address = tidy(patch.geocodedAddress) || null;
  if (latitude === null || address === null) return { latitude: null, longitude: null, geocoded_address: null };
  return { latitude, longitude, geocoded_address: address };
}
