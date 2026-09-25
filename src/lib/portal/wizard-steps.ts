import type { MemberType } from "@/lib/supabase/types";
import type { PortalRole } from "@/lib/portal/portal-destination";

/**
 * The setup wizard's steps (docs/member-profiles.md, "Wizard steps"; plan
 * phase 4). Pure -- no server or React imports -- so the /portal/setup
 * routes, the chrome and the tests share one definition.
 *
 * URLs use step NAMES, not numbers, so type-specific steps never renumber
 * a URL. "Step N of M" counts only the numbered steps the member's type
 * sees:
 *
 *   #   step         producer  mobile  allied
 *   1   welcome      yes       yes     yes
 *   2   type         yes       yes     yes
 *   3   basics       yes       yes     yes
 *   4   logo-cover   yes       yes     yes
 *   5   hours        hours     "Where we'll be" (calendar + hand entry)
 *   6   events       yes       --      yes     (mobile: step 5 covered it)
 *   7   photos       yes       yes     yes
 *   8   links        yes       yes     yes
 *   9   discount     --        --      yes
 *   10  theme        yes       yes     yes
 *
 * After the numbered steps come the finish screens, which have no number:
 * review -> preview -> publish (the publish check) -> live ("You're live").
 */

export const NUMBERED_SETUP_STEPS = [
  "welcome",
  "type",
  "basics",
  "logo-cover",
  "hours",
  "events",
  "photos",
  "links",
  "discount",
  "theme",
] as const;
export type NumberedSetupStep = (typeof NUMBERED_SETUP_STEPS)[number];

export const FINISH_SETUP_STEPS = ["review", "preview", "publish", "live"] as const;
export type FinishSetupStep = (typeof FINISH_SETUP_STEPS)[number];

export type SetupStepName = NumberedSetupStep | FinishSetupStep;

const ALL_SETUP_STEPS: readonly SetupStepName[] = [...NUMBERED_SETUP_STEPS, ...FINISH_SETUP_STEPS];

export function isSetupStepName(value: unknown): value is SetupStepName {
  return typeof value === "string" && (ALL_SETUP_STEPS as readonly string[]).includes(value);
}

/** Steps 1-3: the only required ones. */
export const REQUIRED_SETUP_STEPS: readonly NumberedSetupStep[] = ["welcome", "type", "basics"];

/** Whether this member type sees the step at all. */
export function isStepForType(step: SetupStepName, memberType: MemberType): boolean {
  if (step === "events") return memberType !== "mobile";
  if (step === "discount") return memberType === "allied";
  return true;
}

/** The numbered steps this member type sees, in order. */
export function numberedStepsForType(memberType: MemberType): NumberedSetupStep[] {
  return NUMBERED_SETUP_STEPS.filter((step) => isStepForType(step, memberType));
}

/** Every step this member type walks through, numbered steps then the finish screens. */
export function allStepsForType(memberType: MemberType): SetupStepName[] {
  return [...numberedStepsForType(memberType), ...FINISH_SETUP_STEPS];
}

/** "Step N of M" for a numbered step; null for the finish screens or a step the type doesn't see. */
export function stepPosition(
  step: SetupStepName,
  memberType: MemberType,
): { number: number; total: number } | null {
  const steps = numberedStepsForType(memberType);
  const index = (steps as SetupStepName[]).indexOf(step);
  if (index === -1) return null;
  return { number: index + 1, total: steps.length };
}

export function nextStep(step: SetupStepName, memberType: MemberType): SetupStepName | null {
  const steps = allStepsForType(memberType);
  const index = steps.indexOf(step);
  if (index === -1) return firstStepAfter(step, memberType);
  return steps[index + 1] ?? null;
}

export function previousStep(step: SetupStepName, memberType: MemberType): SetupStepName | null {
  const steps = allStepsForType(memberType);
  const index = steps.indexOf(step);
  if (index <= 0) return null;
  return steps[index - 1];
}

/**
 * For a step this type doesn't see (a mobile member on /events, a producer
 * on /discount): the first step after it in the canonical order that the
 * type does see.
 */
