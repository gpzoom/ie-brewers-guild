import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requirePortalMember } from "@/lib/portal/portal-session.server";
import {
  loadLogoPhotosCoverSection,
  loadMemberShell,
  type PortalMemberShell,
} from "@/lib/portal/section-data.server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { detailsNotifyCutoff, joinFinishKind, shouldNotifyDetails } from "@/lib/join/details-notify";

/**
 * Join the Guild, step 2 (/join/finish): an applicant (status "applied",
 * linked as owner) adds their logo, cover photo, tagline and links to the
 * draft. The member is resolved from the SESSION exactly as /portal does
 * it (requirePortalMember: the impersonation cookie from a Guild admin, or
 * the user's own member_users rows plus the "Choose a business" cookie);
 * the browser never says which member it's working on. The editors save
 * through the same draft functions as the portal, so SQL still decides
 * what the applicant may change.
 *
 * - getJoinFinishState → "form" (with the editors' starting data) for an
 *   applicant, "inactive" for a declined applicant, "not-applicant" for
 *   everyone else (the route sends them to /portal). Signed out → sign-in,
 *   returning here.
 * - markApplicationDone ("I'm done") → emails the Guild inbox at most once
 *   a day per applicant (join_details_notified_at, stamped with the
 *   service-role client -- member sessions can't write it).
 */

export type JoinFinishForm = PortalMemberShell &
  Awaited<ReturnType<typeof loadLogoPhotosCoverSection>> & {
    kind: "form";
    businessName: string;
  };

export type JoinFinishState = JoinFinishForm | { kind: "inactive" } | { kind: "not-applicant" };

const SIGN_IN_HREF = "/signin?next=%2Fjoin%2Ffinish";

export const getJoinFinishState = createServerFn({ method: "GET" }).handler(
  async (): Promise<JoinFinishState> => {
    // Checked here first so a signed-out visitor returns to /join/finish
    // after signing in (requirePortalMember would send them back to /portal).
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw redirect({ href: SIGN_IN_HREF });

    const member = await requirePortalMember();
    const kind = joinFinishKind(member.destination);
    if (kind !== "form") return { kind };

    const [shell, section] = await Promise.all([
      loadMemberShell(supabase, member),
      loadLogoPhotosCoverSection(supabase, member.memberId),
    ]);
    return { ...shell, ...section, kind: "form", businessName: shell.memberName };
  },
);

const DONE_FAILED = "We couldn't send that just now. Try again in a moment.";

export const markApplicationDone = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => {
    if (typeof data?.memberId !== "string" || data.memberId.length === 0 || data.memberId.length > 64) {
      throw new Error(DONE_FAILED);
    }
    return { memberId: data.memberId };
  })
  .handler(async ({ data }): Promise<{ notified: boolean }> => {
    const member = await requirePortalMember();
    // The page names the member it shows; it must still be the session's
    // chosen member, and still an applicant.
    if (member.memberId !== data.memberId || joinFinishKind(member.destination) !== "form") {
      throw new Error("This application isn't open for changes. Reload the page.");
    }
    // A Guild admin "editing as them" doesn't email the Guild about itself.
    if (member.isImpersonating) return { notified: false };

    const service = await getSupabaseServiceRoleClient();
    const { data: row, error } = await service
      .from("members")
      .select("business_name, join_details_notified_at")
      .eq("id", member.memberId)
      .maybeSingle();
    if (error || !row) {
      console.error("markApplicationDone: couldn't read the member", error?.message);
      throw new Error(DONE_FAILED);
    }
    const previous = (row.join_details_notified_at as string | null) ?? null;
    const now = new Date();
    if (!shouldNotifyDetails(previous, now)) return { notified: false };

    // Conditional stamp: only one of two quick clicks (or two tabs) wins.
    const { data: stamped, error: stampError } = await service
      .from("members")
      .update({ join_details_notified_at: now.toISOString() })
      .eq("id", member.memberId)
      .eq("status", "applied")
      .or(`join_details_notified_at.is.null,join_details_notified_at.lte.${detailsNotifyCutoff(now)}`)
      .select("id");
    if (stampError) {
      console.error("markApplicationDone: couldn't stamp join_details_notified_at", stampError.message);
      throw new Error(DONE_FAILED);
    }
    if (!stamped || stamped.length === 0) return { notified: false };

    const businessName = (row.business_name as string | null)?.trim() || member.memberName;
    try {
      await sendTransactionalEmail({
        trigger: "application_details_added",
        memberId: member.memberId,
        businessName,
      });
      return { notified: true };
    } catch (err) {
      console.error(
        "markApplicationDone: application_details_added email failed",
        err instanceof Error ? err.message : String(err),
      );
      // Put the old stamp back so the next "I'm done" can try again today.
      const { error: undoError } = await service
        .from("members")
        .update({ join_details_notified_at: previous })
        .eq("id", member.memberId);
      if (undoError) console.error("markApplicationDone: couldn't undo the stamp", undoError.message);
      return { notified: false };
    }
  });
