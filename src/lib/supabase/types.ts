/**
 * Hand-written row types matching
 * docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md
 * column-for-column, limited to the columns the public profile actually
 * reads. Not a generated Supabase client type -- there is no `supabase gen
 * types` step in this project yet. If one is added later, this file
 * should be regenerated from it rather than hand-maintained twice.
 *
 * Verified against the live migrations under supabase/migrations/,
 * including the final-review-fixes migration
 * (20260922153458_final_review_fixes.sql) applied on top of the original
 * 12-migration plan. See task-8-report.md for the one discrepancy found
 * between the original plan doc and the live schema (events.title /
 * events.description, added by the fix-wave migration).
 */

export type MemberType = "producer" | "mobile" | "allied";
export type MemberStatus = "applied" | "declined" | "draft" | "published" | "suspended";
export type ThemeName = "amber" | "rust" | "garnet" | "plum" | "indigo" | "teal" | "forest" | "olive";

export type CropRect = { x: number; y: number; w: number; h: number };

export type MemberRow = {
  id: string;
  slug: string;
  member_type: MemberType;
  business_name: string;
  tagline: string | null;
  city: string;
  state: string;
  street_address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  service_area: string | null;
  lead_time: string | null;
  phone: string | null;
  contact_email: string | null;
  timezone: string;
  theme: ThemeName;
  logo_asset_id: string | null;
  cover_asset_id: string | null;
  cover_crop: CropRect | null;
  member_since_year: number | null;
  discount_percent: number | null;
  discount_no_fixed_percent: boolean;
  discount_redeem_text: string | null;
  status: MemberStatus;
  hours_confirmed_at: string | null;
  published_at: string | null;
};

export type MediaAssetRow = {
  id: string;
  member_id: string;
  storage_path: string;
  kind: "image" | "video";
  mime_type: string;
  width: number | null;
  height: number | null;
  review_status: "pending" | "approved" | "rejected";
};

export type CarouselSlideRow = {
  id: string;
  member_id: string;
  asset_id: string;
  crop: CropRect;
  outbound_url: string | null;
  sort_order: number;
};

export type MemberLinkKind =
  | "website"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "taplist"
  | "menu"
  | "press_kit"
  | "catalog"
  | "other";

export type MemberLinkRow = {
  id: string;
  member_id: string;
  kind: MemberLinkKind;
  label: string | null;
  url: string;
  sort_order: number;
};

export type HoursRow = {
  id: string;
  member_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  is_closed: boolean;
};

export type SpecialHoursRow = {
  id: string;
  member_id: string;
  date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  note: string | null;
};

export type EventOverlayStatus = "postponed" | "rescheduled" | "canceled";

export type EventRow = {
  id: string;
  member_id: string;
  // Added by the final-review-fixes migration
  // (20260922153458_final_review_fixes.sql, finding #1) -- not present in
  // the original schema plan's events table, but required for display:
  // the spec's tag-based sync matches "title or category," and the
  // downstream Member Admin plan parses a title from ICS feeds with
  // nowhere else to store it.
  title: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  city: string | null;
  address: string | null;
  overlay_status: EventOverlayStatus | null;
  overlay_starts_at: string | null;
  overlay_note: string | null;
  is_hidden: boolean;
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};
