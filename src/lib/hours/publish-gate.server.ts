import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { fetchMemberHoursAndSpecialHours } from "@/lib/hours/hours-editor.server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { HoursRow, MemberStatus, MemberType, SpecialHoursRow } from "@/lib/supabase/types";

/** Everything PublishGateDialog renders from -- see getPublishGateData below. */
export type PublishGateData = {
  status: MemberStatus;
  memberType: MemberType;
  slug: string;
  hoursConfirmedAt: string | null;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
  appearanceStartTimes: string[];
};

/**
 * Sets status AND hours_confirmed_at together, in one update (spec: "Set it
 * to now whenever the member ticks the confirmation box and publishes").
 * The members_enforce_owner_write_limits trigger permits draft<->published
 * for a non-guild-admin, so this needs no special privilege.
 *
 * .select("id") + row-count check -- PostgREST reports an RLS-denied
 * update as success with zero rows affected, not as an `error` (same
 * gotcha member-basics.server.ts/hours-editor.server.ts/cover.server.ts
 * all guard against). Without this, a write blocked by RLS would silently
 * report success back to the dialog's UI.
 */
export const publishMemberProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ status: "published", hours_confirmed_at: now })
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Publish failed -- you may not have permission to edit this member.");
    }

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { publishedAt: now };
  });

/** Beyond the spec's explicit ask (this plan's Decision 20) -- lets a member take their page temporarily offline. */
export const unpublishMemberProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ status: "draft" })
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed -- you may not have permission to edit this member.");
    }

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { ok: true as const };
  });

/**
 * Assembles everything PublishGateDialog needs in one call, for the admin
 * layout's own loader (Task 23 Step 3) AND for the dialog itself, which
 * calls it again every time it opens so it never shows hours as of the
 * admin layout's first load (the hours editor saves without re-running
 * that loader): member status/type/slug/
 * hours_confirmed_at, the same hours + special_hours listHours reads (via
 * the shared fetchMemberHoursAndSpecialHours helper -- not by calling
 * listHours itself as a createServerFn from inside this handler's body,
 * which would trigger an unwanted internal round-trip), and every one of
 * this member's event start times.
 *
 * appearanceStartTimes deliberately queries ALL of this member's events,
 * not filtered by publish status or hidden state -- a member who hasn't
 * published yet still needs the "every appearance is in the past" check to
 * work correctly. Their events wouldn't be visible via the PUBLIC events
 * RLS policy (which requires the owning member's status = 'published'),
 * so this uses the session-bound getSupabaseServerClientForRequest()
 * client, relying on the separate "events: owners and editors can read
 * their own" RLS policy (supabase/migrations/20260922040751_
 * calendar_events_tables.sql) -- NOT src/lib/members/member-profile.
 * server.ts's public-reader logic, which is for a different,
 * publish-status-gated context and would return nothing for a draft
 * member.
 */
export const getPublishGateData = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<PublishGateData> => {
    const supabase = await getSupabaseServerClientForRequest();

    const [memberResult, hoursResult, eventsResult] = await Promise.all([
      supabase
        .from("members")
        .select("status, member_type, slug, hours_confirmed_at")
        .eq("id", data.memberId)
        .single(),
      fetchMemberHoursAndSpecialHours(supabase, data.memberId),
      supabase.from("events").select("starts_at").eq("member_id", data.memberId),
    ]);

    if (memberResult.error || !memberResult.data) {
      throw new Error(memberResult.error?.message ?? "Member not found.");
    }
    if (eventsResult.error) throw new Error(eventsResult.error.message);

    const member = memberResult.data as {
      status: MemberStatus;
      member_type: MemberType;
      slug: string;
      hours_confirmed_at: string | null;
    };

    return {
      status: member.status,
      memberType: member.member_type,
      slug: member.slug,
      hoursConfirmedAt: member.hours_confirmed_at,
      hours: hoursResult.hours,
      specialHours: hoursResult.specialHours,
      appearanceStartTimes: (eventsResult.data ?? []).map((row) => row.starts_at as string),
    };
  });
