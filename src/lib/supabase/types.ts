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
 *
 * Extended by docs/superpowers/plans/2026-09-21-member-admin.md's Task 1
 * with the additional admin-only row types and columns the admin panel
 * (/admin, /signin, /send/[token]) needs beyond the public profile's
 * scoped-down subset -- see the block below CategoryRow. Same
 * column-for-column-against-the-live-migrations approach; see
 * task-1-report.md for the discrepancies found between that plan's brief
 * and the live schema (events.title/.description would have been dropped
 * by a literal reading of the brief's EventRow replacement, and
 * upload_tokens.created_by_user_id is nullable at the DB level though the
 * brief typed it non-null).
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
  // Tile behind the logo on the public profile
  // (20260925190000_members_logo_background.sql); see src/lib/members/logo-background.ts.
  logo_background: "light" | "dark" | "theme";
  cover_asset_id: string | null;
  cover_crop: CropRect | null;
  og_image_asset_id: string | null;
  member_since_year: number | null;
  discount_percent: number | null;
  discount_no_fixed_percent: boolean;
  discount_redeem_text: string | null;
  status: MemberStatus;
  hours_confirmed_at: string | null;
  // Added by the Member Admin plan's Task 28 migration
  // (20260923044945_members_hours_stale_notice.sql), now live on the
  // linked project. Still typed optional rather than required, and should
  // stay that way: src/lib/members/member-profile.server.ts's explicit
  // anon-safe column list deliberately does NOT select this column (it's
  // cron/service-role-only, never member- or public-facing), so the
  // `member as MemberRow` cast there would break if this were required.
  hours_stale_notice_sent_at?: string | null;
  published_at: string | null;
  // Added by the Guild Admin plan's Task 17 (roster approve/decline/
  // suspend/member_type-correction/trail_eligible/dues actions) -- these
  // four columns are the write-limited ones the schema's own trigger
  // (members_enforce_owner_write_limits, supabase/migrations/
  // 20260922034558_members_table.sql) reserves to a Guild admin, and
  // Task 17's roster actions both read and write them, so they can no
  // longer stay excluded per the "Deliberately excludes columns no admin
  // task reads or writes" note below (now stale for these four; updated
  // alongside this addition). trail_eligible is required -- it's already
  // in member-profile.server.ts's anon-safe explicit column list. The
  // other three are typed optional rather than required, same reasoning
  // as hours_stale_notice_sent_at just above: member-profile.server.ts's
  // explicit column list deliberately does NOT select
  // dues_received_at/approved_at/approved_by_user_id (its own comment:
  // "revoked from anon at the column level and must not be requested"),
  // so the `member as MemberRow` cast there would break if these were
  // required.
  dues_received_at?: string | null;
  approved_at?: string | null;
  approved_by_user_id?: string | null;
  trail_eligible: boolean;
};

export type MediaAssetRow = {
  id: string;
  member_id: string;
  storage_path: string;
  kind: "image" | "video";
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  original_filename: string | null;
  source: "member_upload" | "creator_upload";
  uploaded_by_user_id: string | null;
  upload_token_id: string | null;
  creator_name: string | null;
  creator_credit: boolean;
  permission_accepted_at: string | null;
  review_status: "pending" | "approved" | "rejected";
  created_at: string;
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
  calendar_connection_id: string | null;
  source: "google" | "ics" | "manual";
  external_event_id: string | null;
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
  overlay_set_at: string | null;
  is_hidden: boolean;
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

// --- Added by the Member Admin plan's Task 1 (admin panel: /admin,
// /signin, /send/[token]) -- these types cover admin-only tables and
// admin-only columns the public profile page never reads. Same
// column-for-column-against-the-live-migrations approach as the rest of
// this file; verified against supabase/migrations/ as of the
// final-review-fixes migration (20260922153458_final_review_fixes.sql).
// Deliberately excludes columns no admin task reads or writes (e.g.
// members.application_note, media_assets.duration_ms,
// calendar_connections.google_refresh_token -- Google OAuth/Vault wiring
// is out of scope for this phase) -- same "columns actually used"
// philosophy as the rest of this file, not an oversight.
// members.dues_received_at/.approved_at/.approved_by_user_id/
// .trail_eligible were part of this original exclusion list too, but are
// now on MemberRow itself (added by the Guild Admin plan's Task 17, see
// that comment above) since that task's roster actions read and write
// them.

export type ProfileRow = {
  id: string;
  is_guild_admin: boolean;
};

export type MemberUserRow = {
  id: string;
  member_id: string;
  user_id: string;
  role: "owner" | "editor";
  created_at: string;
};

export type CalendarConnectionRow = {
  id: string;
  member_id: string;
  provider: "google" | "ics";
  google_calendar_id: string | null;
  ics_url: string | null;
  sync_tag: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  sync_status: "ok" | "failing" | "disconnected";
};

export type UploadTokenRow = {
  id: string;
  member_id: string;
  token_hash: string;
  // The brief typed this as non-nullable `string`, but the
  // final-review-fixes migration (finding #5) dropped its NOT NULL
  // constraint and switched its FK to `on delete set null`, so a token
  // whose creator's auth.users row is later deleted has this column go
  // null at runtime.
  created_by_user_id: string | null;
  expires_at: string;
  max_files: number;
  used_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type MemberCategoryRow = {
  id: string;
  member_id: string;
  category_id: string;
};

export type InquiryRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  wants_membership_info: boolean;
  status: "open" | "handled";
  confirmation_sent_at: string | null;
  handled_by_user_id: string | null;
  handled_at: string | null;
  converted_member_id: string | null;
};

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_user_id: string;
  member_id: string | null;
  table_name: string;
  row_id: string | null;
  action: "insert" | "update" | "delete";
};

export type BrandSettingsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  font_pairing: string;
  tokens: Record<string, string>;
  updated_by_user_id: string | null;
};
