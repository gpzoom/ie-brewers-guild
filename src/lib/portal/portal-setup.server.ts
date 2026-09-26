import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { requirePortalMember, type PortalMember } from "@/lib/portal/portal-session.server";
import { loadDraftStatus, type DraftStatus } from "@/lib/drafts/drafts.server";
import { loadPublishGateData } from "@/lib/hours/publish-gate.server";
import { loadMemberPreviewData } from "@/lib/members/member-profile.server";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  loadCompletenessData,
  loadDiscountSection,
  loadDraftSection,
  loadEventsSection,
  loadHoursSection,
  loadLogoCoverSection,
  loadMemberShell,
  loadPhotosSection,
  type PortalMemberShell,
} from "@/lib/portal/section-data.server";
import { isSetupStepName, type SetupStepName } from "@/lib/portal/wizard-steps";
import type { MemberType } from "@/lib/supabase/types";

/**
 * The setup wizard's server side (plan phase 4). Every function here
 * resolves the member from the SESSION with requirePortalMember -- the
 * browser never says which member it's working on -- and then reads or
 * writes through the signed-in session client, so the SQL functions and
 * RLS still make the real permission decisions (confirm_member_type and
 * complete_member_setup allow only the owner, a full editor or a Guild
 * admin; the draft functions check the role per section).
 *
 * A Photos & events editor never gets the wizard: they're sent to /portal.
 */

async function requireWizardMember(): Promise<PortalMember> {
  const member = await requirePortalMember();
  if (member.role === "media_events") {
    throw redirect({ href: "/portal" });
  }
  return member;
}

export type PortalSetupShell = PortalMemberShell;

/**
 * The /portal/setup layout's beforeLoad: who's signed in, which business,
 * their role, the member's type and setup state (for the step gatekeeping
 * and the "Step N of M" line), and the draft status for the save/publish
 * UI. Runs on every navigation inside the wizard, so a removed link or an
 * ended impersonation takes effect on the next step.
 */
export const getPortalSetupShell = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortalSetupShell> => {
    const member = await requireWizardMember();
    const supabase = await getSupabaseServerClientForRequest();
    return loadMemberShell(supabase, member);
  },
);

/** What one wizard step's editors start from. */
export type SetupStepData =
  | { step: "welcome" | "type" | "live" }
  | ({ step: "basics" | "links" | "theme" } & Awaited<ReturnType<typeof loadDraftSection>>)
  | ({ step: "logo-cover" } & Awaited<ReturnType<typeof loadLogoCoverSection>>)
  | ({ step: "hours" } & Awaited<ReturnType<typeof loadHoursSection>>)
  | ({ step: "events" } & Awaited<ReturnType<typeof loadEventsSection>>)
  | ({ step: "photos" } & Awaited<ReturnType<typeof loadPhotosSection>>)
  | ({ step: "discount" } & Awaited<ReturnType<typeof loadDiscountSection>>)
  | ({ step: "review" } & Awaited<ReturnType<typeof loadCompletenessData>>)
  | ({ step: "preview" } & Awaited<ReturnType<typeof loadMemberPreviewData>>)
  | {
      step: "publish";
      gate: Awaited<ReturnType<typeof loadPublishGateData>>;
      draftStatus: DraftStatus;
    };

/**
 * One wizard step's data, for the member resolved from the session. Only
 * the step name comes from the browser.
 */
export const getPortalStepData = createServerFn({ method: "GET" })
  .inputValidator((data: { step: string }) => {
    if (!isSetupStepName(data?.step)) throw new Error("Unknown setup step.");
    return { step: data.step as SetupStepName };
  })
  .handler(async ({ data }): Promise<SetupStepData> => {
    const member = await requireWizardMember();
    const supabase = await getSupabaseServerClientForRequest();
    const id = member.memberId;
    switch (data.step) {
      case "welcome":
      case "type":
      case "live":
        return { step: data.step };
      case "basics":
      case "links":
      case "theme":
        return { step: data.step, ...(await loadDraftSection(supabase, id)) };
      case "logo-cover":
        return { step: "logo-cover", ...(await loadLogoCoverSection(supabase, id)) };
      case "hours":
        return { step: "hours", ...(await loadHoursSection(supabase, id)) };
      case "events":
        return { step: "events", ...(await loadEventsSection(supabase, id)) };
      case "photos":
        return { step: "photos", ...(await loadPhotosSection(supabase, id)) };
      case "discount":
        return { step: "discount", ...(await loadDiscountSection(supabase, id)) };
      case "review":
        return { step: "review", ...(await loadCompletenessData(supabase, id)) };
      case "preview":
        return { step: "preview", ...(await loadMemberPreviewData(id)) };
      case "publish": {
        const [gate, draftStatus] = await Promise.all([
          loadPublishGateData(supabase, id),
          loadDraftStatus(supabase, id),
        ]);
        return { step: "publish", gate, draftStatus };
      }
    }
  });

const MEMBER_TYPES: readonly MemberType[] = ["producer", "mobile", "allied"];

/**
 * Wizard step 2, "Yes, that's us" or a different type picked under
 * "That's not right". confirm_member_type sets the type, stamps who
 * confirmed it and when, locks it for the member, and writes the audit row
 * against the real actor (even a Guild admin editing as them). If the type
 * changed, the Guild gets an email -- a failed send is logged, never
 * undoes the confirmation.
 */
export const confirmPortalMemberType = createServerFn({ method: "POST" })
  .inputValidator((data: { memberType: MemberType }) => {
    if (!MEMBER_TYPES.includes(data?.memberType)) throw new Error("Choose a member type.");
    return { memberType: data.memberType };
  })
  .handler(async ({ data }) => {
    const member = await requireWizardMember();
    const supabase = await getSupabaseServerClientForRequest();
    const { data: result, error } = await supabase.rpc("confirm_member_type", {
      p_member_id: member.memberId,
      p_new_type: data.memberType,
    });
    if (error || !result)
      throw new Error(error?.message || "Couldn't confirm your type — try again.");
    const parsed = result as { old_type: MemberType; new_type: MemberType; changed: boolean };

    if (parsed.changed) {
      try {
        await sendTransactionalEmail({
          trigger: "member_type_changed_in_setup",
          memberId: member.memberId,
          memberName: member.memberName,
          oldType: parsed.old_type,
          newType: parsed.new_type,
        });
      } catch (err) {
        console.error("confirmPortalMemberType: couldn't email the Guild about a type change", err);
      }
    }
    return { memberType: parsed.new_type, changed: parsed.changed };
  });

/**
 * Wizard step 3's Continue: complete_member_setup checks the type is
 * confirmed and the DRAFT has a business name and city, then sets
 * setup_completed_at once. Its error messages are written for people
 * ("Add your city to continue.") and are passed straight through.
 */
export const completePortalSetup = createServerFn({ method: "POST" }).handler(async () => {
  const member = await requireWizardMember();
  const supabase = await getSupabaseServerClientForRequest();
  const { error } = await supabase.rpc("complete_member_setup", { p_member_id: member.memberId });
  if (error) throw new Error(error.message || "Couldn't finish setup — try again.");
  return { ok: true as const };
});
