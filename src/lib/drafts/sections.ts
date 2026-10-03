import type { CropRect, MemberLinkKind, MemberStatus, ThemeName } from "@/lib/supabase/types";
import type { LogoBackground } from "@/lib/members/logo-background";

/**
 * The member draft, in the shape the database keeps it (member_drafts.data,
 * see supabase/migrations/20260925200400_member_drafts_table.sql and
 * _validate_draft_section() in 20260925200700_member_draft_internals.sql).
 * Pure types and rules only -- no server or React imports -- so the
 * editors, the top bar, the server functions and the tests all share one
 * definition.
 */

export const DRAFT_SECTIONS = ["basics", "media", "links", "discount", "theme"] as const;
export type DraftSection = (typeof DRAFT_SECTIONS)[number];

export function isDraftSection(value: unknown): value is DraftSection {
  return typeof value === "string" && (DRAFT_SECTIONS as readonly string[]).includes(value);
}

export type DraftHours = {
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  is_closed: boolean;
};

export type DraftSpecialHours = {
  date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  note: string | null;
};

export type BasicsDraft = {
  business_name: string;
  tagline: string | null;
  city: string;
  state: string;
  street_address: string | null;
  /** ZIP (5-digit or ZIP+4); producer/allied only. */
  postal_code: string | null;
  /**
   * Map pin, set together from a picked address suggestion
   * (src/lib/geo/places-address.ts) and cleared by a hand edit of the
   * address, so the post-publish geocode looks it up instead. Both or neither.
   */
  latitude: number | null;
  longitude: number | null;
  service_area: string | null;
  lead_time: string | null;
  member_since_year: number | null;
  timezone: string;
  phone: string | null;
  contact_email: string | null;
  logo_asset_id: string | null;
  logo_background: LogoBackground;
  cover_asset_id: string | null;
  cover_crop: CropRect | null;
  og_image_asset_id: string | null;
  hours: DraftHours[];
  special_hours: DraftSpecialHours[];
};

export type DraftSlide = {
  asset_id: string;
  crop: CropRect;
  outbound_url: string | null;
  sort_order: number;
};

export type MediaDraft = { slides: DraftSlide[] };

export type DraftLink = {
  kind: MemberLinkKind;
  label: string | null;
  url: string;
  sort_order: number | null;
};

export type LinksDraft = { links: DraftLink[] };

export type DiscountDraft = {
  discount_percent: number | null;
  discount_no_fixed_percent: boolean;
  discount_redeem_text: string | null;
  category_ids: string[];
};

export type ThemeDraft = { theme: ThemeName };

export type MemberDraftData = {
  basics: BasicsDraft;
  media: MediaDraft;
  links: LinksDraft;
  discount: DiscountDraft;
  theme: ThemeDraft;
};

export type SectionData<S extends DraftSection> = MemberDraftData[S];

// ---------------------------------------------------------------------------
// Normalizing what comes back from the database
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function bool(value: unknown): boolean {
  return value === true;
}
function crop(value: unknown): CropRect | null {
  const o = asObject(value);
  const x = num(o.x);
  const y = num(o.y);
  const w = num(o.w);
  const h = num(o.h);
  return x === null || y === null || w === null || h === null ? null : { x, y, w, h };
}

/** Both or neither (the database's rule too); numeric strings are accepted. */
function coordinates(
  lat: unknown,
  lng: unknown,
): { latitude: number | null; longitude: number | null } {
  const toNum = (v: unknown) =>
    typeof v === "string" && v.trim() !== "" ? num(Number(v)) : num(v);
  const latitude = toNum(lat);
  const longitude = toNum(lng);
  return latitude === null || longitude === null
    ? { latitude: null, longitude: null }
    : { latitude, longitude };
}

const LOGO_BACKGROUND_VALUES = ["light", "dark", "theme"] as const;

