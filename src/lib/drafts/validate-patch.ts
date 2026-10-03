import type { DraftSection } from "@/lib/drafts/sections";
import { isDraftSection } from "@/lib/drafts/sections";
import { isValidIanaTimezone } from "@/lib/timezone/timezones";
import { isLogoBackground } from "@/lib/members/logo-background";
import { validateLinkUrl } from "@/lib/links/url-safety";
import { LINK_KINDS } from "@/lib/links/link-kinds";
import { MEMBER_THEMES } from "@/lib/theme/member-themes";
import { isValidZip } from "@/lib/geo/places-address";
import { applyDiscountXor, assertValidDiscountPercent } from "@/lib/members/discount";

/**
 * Server-side checks on a draft save, run by saveDraftSection before it
 * calls save_member_draft_section. The database function is the real
 * boundary (role check, key allowlist, types, ownership of photos); this
 * adds the friendlier, stricter rules the old live editors enforced --
 * non-empty name/city/state, a real IANA timezone, a parseable link URL --
 * so moving the editors onto drafts doesn't loosen anything a member sees.
 *
 * A patch is a partial section: top-level keys are merged into the stored
 * section by the database (arrays -- hours, slides, links, category_ids --
 * are replaced whole). Unknown keys are rejected rather than dropped, so a
 * typo can't look like a successful save.
 */

const SECTION_KEYS: Record<DraftSection, readonly string[]> = {
  basics: [
    "business_name",
    "tagline",
    "city",
    "state",
    "street_address",
    "postal_code",
    "latitude",
    "longitude",
    "service_area",
    "lead_time",
    "member_since_year",
    "timezone",
    "phone",
    "contact_email",
    "logo_asset_id",
    "logo_background",
    "cover_asset_id",
    "cover_crop",
    "og_image_asset_id",
    "hours",
    "special_hours",
  ],
  media: ["slides"],
  links: ["links"],
  discount: [
    "discount_percent",
    "discount_no_fixed_percent",
    "discount_redeem_text",
    "category_ids",
  ],
  theme: ["theme"],
};

const MIN_MEMBER_SINCE_YEAR = 1800;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SLIDES = 4;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalString(value: unknown, what: string) {
  if (value !== null && typeof value !== "string") throw new Error(`${what} must be text.`);
}

function optionalTime(value: unknown, what: string) {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !TIME_RE.test(value))
    throw new Error(`${what} must be a valid time.`);
}

function optionalUuid(value: unknown, what: string) {
  if (value === null) return;
  if (typeof value !== "string" || !UUID_RE.test(value))
    throw new Error(`${what} isn't a valid photo.`);
}

function requireNonEmpty(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  if (value.trim() === "") throw new Error(`${label} can't be empty.`);
}

function validateCrop(value: unknown, what: string) {
  if (!isObject(value)) throw new Error(`${what} is missing.`);
  for (const key of ["x", "y", "w", "h"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key] as number)) {
      throw new Error(`${what} is invalid.`);
    }
  }
}

/**
 * A patch that touches the map pin sends both halves: two numbers in range
 * (a picked address) or two nulls (a hand edit clearing it).
 */
function validateCoordinates(patch: Json) {
  const hasLat = "latitude" in patch;
  const hasLng = "longitude" in patch;
  if (!hasLat && !hasLng) return;
  if (hasLat !== hasLng) throw new Error("Invalid map location.");
  const { latitude: lat, longitude: lng } = patch;
  if (lat === null && lng === null) return;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error("Invalid map location.");
  }
}

