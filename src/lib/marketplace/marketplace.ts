/**
 * Producer marketplace (20261127100000_marketplace.sql): classified ads
 * between Producers. Pure helpers shared by the browse screen, My listings
 * and Guild admin.
 */

export const LISTING_KINDS = ["equipment", "inventory", "service", "wanted"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];
export const KIND_LABELS: Record<ListingKind, string> = {
  equipment: "Used equipment",
  inventory: "Excess inventory",
  service: "Service",
  wanted: "In Search Of",
};

export const CONDITIONS = ["new", "like_new", "good", "fair", "parts"] as const;
export type ListingCondition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  parts: "For parts or repair",
};

export const LISTING_DAYS = 60;
export const MAX_PHOTOS = 6;
export const PAGE_SIZE = 20;
export const LISTING_LIMITS = {
  title: 120,
  description: 5000,
  priceUnit: 40,
  location: 120,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
  category: 60,
} as const;

export type MarketplaceCategory = { id: string; name: string; sort_order: number };

export type MarketplaceListing = {
  id: string;
  memberId: string;
  memberName: string;
  memberSlug: string;
  memberStatus: string;
  memberCity: string | null;
  kind: ListingKind;
  categoryId: string | null;
  title: string;
  description: string;
  condition: ListingCondition | null;
  priceCents: number | null;
  priceUnit: string | null;
  negotiable: boolean;
  locationText: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  photoPaths: string[];
  /** Same order as photoPaths; null when a file couldn't be linked. */
  photoUrls: (string | null)[];
  status: "open" | "closed";
  postedAt: string;
  expiresAt: string;
};

export type ListingInput = {
  kind: ListingKind;
  categoryId: string;
  title: string;
  description: string;
  condition: ListingCondition | "";
  /** As typed: "1,200" or "8.50"; empty is "Contact for price". */
  price: string;
  priceUnit: string;
  negotiable: boolean;
  locationText: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  photoPaths: string[];
  /** "This listing isn't for beer, wine, spirits or other alcohol." */
  noAlcohol: boolean;
};

export type ListingColumns = {
  kind: ListingKind;
  category_id: string;
  title: string;
  description: string;
  condition: ListingCondition | null;
  price_cents: number | null;
  price_unit: string | null;
  negotiable: boolean;
  location_text: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  photo_paths: string[];
};

const EMAIL_PATTERN = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

/** Dollars as typed to cents; null when empty, undefined when it isn't a price. */
export function parsePrice(text: string): number | null | undefined {
  const cleaned = text.trim().replace(/^\$/, "").trim();
  if (!cleaned) return null;
  // Digits, or digits grouped by commas in threes; at most two decimals.
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const cents = Math.round(Number(cleaned.replace(/,/g, "")) * 100);
  return cents <= 100_000_000 ? cents : undefined;
}

type Checked = { ok: true; value: ListingColumns } | { ok: false; error: string };

/** The cleaned columns, or the first problem in words the member can act on. */
export function validateListing(input: ListingInput): Checked {
  const fail = (error: string): Checked => ({ ok: false, error });
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  if (!LISTING_KINDS.includes(input.kind)) return fail("Choose what you're posting.");
  if (!text(input.categoryId)) return fail("Choose a category.");
  const title = text(input.title);
  if (!title) return fail("Add a title.");
  if (title.length > LISTING_LIMITS.title) return fail(`Keep the title under ${LISTING_LIMITS.title} characters.`);
  const description = text(input.description);
  if (!description) return fail("Add a description.");
  if (description.length > LISTING_LIMITS.description) {
    return fail(`Keep the description under ${LISTING_LIMITS.description} characters.`);
  }
  // Condition is only for things being sold.
  const sold = input.kind === "equipment" || input.kind === "inventory";
  const condition = sold && input.condition ? input.condition : null;
  if (condition && !CONDITIONS.includes(condition)) return fail("Choose a condition.");
  const price = parsePrice(text(input.price));
  if (price === undefined) return fail("Enter the price as a number, such as 1,200 or 8.50, up to 1,000,000.");
  const priceUnit = price === null ? "" : text(input.priceUnit);
  if (priceUnit.length > LISTING_LIMITS.priceUnit) return fail(`Keep "per" under ${LISTING_LIMITS.priceUnit} characters.`);
  const location = text(input.locationText);
  if (location.length > LISTING_LIMITS.location) return fail(`Keep the location under ${LISTING_LIMITS.location} characters.`);
  const name = text(input.contactName);
  if (name.length > LISTING_LIMITS.contactName) return fail(`Keep the contact name under ${LISTING_LIMITS.contactName} characters.`);
  const email = text(input.contactEmail);
  const phone = text(input.contactPhone);
  if (!email && !phone) return fail("Add an email address or a phone number, so Producers can reach you.");
  if (email && (email.length > LISTING_LIMITS.contactEmail || !EMAIL_PATTERN.test(email))) {
    return fail("Check the email address: it should look like name@example.com.");
  }
  if (phone && (phone.length > LISTING_LIMITS.contactPhone || phone.replace(/\D/g, "").length < 7)) {
    return fail("Check the phone number.");
  }
  if (!Array.isArray(input.photoPaths) || input.photoPaths.length > MAX_PHOTOS) return fail(`Up to ${MAX_PHOTOS} photos.`);
  if (input.noAlcohol !== true) return fail("Check the box to confirm the listing isn't for alcohol.");
  return {
    ok: true,
    value: {
      kind: input.kind,
      category_id: input.categoryId,
      title,
      description,
      condition,
      price_cents: price,
      price_unit: priceUnit || null,
      negotiable: input.negotiable === true,
      location_text: location || null,
      contact_name: name || null,
      contact_email: email || null,
      contact_phone: phone || null,
      photo_paths: input.photoPaths,
    },
  };
}

