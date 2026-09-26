import type { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { loadMemberDraftBundle, type MemberDraftBundle } from "@/lib/drafts/drafts.server";
import { logoStoragePathPattern } from "@/lib/media/logo-path";
import type {
  CalendarConnectionRow,
  CategoryRow,
  EventRow,
  MediaAssetRow,
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