/**
 * The stored JSON, filled out to the full typed shape: any key the database
 * left out comes back as its empty value. A draft is always created from
 * live (ensure_member_draft), so in practice every key is present; this only
 * keeps the client from crashing on a section saved in an older shape.
 */
export function normalizeDraftData(raw: unknown): MemberDraftData {
  const data = asObject(raw);
  const b = asObject(data.basics);
  const logoBackground = str(b.logo_background);
  const media = asObject(data.media);
  const links = asObject(data.links);
  const discount = asObject(data.discount);
  const theme = asObject(data.theme);

  return {
    basics: {
      business_name: str(b.business_name) ?? "",
      tagline: str(b.tagline),
      city: str(b.city) ?? "",
      state: str(b.state) ?? "",
      street_address: str(b.street_address),
      postal_code: str(b.postal_code),
      ...coordinates(b.latitude, b.longitude),
      service_area: str(b.service_area),
      lead_time: str(b.lead_time),
      member_since_year: num(b.member_since_year),
      timezone: str(b.timezone) ?? "America/Los_Angeles",
      phone: str(b.phone),
      contact_email: str(b.contact_email),
      logo_asset_id: str(b.logo_asset_id),
      logo_background: (LOGO_BACKGROUND_VALUES as readonly string[]).includes(logoBackground ?? "")
        ? (logoBackground as LogoBackground)
        : "light",
      cover_asset_id: str(b.cover_asset_id),
      cover_crop: crop(b.cover_crop),
      og_image_asset_id: str(b.og_image_asset_id),
      hours: asArray(b.hours).map((raw) => {
        const h = asObject(raw);
        return {
          weekday: num(h.weekday) ?? 0,
          opens_at: str(h.opens_at),
          closes_at: str(h.closes_at),
          closes_next_day: bool(h.closes_next_day),
          is_closed: bool(h.is_closed),
        };
      }),
      special_hours: asArray(b.special_hours).map((raw) => {
        const s = asObject(raw);
        return {
          date: str(s.date) ?? "",
          is_closed: bool(s.is_closed),
          opens_at: str(s.opens_at),
          closes_at: str(s.closes_at),
          closes_next_day: bool(s.closes_next_day),
          note: str(s.note),
        };
      }),
    },
    media: {
      slides: asArray(media.slides)
        .map((raw) => {
          const s = asObject(raw);
          const assetId = str(s.asset_id);
          const slideCrop = crop(s.crop);
          const sortOrder = num(s.sort_order);
          if (!assetId || !slideCrop || sortOrder === null) return null;
          return {
            asset_id: assetId,
            crop: slideCrop,
            outbound_url: str(s.outbound_url),
            sort_order: sortOrder,
          };
        })
        .filter((slide): slide is DraftSlide => slide !== null)
        .sort((a, b) => a.sort_order - b.sort_order),
    },
    links: {
      links: asArray(links.links).map((raw) => {
        const l = asObject(raw);
        return {
          kind: (str(l.kind) ?? "other") as MemberLinkKind,
          label: str(l.label),
          url: str(l.url) ?? "",
          sort_order: num(l.sort_order),
        };
      }),
    },
    discount: {
      discount_percent: num(discount.discount_percent),
      discount_no_fixed_percent: bool(discount.discount_no_fixed_percent),
      discount_redeem_text: str(discount.discount_redeem_text),
      category_ids: asArray(discount.category_ids).filter(
        (id): id is string => typeof id === "string",
      ),
    },
    theme: { theme: (str(theme.theme) ?? "amber") as ThemeName },
  };
}

export function normalizeSections(raw: unknown): DraftSection[] {
  const list = asArray(raw);
  return DRAFT_SECTIONS.filter((section) => list.includes(section));
}

// ---------------------------------------------------------------------------
// Who may do what (mirrors can_edit_section / is_member_full_editor in
// 20260925200300_member_role_helpers.sql -- the database is the real check;
// this only decides what the UI offers)
// ---------------------------------------------------------------------------