export type ListingState = "open" | "closed" | "expired";

export function listingState(listing: Pick<MarketplaceListing, "status" | "expiresAt">, now: Date): ListingState {
  if (listing.status === "closed") return "closed";
  return new Date(listing.expiresAt).getTime() > now.getTime() ? "open" : "expired";
}

/** "$1,200", "$8.50 per keg", "Contact for price"; an In Search Of shows its budget. */
export function priceText(l: Pick<MarketplaceListing, "kind" | "priceCents" | "priceUnit" | "negotiable">): string {
  if (l.priceCents === null) return l.kind === "wanted" ? "Budget open" : "Contact for price";
  if (l.priceCents === 0) return l.kind === "wanted" ? "Looking for free" : "Free";
  const dollars = l.priceCents / 100;
  const amount = dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  });
  const unit = l.priceUnit ? ` per ${l.priceUnit.replace(/^per\s+/i, "")}` : "";
  return `${l.kind === "wanted" ? "Budget " : ""}${amount}${unit}`;
}

export function listingLocation(l: Pick<MarketplaceListing, "locationText" | "memberCity">): string | null {
  return l.locationText?.trim() || l.memberCity || null;
}

export type SortKey = "newest" | "price_low" | "price_high" | "title";
export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  price_low: "Price: low to high",
  price_high: "Price: high to low",
  title: "Title: A to Z",
};

export type ListingFilters = {
  keyword: string;
  kind: ListingKind | "";
  /** A category id; "none" is listings without one. */
  categoryId: string;
  minPrice: string;
  maxPrice: string;
  sort: SortKey;
};
export const NO_FILTERS: ListingFilters = { keyword: "", kind: "", categoryId: "", minPrice: "", maxPrice: "", sort: "newest" };

/** Every word must appear (any order). A price filter leaves out listings with no price. */
export function filterListings(listings: readonly MarketplaceListing[], f: ListingFilters): MarketplaceListing[] {
  const words = f.keyword.toLowerCase().split(/\s+/).filter(Boolean);
  const min = parsePrice(f.minPrice) ?? null;
  const max = parsePrice(f.maxPrice) ?? null;
  const kept = listings.filter((l) => {
    if (f.kind && l.kind !== f.kind) return false;
    if (f.categoryId === "none" ? l.categoryId !== null : f.categoryId && l.categoryId !== f.categoryId) return false;
    if (min !== null && (l.priceCents === null || l.priceCents < min)) return false;
    if (max !== null && (l.priceCents === null || l.priceCents > max)) return false;
    if (words.length === 0) return true;
    const haystack = `${l.title} ${l.description} ${l.memberName} ${listingLocation(l) ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  const byNewest = (a: MarketplaceListing, b: MarketplaceListing) => b.postedAt.localeCompare(a.postedAt);
  const byPrice = (direction: 1 | -1) => (a: MarketplaceListing, b: MarketplaceListing) => {
    if (a.priceCents === null || b.priceCents === null) {
      if (a.priceCents === b.priceCents) return byNewest(a, b);
      return a.priceCents === null ? 1 : -1; // no price goes last either way
    }
    return direction * (a.priceCents - b.priceCents) || byNewest(a, b);
  };
  return kept.sort(
    f.sort === "price_low"
      ? byPrice(1)
      : f.sort === "price_high"
        ? byPrice(-1)
        : f.sort === "title"
          ? (a, b) => a.title.localeCompare(b.title) || byNewest(a, b)
          : byNewest,
  );
}

/** Page `page` (1-based, kept in range) of a list. */
export function pageOf<T>(items: readonly T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);
  return { rows, pages, current, from: rows.length ? start + 1 : 0, to: start + rows.length };
}

/** The email button, with the listing named in the subject. */
export function contactMailto(email: string, title: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(`Guild marketplace: ${title}`)}`;
}

/** "Nov 24", always in Pacific Time, so the server and the browser agree. */
export function listingDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}