function firstStepAfter(step: SetupStepName, memberType: MemberType): SetupStepName | null {
  const index = ALL_SETUP_STEPS.indexOf(step);
  for (let i = index + 1; i < ALL_SETUP_STEPS.length; i++) {
    if (isStepForType(ALL_SETUP_STEPS[i], memberType)) return ALL_SETUP_STEPS[i];
  }
  return null;
}

/** Short names, for the Review checklist and the progress line. */
export const SETUP_STEP_LABELS: Record<SetupStepName, string> = {
  welcome: "Welcome",
  type: "Member type",
  basics: "The basics",
  "logo-cover": "Logo & cover",
  hours: "When you're open",
  events: "Events",
  photos: "Photos & video",
  links: "Links",
  discount: "Member discount & supplies",
  theme: "Pick your color",
  review: "Review",
  preview: "Preview",
  publish: "Publish",
  live: "You're live",
};

/** Step 5's name depends on the type: mobile members list where they'll be, not hours. */
export function stepLabel(step: SetupStepName, memberType: MemberType): string {
  if (step === "hours" && memberType === "mobile") return "Where we'll be";
  return SETUP_STEP_LABELS[step];
}

/** Whether "Skip for now" is offered: every step but Confirm type and The basics (and the finish screens). */
export function canSkipStep(step: SetupStepName): boolean {
  return step !== "type" && step !== "basics" && step !== "welcome" && !isFinishStep(step);
}

export function isFinishStep(step: SetupStepName): step is FinishSetupStep {
  return (FINISH_SETUP_STEPS as readonly string[]).includes(step);
}

export type SetupAccess =
  | { kind: "ok" }
  /** Go to another wizard step. */
  | { kind: "step"; step: SetupStepName }
  /** Leave the wizard for /portal. */
  | { kind: "portal" };

/**
 * Who may open which wizard step (the "Wizard or portal: one rule",
 * docs/member-profiles.md, plus the plan's phase 4 gatekeeping). Pure, so
 * the route's beforeLoad and the tests use the same rule:
 *
 * - A Photos & events editor never sees the wizard -> /portal.
 * - Unknown step name -> wherever /portal would start them.
 * - A step the member's type doesn't see -> the next step it does see.
 * - While setup is incomplete (type not confirmed, or Continue on The
 *   basics never clicked): Welcome is always open; Confirm type is open
 *   until the type is confirmed, then it skips to The basics; The basics
 *   needs the type confirmed first; anything later goes back to the first
 *   of steps 1-3 that isn't done (Welcome while the type is unconfirmed --
 *   same as /portal -- else The basics).
 * - Once setup is complete: steps 1-3 go to /portal ("the wizard is never
 *   shown again" -- /portal never routes into it). Steps 4-10 and the
 *   finish screens stay open: the wizard carries straight on after The
 *   basics in the same visit, and Review's "Do it now" links reach them.
 */
export function resolveSetupAccess(input: {
  step: string;
  memberType: MemberType;
  role: PortalRole;
  typeConfirmed: boolean;
  setupCompleted: boolean;
}): SetupAccess {
  if (input.role === "media_events") return { kind: "portal" };

  const inSetup = !input.typeConfirmed || !input.setupCompleted;
  const firstIncomplete: SetupStepName = input.typeConfirmed ? "basics" : "welcome";

  if (!isSetupStepName(input.step)) {
    return inSetup ? { kind: "step", step: firstIncomplete } : { kind: "portal" };
  }
  const step = input.step;

  if (!isStepForType(step, input.memberType)) {
    const next = firstStepAfter(step, input.memberType);
    return next ? { kind: "step", step: next } : { kind: "portal" };
  }

  if (!inSetup) {
    return (REQUIRED_SETUP_STEPS as readonly string[]).includes(step)
      ? { kind: "portal" }
      : { kind: "ok" };
  }

  switch (step) {
    case "welcome":
      return { kind: "ok" };
    case "type":
      return input.typeConfirmed ? { kind: "step", step: "basics" } : { kind: "ok" };
    case "basics":
      return input.typeConfirmed ? { kind: "ok" } : { kind: "step", step: "type" };
    default:
      return { kind: "step", step: firstIncomplete };
  }
}
