import type { SupabaseClient } from "@supabase/supabase-js";
import type { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  loadDraftStatus,
  loadMemberDraftBundle,
  type DraftStatus,
  type MemberDraftBundle,
} from "@/lib/drafts/drafts.server";
import { logoStoragePathPattern } from "@/lib/media/logo-path";
import { fetchMemberEmail } from "@/lib/members/member-email.server";
import type { PortalRole } from "@/lib/portal/portal-destination";
import type { TypeChangeRequestSummary } from "@/lib/portal/type-change.server";
import type {
  CalendarConnectionRow,
  CategoryRow,
  EventRow,
  MediaAssetRow,
  MemberStatus,
  MemberType,
  UploadTokenRow,
} from "@/lib/supabase/types";

/**
 * The data each profile section's editors start from, as plain server-side
 * loaders that take an ALREADY-RESOLVED member id -- the setup wizard's
 * steps now, the phase 5 portal sections next. Callers resolve the member
 * from the session first (requirePortalMember); nothing here takes a
 * member id from the browser.
 *
 * Every read uses the caller's signed-in session client, so RLS applies
 * exactly as it does on /admin (these are the same queries /admin's route
 * loaders make through listMemberMedia, listEvents, getCalendarConnection
 * and friends -- /admin keeps its own loaders unchanged). The draft comes
 * from loadMemberDraftBundle (ensure_member_draft), the same as
 * getMemberDraft.
 */

type SessionClient = Awaited<ReturnType<typeof getSupabaseServerClientForRequest>>;

/**
 * Who's working on which member, and that member's live state -- what the
 * wizard's layout (/portal/setup) and the portal's layout both start from.
 * The member has already been resolved from the session.
 */
export type PortalMemberShell = {
  memberId: string;
  memberName: string;
  role: PortalRole;
  isImpersonating: boolean;
  memberType: MemberType;
  typeConfirmed: boolean;
  setupCompleted: boolean;
  status: MemberStatus;
  slug: string;
  draftStatus: DraftStatus;
};

export async function loadMemberShell(
  supabase: SessionClient,
  member: { memberId: string; memberName: string; role: PortalRole; isImpersonating: boolean },
): Promise<PortalMemberShell> {
  const [rowResult, draftStatus] = await Promise.all([
    supabase
      .from("members")
      .select("business_name, member_type, status, slug, type_confirmed_at, setup_completed_at")
      .eq("id", member.memberId)
      .maybeSingle(),
    loadDraftStatus(supabase, member.memberId),
  ]);
  if (rowResult.error || !rowResult.data) {
    throw new Error(rowResult.error?.message ?? "Member not found.");
  }
  const row = rowResult.data as {
    business_name: string | null;
    member_type: MemberType;
    status: MemberStatus;
    slug: string;
    type_confirmed_at: string | null;
    setup_completed_at: string | null;
  };
  return {
    memberId: member.memberId,
    memberName: row.business_name?.trim() || member.memberName,
    role: member.role,
    isImpersonating: member.isImpersonating,
    memberType: row.member_type,
    typeConfirmed: row.type_confirmed_at !== null,
    setupCompleted: row.setup_completed_at !== null,
    status: row.status,
    slug: row.slug,
    draftStatus,
  };
}

async function listGallery(supabase: SessionClient, memberId: string): Promise<MediaAssetRow[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("member_id", memberId)
    // Logos aren't gallery photos -- see logoStoragePathPattern.
    .not("storage_path", "like", logoStoragePathPattern(memberId))
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAssetRow[];
}

async function listPending(supabase: SessionClient, memberId: string): Promise<MediaAssetRow[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("member_id", memberId)
    .eq("review_status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAssetRow[];
}

async function listTokens(supabase: SessionClient, memberId: string): Promise<UploadTokenRow[]> {
  const { data, error } = await supabase
    .from("upload_tokens")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as UploadTokenRow[];
}

async function listMemberEvents(supabase: SessionClient, memberId: string): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("member_id", memberId)
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

async function readCalendarConnection(
  supabase: SessionClient,
  memberId: string,
): Promise<CalendarConnectionRow | null> {
  const { data } = await supabase
    .from("calendar_connections")
    .select("*")
    .eq("member_id", memberId)
    .eq("provider", "ics")
    .maybeSingle();
  return (data as CalendarConnectionRow | null) ?? null;
}

/** The LIVE time zone -- what EventsEditor uses on /admin/events too (getMemberBasics). */
async function readLiveTimezone(supabase: SessionClient, memberId: string): Promise<string> {
  const { data, error } = await supabase
    .from("members")
    .select("timezone")
    .eq("id", memberId)
    .single();
  if (error || !data) throw new Error("Member not found.");
  return (data as { timezone: string }).timezone;
}

async function listCategories(supabase: SessionClient): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
}

