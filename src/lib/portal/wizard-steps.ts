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
 *   1   welcome      yes       yes     yes     (Get started confirms the type)
 *   2   basics       yes       yes     yes
 *   3   logo-cover   yes       yes     yes     (Logo, Photos & Cover)
 *   4   hours        hours     "Where we'll be" (calendar + hand entry)
 *   5   events       yes       --      yes     (mobile: step 4 covered it)
 *   6   links        yes       yes     yes
 *   7   discount     --        --      yes
 *   8   theme        yes       yes     yes     (Pick your theme)
 *
 * Producers see 7, mobile members 6, Affiliate Members 8. The old Photos step
 * is part of step 3 since the redesign (2026-10-02). There is no "Confirm
 * your member type" step any more (owner, 2026-10-17): the Guild always
 * chooses the type, and Welcome's Get started confirms it. An old
 * /portal/setup/type link redirects (resolveSetupAccess).
 *
 * After the numbered steps come the finish screens, which have no number:
 * review -> preview -> publish (the publish check) -> live ("You're live").
 *
 * Short setup (Part 4, artboard BZ3): a one-manager business's other
 * locations, once one location is set up, share its look and its confirmed
 * type, so Welcome and Pick your theme drop out -- a producer
 * walks basics, logo-cover, hours, events, links ("Step 1 of 5"). Every
 * helper below takes an optional trailing `{ shortSetup }`; without it the
 * results are the full wizard's.
 */

export type SetupStepOptions = { shortSetup?: boolean };

/** The steps short setup leaves out: the business already chose these. */
const SHORT_SETUP_OMITTED: readonly SetupStepName[] = ["welcome", "theme"];

