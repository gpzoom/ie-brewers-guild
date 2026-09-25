import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { normalizeDraftData, type DraftHours, type DraftSpecialHours } from "@/lib/drafts/sections";
import type { MemberStatus, MemberType } from "@/lib/supabase/types";

/** Everything PublishGateDialog renders from -- see getPublishGateData below. */
export type PublishGateData = {
  status: MemberStatus;
  memberType: MemberType;
  slug: string;
  hoursConfirmedAt: string | null;
  /** From the DRAFT: publishing is what puts these hours live, so they're what the member confirms. */
  hours: DraftHours[];
  specialHours: DraftSpecialHours[];
  appearanceStartTimes: string[];
};

/**
 * Assembles everything PublishGateDialog needs in one call, for the admin
 * layout's own loader AND for the dialog itself, which calls it again every
 * time it opens so it never shows hours as of the layout's first load.
 *
 * Phase 2: publishing copies the draft live (publish_member_draft), so the
 * hours read back for the "These hours are correct as of today" tick are
 * the DRAFT's (ensure_member_draft), not the live table's -- confirming the
 * live hours while different draft hours go live would defeat the check.
 * Status, type, slug and the last confirmation stay live facts.
 *
 * appearanceStartTimes deliberately queries ALL of this member's events
 * (events aren't drafted), not filtered by publish status or hidden state --
 * a member who hasn't published yet still needs the "every appearance is in
 * the past" check. It uses the session-bound client, relying on the "events:
 * owners and editors can read their own" RLS policy, since the public
 * events policy requires the member to be published.
 */
export const getPublishGateData = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<PublishGateData> => {
    const supabase = await getSupabaseServerClientForRequest();
    return loadPublishGateData(supabase, data.memberId);
  });

/**
 * getPublishGateData's body as a plain helper, for other server code on
 * the same request (the setup wizard's publish step resolves the member
 * server-side, then reads the same data). Uses the caller's session client.
 */
export async function loadPublishGateData(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClientForRequest>>,
  memberId: string,
): Promise<PublishGateData> {
  const data = { memberId };
  const [memberResult, draftResult, eventsResult] = await Promise.all([
    supabase
      .from("members")
      .select("status, member_type, slug, hours_confirmed_at")
      .eq("id", data.memberId)
      .single(),
    supabase.rpc("ensure_member_draft", { p_member_id: data.memberId }),
    supabase.from("events").select("starts_at").eq("member_id", data.memberId),
  ]);

  if (memberResult.error || !memberResult.data) {
    throw new Error(memberResult.error?.message ?? "Member not found.");
  }
  if (draftResult.error) throw new Error(draftResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const member = memberResult.data as {
    status: MemberStatus;
    member_type: MemberType;
    slug: string;
    hours_confirmed_at: string | null;
  };
  const basics = normalizeDraftData((draftResult.data as { data?: unknown } | null)?.data).basics;

  return {
    status: member.status,
    memberType: member.member_type,
    slug: member.slug,
    hoursConfirmedAt: member.hours_confirmed_at,
    hours: basics.hours,
    specialHours: basics.special_hours,
    appearanceStartTimes: (eventsResult.data ?? []).map((row) => row.starts_at as string),
  };
}