export type ScheduleData = {
  events: EventRow[];
  memberTimezone: string;
  calendarConnection: CalendarConnectionRow | null;
};

async function loadSchedule(supabase: SessionClient, memberId: string): Promise<ScheduleData> {
  const [events, memberTimezone, calendarConnection] = await Promise.all([
    listMemberEvents(supabase, memberId),
    readLiveTimezone(supabase, memberId),
    readCalendarConnection(supabase, memberId),
  ]);
  return { events, memberTimezone, calendarConnection };
}

/** The basics (name, city, …) -- and anything else that only needs the draft (links, theme). */
export async function loadDraftSection(
  supabase: SessionClient,
  memberId: string,
): Promise<{ draft: MemberDraftBundle }> {
  return { draft: await loadMemberDraftBundle(supabase, memberId) };
}

/** Logo & cover: the draft's logo/cover plus the gallery the cover is picked from. */
export async function loadLogoCoverSection(supabase: SessionClient, memberId: string) {
  const [draft, galleryAssets] = await Promise.all([
    loadMemberDraftBundle(supabase, memberId),
    listGallery(supabase, memberId),
  ]);
  return { draft, galleryAssets };
}

/**
 * When you're open: the draft's hours -- or, for a mobile member, "Where
 * we'll be": their events and calendar link (events aren't drafted).
 */
export async function loadHoursSection(supabase: SessionClient, memberId: string) {
  const draft = await loadMemberDraftBundle(supabase, memberId);
  const schedule =
    draft.member.member_type === "mobile" ? await loadSchedule(supabase, memberId) : null;
  return { draft, schedule };
}

/** Events: the member's events and calendar link (not drafted -- they go live straight away). */
export async function loadEventsSection(
  supabase: SessionClient,
  memberId: string,
): Promise<ScheduleData> {
  return loadSchedule(supabase, memberId);
}

/** Photos & video: slides (draft `media`), the gallery, creator links and the review tray. */
export async function loadPhotosSection(supabase: SessionClient, memberId: string) {
  const [draft, assets, uploadTokens, pending] = await Promise.all([
    loadMemberDraftBundle(supabase, memberId),
    listGallery(supabase, memberId),
    listTokens(supabase, memberId),
    listPending(supabase, memberId),
  ]);
  return { draft, assets, uploadTokens, pending };
}

/** Member discount & supplies: the draft's `discount` section plus the Guild's category list. */
export async function loadDiscountSection(supabase: SessionClient, memberId: string) {
  const [draft, categories] = await Promise.all([
    loadMemberDraftBundle(supabase, memberId),
    listCategories(supabase),
  ]);
  return { draft, categories };
}

/** The member's open "Request a type change", if any (RLS: owner, full editor, Guild admin). */
async function loadOpenTypeChangeRequest(
  supabase: SessionClient,
  memberId: string,
): Promise<TypeChangeRequestSummary | null> {
  const { data } = await supabase
    .from("support_requests")
    .select("requested_member_type, created_at")
    .eq("member_id", memberId)
    .eq("kind", "type_change")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    requestedType: data.requested_member_type as MemberType,
    createdAt: data.created_at as string,
  };
}

/**
 * The portal's Basics & hours: the draft, any open type-change request,
 * and -- only while a Guild admin is editing as them, exactly as on
 * /admin/basics -- the member's sign-in email.
 */
export async function loadBasicsSection(
  supabase: SessionClient,
  service: SupabaseClient,
  member: { memberId: string; isImpersonating: boolean },
) {
  const [draft, typeChangeRequest, email] = await Promise.all([
    loadMemberDraftBundle(supabase, member.memberId),
    loadOpenTypeChangeRequest(supabase, member.memberId),
    member.isImpersonating
      ? fetchMemberEmail(member.memberId, supabase, service).then((r) => r.email)
      : Promise.resolve(null),
  ]);
  return { draft, typeChangeRequest, email };
}

/** What sectionCompleteness needs: the draft plus the live, undrafted events facts. */
export async function loadCompletenessData(supabase: SessionClient, memberId: string) {
  const [draft, eventCountResult, calendarConnection] = await Promise.all([
    loadMemberDraftBundle(supabase, memberId),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("member_id", memberId),
    readCalendarConnection(supabase, memberId),
  ]);
  if (eventCountResult.error) throw new Error(eventCountResult.error.message);
  return {
    draft,
    eventCount: eventCountResult.count ?? 0,
    hasCalendarConnection: calendarConnection !== null,
  };
}