function validateBasics(patch: Json) {
  if ("business_name" in patch) requireNonEmpty(patch.business_name, "Business name");
  if ("city" in patch) requireNonEmpty(patch.city, "City");
  if ("state" in patch) requireNonEmpty(patch.state, "State");
  for (const key of [
    "tagline",
    "street_address",
    "service_area",
    "lead_time",
    "phone",
    "contact_email",
  ]) {
    if (key in patch) optionalString(patch[key], key);
  }
  if ("postal_code" in patch && patch.postal_code !== null) {
    if (typeof patch.postal_code !== "string" || !isValidZip(patch.postal_code)) {
      throw new Error("Enter a 5-digit ZIP code (or ZIP+4, like 92374-1234).");
    }
  }
  validateCoordinates(patch);
  if (typeof patch.tagline === "string" && patch.tagline.length > 70) {
    throw new Error("Tagline must be 70 characters or fewer.");
  }
  if (
    "timezone" in patch &&
    (typeof patch.timezone !== "string" || !isValidIanaTimezone(patch.timezone))
  ) {
    throw new Error("Invalid timezone.");
  }
  if ("member_since_year" in patch && patch.member_since_year !== null) {
    const year = patch.member_since_year;
    const maxYear = new Date().getFullYear() + 1;
    if (
      typeof year !== "number" ||
      !Number.isInteger(year) ||
      year < MIN_MEMBER_SINCE_YEAR ||
      year > maxYear
    ) {
      throw new Error(`Member-since year must be between ${MIN_MEMBER_SINCE_YEAR} and ${maxYear}.`);
    }
  }
  if ("logo_background" in patch && !isLogoBackground(patch.logo_background)) {
    throw new Error("Invalid logo background.");
  }
  if (
    typeof patch.contact_email === "string" &&
    patch.contact_email.trim() !== "" &&
    !patch.contact_email.includes("@")
  ) {
    throw new Error("That email address doesn't look right.");
  }
  for (const key of ["logo_asset_id", "cover_asset_id", "og_image_asset_id"]) {
    if (key in patch) optionalUuid(patch[key], key);
  }
  if ("cover_crop" in patch && patch.cover_crop !== null)
    validateCrop(patch.cover_crop, "The cover crop");

  if ("hours" in patch) {
    if (!Array.isArray(patch.hours)) throw new Error("Invalid hours.");
    for (const row of patch.hours) {
      if (!isObject(row)) throw new Error("Invalid hours.");
      if (
        typeof row.weekday !== "number" ||
        !Number.isInteger(row.weekday) ||
        row.weekday < 0 ||
        row.weekday > 6
      ) {
        throw new Error("Weekday must be an integer between 0 and 6.");
      }
      optionalTime(row.opens_at, "Opening time");
      optionalTime(row.closes_at, "Closing time");
      if (typeof row.closes_next_day !== "boolean" || typeof row.is_closed !== "boolean") {
        throw new Error("Invalid hours.");
      }
    }
  }
  if ("special_hours" in patch) {
    if (!Array.isArray(patch.special_hours)) throw new Error("Invalid special hours.");
    const seen = new Set<string>();
    for (const row of patch.special_hours) {
      if (!isObject(row)) throw new Error("Invalid special hours.");
      if (!isValidDate(row.date)) throw new Error("Date must be a valid calendar date.");
      if (seen.has(row.date)) {
        throw new Error(
          "You already have hours set for this date — edit the existing entry instead.",
        );
      }
      seen.add(row.date);
      optionalTime(row.opens_at, "Opening time");
      optionalTime(row.closes_at, "Closing time");
      if (typeof row.is_closed !== "boolean" || typeof row.closes_next_day !== "boolean") {
        throw new Error("Invalid special hours.");
      }
      if (row.note !== null && row.note !== undefined && typeof row.note !== "string") {
        throw new Error("Invalid note.");
      }
    }
  }
}