export type MemberRole = "owner" | "editor" | "media_events";

/**
 * The viewer's effective rights on one member. A Guild admin who isn't
 * linked (i.e. impersonating) acts with owner rights (spec, "Enforcement").
 */
export type ViewerRole = MemberRole | "guild_admin";

export function resolveViewerRole(
  memberRole: string | null,
  isGuildAdmin: boolean,
): ViewerRole | null {
  if (memberRole === "owner" || memberRole === "editor") return memberRole;
  // A Guild admin always has full rights (is_member_full_editor), even if
  // they also happen to be linked with a narrower role.
  if (isGuildAdmin) return "guild_admin";
  return memberRole === "media_events" ? "media_events" : null;
}

export function isFullEditor(role: ViewerRole | null): boolean {
  return role === "owner" || role === "editor" || role === "guild_admin";
}

export function canEditSection(role: ViewerRole | null, section: DraftSection): boolean {
  if (isFullEditor(role)) return true;
  return role === "media_events" && section === "media";
}

export function editableSections(role: ViewerRole | null): DraftSection[] {
  return DRAFT_SECTIONS.filter((section) => canEditSection(role, section));
}

/** The dirty sections this viewer could publish or discard. */
export function publishableDirtySections(
  dirty: readonly string[],
  role: ViewerRole | null,
): DraftSection[] {
  return DRAFT_SECTIONS.filter(
    (section) => dirty.includes(section) && canEditSection(role, section),
  );
}

/**
 * What "Publish changes" sends. A member that isn't live yet can only go
 * live with every section, and only from a full editor (plan Decision 10,
 * mirrored in publish_member_draft); after that, only the viewer's own
 * publishable dirty sections.
 */
export function sectionsToPublish(args: {
  role: ViewerRole | null;
  status: MemberStatus;
  dirty: readonly string[];
}): DraftSection[] {
  if (args.status !== "published") {
    return isFullEditor(args.role) ? [...DRAFT_SECTIONS] : [];
  }
  return publishableDirtySections(args.dirty, args.role);
}

/** The publish check's hours step runs only when basics goes live. */
export function publishNeedsHoursCheck(sections: readonly DraftSection[]): boolean {
  return sections.includes("basics");
}

export type TopBarState = {
  /** "Unpublished changes" label. */
  showUnpublished: boolean;
  /** "Discard changes" button (never for a never-published member). */
  showDiscard: boolean;
  /** "Publish changes" button. */
  canPublish: boolean;
  /** "Move back to draft". */
  canUnpublish: boolean;
  /** Sections a publish would send. */
  publishSections: DraftSection[];
  /** Sections a discard would reset. */
  discardSections: DraftSection[];
};

export function computeTopBarState(args: {
  role: ViewerRole | null;
  status: MemberStatus;
  dirty: readonly string[];
}): TopBarState {
  const publishable = publishableDirtySections(args.dirty, args.role);
  const isPublished = args.status === "published";
  const publishSections = sectionsToPublish(args);
  return {
    showUnpublished: publishable.length > 0,
    showDiscard: isPublished && publishable.length > 0,
    canPublish:
      publishSections.length > 0 && (args.status === "draft" || args.status === "published"),
    canUnpublish: isPublished && isFullEditor(args.role),
    publishSections,
    discardSections: isPublished ? publishable : [],
  };
}

/**
 * The owner's "Photo changes from [email] waiting to publish": only when
 * the pending media change was someone else's, and only for people who can
 * publish it anyway (owner, full editor, Guild admin).
 */
export function shouldShowPhotoChangesFrom(args: {
  role: ViewerRole | null;
  dirty: readonly string[];
  mediaUpdatedByUserId: string | null;
  viewerUserId: string;
}): boolean {
  return (
    isFullEditor(args.role) &&
    args.dirty.includes("media") &&
    args.mediaUpdatedByUserId !== null &&
    args.mediaUpdatedByUserId !== args.viewerUserId
  );
}
