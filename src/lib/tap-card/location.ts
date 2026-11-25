import { distanceMiles } from "@/lib/members/directory-filters";

/**
 * Was the phone near the taproom at check-in (spec 2026-11-24)? Only the word
 * is ever kept; the position itself is never stored or logged.
 */
export type Position = { lat: number; lng: number; accuracy: number };
export type LocationWord = "near" | "far" | "none";

export const FAR_METERS = 400;
/** A reading rougher than this can't say "near" (iPhone's Precise Location off). */
export const ROUGH_METERS = 1000;
const METERS_PER_MILE = 1609.344;

export function parsePosition(raw: unknown): Position | null {
  if (!raw || typeof raw !== "object") return null;
  const { lat, lng, accuracy } = raw as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number" || typeof accuracy !== "number") return null;
  if (![lat, lng, accuracy].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0) return null;
  return { lat, lng, accuracy };
}

/** Null where distance means nothing: mobile members, or no saved coordinates. */
export function locationWord(position: Position | null, place: { memberType: string; lat: number | null; lng: number | null }): LocationWord | null {
  if (place.memberType === "mobile" || place.lat === null || place.lng === null) return null;
  if (!position) return "none";
  const meters = distanceMiles(position, { lat: place.lat, lng: place.lng }) * METERS_PER_MILE;
  if (meters - position.accuracy > FAR_METERS) return "far";
  return position.accuracy > ROUGH_METERS ? "none" : "near";
}