function validateMedia(patch: Json) {
  if (!Array.isArray(patch.slides)) throw new Error("Invalid slides.");
  if (patch.slides.length > MAX_SLIDES) throw new Error("The carousel holds at most four slides.");
  const positions = new Set<number>();
  for (const slide of patch.slides) {
    if (!isObject(slide)) throw new Error("Invalid slide.");
    if (typeof slide.asset_id !== "string" || !UUID_RE.test(slide.asset_id))
      throw new Error("Invalid slide photo.");
    validateCrop(slide.crop, "A slide's crop");
    const order = slide.sort_order;
    if (typeof order !== "number" || !Number.isInteger(order) || order < 0 || order > 3) {
      throw new Error("Carousel slots are 0-3 (max four slides).");
    }
    if (positions.has(order)) throw new Error("Two slides share the same position.");
    positions.add(order);
    if (slide.outbound_url !== null && slide.outbound_url !== undefined) {
      if (typeof slide.outbound_url !== "string") throw new Error("Invalid link.");
      if (slide.outbound_url.trim() !== "") {
        const check = validateLinkUrl(slide.outbound_url);
        if (!check.valid) throw new Error(check.reason);
      }
    }
  }
}

function validateLinks(patch: Json) {
  if (!Array.isArray(patch.links)) throw new Error("Invalid links.");
  for (const link of patch.links) {
    if (!isObject(link)) throw new Error("Invalid link.");
    if (typeof link.kind !== "string" || !(LINK_KINDS as string[]).includes(link.kind)) {
      throw new Error("Unknown link type.");
    }
    if (link.label !== null && link.label !== undefined && typeof link.label !== "string") {
      throw new Error("Invalid link label.");
    }
    if (typeof link.url !== "string") throw new Error("Invalid link.");
    // An empty URL may sit in the draft while it's being typed (a new pill
    // starts empty); publishing refuses it.
    if (link.url.trim() !== "") {
      const check = validateLinkUrl(link.url);
      if (!check.valid) throw new Error(check.reason);
    }
    if (
      link.sort_order !== null &&
      link.sort_order !== undefined &&
      typeof link.sort_order !== "number"
    ) {
      throw new Error("Invalid link order.");
    }
  }
}

function validateDiscount(patch: Json): Json {
  if ("discount_percent" in patch) {
    if (patch.discount_percent !== null && typeof patch.discount_percent !== "number") {
      throw new Error("Discount percentage must be a number.");
    }
    assertValidDiscountPercent(patch.discount_percent as number | null);
    if (typeof patch.discount_percent === "number" && !Number.isInteger(patch.discount_percent)) {
      throw new Error("Discount percentage must be a whole number.");
    }
  }
  if (
    "discount_no_fixed_percent" in patch &&
    typeof patch.discount_no_fixed_percent !== "boolean"
  ) {
    throw new Error("Invalid value for no fixed percentage.");
  }
  if ("discount_redeem_text" in patch)
    optionalString(patch.discount_redeem_text, "How members redeem it");
  if ("category_ids" in patch) {
    if (
      !Array.isArray(patch.category_ids) ||
      patch.category_ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))
    ) {
      throw new Error("Invalid supply categories.");
    }
  }
  return applyDiscountXor(patch);
}

function validateTheme(patch: Json) {
  if (!MEMBER_THEMES.some((theme) => theme.name === patch.theme)) {
    throw new Error("That isn't one of the eight themes.");
  }
}

/**
 * Returns the patch to send (discount gets its percent/no-fixed XOR
 * applied), or throws an Error whose message is safe to show the member.
 */
export function validateDraftPatch(
  section: unknown,
  rawPatch: unknown,
): { section: DraftSection; patch: Json } {
  if (!isDraftSection(section)) throw new Error("Unknown profile section.");
  if (!isObject(rawPatch)) throw new Error("Invalid update.");
  const allowed = SECTION_KEYS[section];
  const unknown = Object.keys(rawPatch).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error("Invalid update.");
  if (Object.keys(rawPatch).length === 0) throw new Error("Nothing to save.");

  let patch: Json = rawPatch;
  switch (section) {
    case "basics":
      validateBasics(patch);
      break;
    case "media":
      validateMedia(patch);
      break;
    case "links":
      validateLinks(patch);
      break;
    case "discount":
      patch = validateDiscount(patch);
      break;
    case "theme":
      validateTheme(patch);
      break;
  }
  return { section, patch };
}
