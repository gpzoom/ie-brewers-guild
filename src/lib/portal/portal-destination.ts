/**
 * The "Wizard or portal: one rule" (docs/member-profiles.md): a member is in
 * setup until BOTH type_confirmed_at and setup_completed_at are set. Until
 * then /portal opens the wizard at the first of steps 1-2 that isn't done;
 * after that it always opens the portal. A Photos & events editor
 * (media_events) never sees the wizard, even while setup isn't done.
 *
 * Which of steps 1-2, kept deliberately simple -- nothing records that
 * someone has seen Welcome:
 *  - type not confirmed → "welcome" (its Get started button confirms the
 *    type, so resuming there costs one click);
 *  - type confirmed, setup not completed → "basics" (step 2).
 * setup_completed_at can only be set after the type is confirmed
 * (complete_member_setup requires it), so "type not confirmed but setup
 * completed" can't happen through the app; if it ever did, the member is
 * still in setup by the rule above and goes to "welcome".
 *
 * Join the Guild (2026-11-15) comes first, for every role: an applicant
 * (status "applied") goes to /join/finish -- the wizard's SQL refuses an
 * applied member (confirm_member_type, complete_member_setup) -- and a
 * declined applicant gets "Your application isn't active" instead of
 * anything editable.
 */
import type { MemberStatus } from "@/lib/supabase/types";

export type PortalRole = "owner" | "co_owner" | "editor" | "media_events";

export type WizardStepName = "welcome" | "basics";

export type PortalDestination =
  | { kind: "wizard"; step: WizardStepName }
  | { kind: "portal" }
  | { kind: "join-finish" }
  | { kind: "inactive" };

export function resolvePortalDestination(input: {
  typeConfirmedAt: string | null;
  setupCompletedAt: string | null;
  role: PortalRole;
  status: MemberStatus;
}): PortalDestination {
  if (input.status === "applied") return { kind: "join-finish" };
  if (input.status === "declined") return { kind: "inactive" };
  if (input.role === "media_events") return { kind: "portal" };
  if (!input.typeConfirmedAt) return { kind: "wizard", step: "welcome" };
  if (!input.setupCompletedAt) return { kind: "wizard", step: "basics" };
  return { kind: "portal" };
}

export function isPortalRole(value: unknown): value is PortalRole {
  return value === "owner" || value === "co_owner" || value === "editor" || value === "media_events";
}

/** The owner and a co-owner: the two roles with owner-level rights on a location. */
export function isOwnerLevel(role: string | null | undefined): boolean {
  return role === "owner" || role === "co_owner";
}
