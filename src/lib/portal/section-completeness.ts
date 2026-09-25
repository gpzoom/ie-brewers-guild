import type { MemberDraftData } from "@/lib/drafts/sections";
import type { MemberType } from "@/lib/supabase/types";
import { isStepForType, stepLabel, type NumberedSetupStep } from "@/lib/portal/wizard-steps";

/**
 * Which parts of a member's profile are filled in and which are still
 * empty -- the wizard's Review checklist and (phase 5) the portal's
 * "Finish your profile" card both read this one function, so they can't
 * drift from each other or from the real profile (docs/member-profiles.md:
 * "Whether a step is done is worked out from whether its data is empty").
 * Pure: the caller passes the DRAFT (what's being built) plus the few
 * live facts that aren't drafted -- the member type and its confirmation,
 * and events, which go live straight away and so aren't in the draft.
 *
 * "Done" means "not empty", not "complete": one logo or one link counts.
 * The theme can't be empty (every profile has one; skipping keeps Amber),
 * so it always counts as done.
 */

export type CompletenessMember = {
  memberType: MemberType;
  typeConfirmed: boolean;
  /** How many events the member has (hand-entered or synced), hidden or not. */
  eventCount: number;
  /** A calendar subscription link is connected. */
  hasCalendarConnection: boolean;
};

/** The steps the checklist lists: every numbered step except Welcome, which holds no data. */
export type CompletenessStep = Exclude<NumberedSetupStep, "welcome">;

export type SectionCompleteness = {
  step: CompletenessStep;
  label: string;
  done: boolean;
};

const CHECKLIST_STEPS: CompletenessStep[] = [
  "type",
  "basics",
  "logo-cover",
  "hours",
  "events",
  "photos",
  "links",
  "discount",
  "theme",
];

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function isStepDone(
  step: CompletenessStep,
  draft: MemberDraftData,
  member: CompletenessMember,
): boolean {
  const { basics } = draft;
  const hasSchedule = member.eventCount > 0 || member.hasCalendarConnection;
  switch (step) {
    case "type":
      return member.typeConfirmed;
    case "basics":
      return hasText(basics.business_name) && hasText(basics.city);
    case "logo-cover":
      return basics.logo_asset_id !== null || basics.cover_asset_id !== null;
    case "hours":
      // Mobile members' step 5 is "Where we'll be": the calendar or dates by hand.
      return member.memberType === "mobile" ? hasSchedule : basics.hours.length > 0;
    case "events":
      return hasSchedule;
    case "photos":
      return draft.media.slides.length > 0;
    case "links":
      return draft.links.links.some((link) => hasText(link.url));
    case "discount": {
      const d = draft.discount;
      return (
        d.discount_percent !== null ||
        d.discount_no_fixed_percent ||
        hasText(d.discount_redeem_text) ||
        d.category_ids.length > 0
      );
    }
    case "theme":
      return true;
  }
}

/** The checklist for this member's type, in step order. */
export function sectionCompleteness(
  draft: MemberDraftData,
  member: CompletenessMember,
): SectionCompleteness[] {
  return CHECKLIST_STEPS.filter((step) => isStepForType(step, member.memberType)).map((step) => ({
    step,
    label: stepLabel(step, member.memberType),
    done: isStepDone(step, draft, member),
  }));
}

/** Just the empty ones -- what a "Finish your profile" card lists. */
export function emptySections(
  draft: MemberDraftData,
  member: CompletenessMember,
): SectionCompleteness[] {
  return sectionCompleteness(draft, member).filter((section) => !section.done);
}