export const NUMBERED_SETUP_STEPS = [
  "welcome",
  "basics",
  "logo-cover",
  "hours",
  "events",
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

/**
 * Steps 1-2 of the full wizard: the only required ones. The list is the
 * full wizard's whatever the options. Short setup drops Welcome, so there
 * The basics is the only required step left.
 */
export const REQUIRED_SETUP_STEPS: readonly NumberedSetupStep[] = ["welcome", "basics"];

/** Whether this member type sees the step at all. */
export function isStepForType(
  step: SetupStepName,
  memberType: MemberType,
  options: SetupStepOptions = {},
): boolean {
  if (options.shortSetup && SHORT_SETUP_OMITTED.includes(step)) return false;
  if (step === "events") return memberType !== "mobile";
  if (step === "discount") return memberType === "allied";
  return true;
}

/** The numbered steps this member type sees, in order. */
export function numberedStepsForType(
  memberType: MemberType,
  options: SetupStepOptions = {},
): NumberedSetupStep[] {
  return NUMBERED_SETUP_STEPS.filter((step) => isStepForType(step, memberType, options));
}

/** Every step this member type walks through, numbered steps then the finish screens. */
export function allStepsForType(
  memberType: MemberType,
  options: SetupStepOptions = {},
): SetupStepName[] {
  return [...numberedStepsForType(memberType, options), ...FINISH_SETUP_STEPS];
}

/** "Step N of M" for a numbered step; null for the finish screens or a step the type doesn't see. */
export function stepPosition(
  step: SetupStepName,
  memberType: MemberType,
  options: SetupStepOptions = {},
): { number: number; total: number } | null {
  const steps = numberedStepsForType(memberType, options);
  const index = (steps as SetupStepName[]).indexOf(step);
  if (index === -1) return null;
  return { number: index + 1, total: steps.length };
}

export function nextStep(
  step: SetupStepName,
  memberType: MemberType,
  options: SetupStepOptions = {},
): SetupStepName | null {
  const steps = allStepsForType(memberType, options);
  const index = steps.indexOf(step);
  if (index === -1) return firstStepAfter(step, memberType, options);
  return steps[index + 1] ?? null;
}

export function previousStep(
  step: SetupStepName,
  memberType: MemberType,
  options: SetupStepOptions = {},
): SetupStepName | null {
  const steps = allStepsForType(memberType, options);
  const index = steps.indexOf(step);
  if (index <= 0) return null;
  return steps[index - 1];
}

/**
 * For a step this type doesn't see (a mobile member on /events, a producer
 * on /discount): the first step after it in the canonical order that the
 * type does see.
 */
function firstStepAfter(
  step: SetupStepName,
  memberType: MemberType,
  options: SetupStepOptions = {},
): SetupStepName | null {
  const index = ALL_SETUP_STEPS.indexOf(step);
  for (let i = index + 1; i < ALL_SETUP_STEPS.length; i++) {
    if (isStepForType(ALL_SETUP_STEPS[i], memberType, options)) return ALL_SETUP_STEPS[i];
  }
  return null;
}

/** Short names, for the Review checklist and the progress line. */
export const SETUP_STEP_LABELS: Record<SetupStepName, string> = {
  welcome: "Welcome",
  basics: "The basics",
  "logo-cover": "Logo, Photos & Cover",
  hours: "When you're open",
  events: "Events",
  links: "Links",
  discount: "Member discount & supplies",
  theme: "Pick your theme",
  review: "Review",
  preview: "Preview",
  publish: "Publish",
  live: "You're live",
};

/** Step 4's name depends on the type: mobile members list where they'll be, not hours. */
export function stepLabel(
  step: SetupStepName,
  memberType: MemberType,
  // Same in short setup; taken so every step helper has the one signature.
  _options: SetupStepOptions = {},
): string {
  if (step === "hours" && memberType === "mobile") return "Where we'll be";
  return SETUP_STEP_LABELS[step];
}

/**
 * Whether "Skip for now" is offered: every step but Welcome and The
 * basics (and the finish screens). The same in short setup: The basics,
 * its first step, stays required.
 */
export function canSkipStep(step: SetupStepName, _options: SetupStepOptions = {}): boolean {
  return step !== "basics" && step !== "welcome" && !isFinishStep(step);
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
 * - The retired Photos step -> Logo, Photos & Cover.
 * - The retired Confirm type step ("type", an old link): Welcome while the
 *   type is unconfirmed, else The basics.
 * - While setup is incomplete (type not confirmed, or Continue on The
 *   basics never clicked): Welcome is always open; The basics needs the
 *   type confirmed first (Welcome's Get started confirms it); anything
 *   later goes back to the first of steps 1-2 that isn't done (Welcome
 *   while the type is unconfirmed -- same as /portal -- else The basics).
 * - Once setup is complete: every step stays open, so Back always works
 *   (redesign, 2026-10-02). "The wizard is never shown again" holds
 *   because /portal never routes into it (portal-destination), not
 *   because these steps redirect.
 * - Short setup: Welcome and Pick your theme go to The basics, which is
 *   the first incomplete step. (An unconfirmed type is confirmed when
 *   setup is entered -- getPortalSetupShell.)
 */
export function resolveSetupAccess(
  input: {
    step: string;
    memberType: MemberType;
    role: PortalRole;
    typeConfirmed: boolean;
    setupCompleted: boolean;
  },
  options: SetupStepOptions = {},
): SetupAccess {
  if (input.role === "media_events") return { kind: "portal" };
  // The old Photos step is part of step 4 now (redesign, 2026-10-02).
  if (input.step === "photos") return { kind: "step", step: "logo-cover" };

  const inSetup = !input.typeConfirmed || !input.setupCompleted;
  const short = Boolean(options.shortSetup);
  const firstIncomplete: SetupStepName = input.typeConfirmed || short ? "basics" : "welcome";

  // The retired Confirm type step: an old link or bookmark.
  if (input.step === "type") return { kind: "step", step: firstIncomplete };

  if (!isSetupStepName(input.step)) {
    return inSetup ? { kind: "step", step: firstIncomplete } : { kind: "portal" };
  }
  const step = input.step;

  if (short && SHORT_SETUP_OMITTED.includes(step)) {
    return { kind: "step", step: firstIncomplete };
  }

  if (!isStepForType(step, input.memberType, options)) {
    const next = firstStepAfter(step, input.memberType, options);
    return next ? { kind: "step", step: next } : { kind: "portal" };
  }

  if (!inSetup) return { kind: "ok" };

  switch (step) {
    case "welcome":
      return { kind: "ok" };
    case "basics":
      // Short setup confirms the type on entry, so it never waits on Welcome.
      return input.typeConfirmed || short ? { kind: "ok" } : { kind: "step", step: "welcome" };
    default:
      return { kind: "step", step: firstIncomplete };
  }
}
