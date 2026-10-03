/**
 * The "Wizard or portal: one rule" (docs/member-profiles.md): a member is in
 * setup until BOTH type_confirmed_at and setup_completed_at are set. Until
 * then /portal opens the wizard at the first of steps 1-3 that isn't done;
 * after that it always opens the portal. A Photos & events editor
 * (media_events) never sees the wizard, even while setup isn't done.
 *
 * Which of steps 1-3, kept deliberately simple -- nothing records that
 * someone has seen Welcome:
 *  - type not confirmed → "welcome" (step 1 leads straight into step 2,
 *    Confirm your member type, so resuming there costs one click);
 *  - type confirmed, setup not completed → "basics" (step 3).
 * setup_completed_at can only be set after the type is confirmed
 * (complete_member_setup requires it), so "type not confirmed but setup
 * completed" can't happen through the app; if it ever did, the member is
 * still in setup by the rule above and goes to "welcome".
 *
 * "type" is part of the return type for the phase 4 wizard, which links to
 * it directly; this function never picks it.
 */
export type PortalRole = "owner" | "editor" | "media_events";

export type WizardStepName = "welcome" | "type" | "basics";

export type PortalDestination = { kind: "wizard"; step: WizardStepName } | { kind: "portal" };

export function resolvePortalDestination(input: {
  typeConfirmedAt: string | null;
  setupCompletedAt: string | null;
  role: PortalRole;
}): PortalDestination {
  if (input.role === "media_events") return { kind: "portal" };
  if (!input.typeConfirmedAt) return { kind: "wizard", step: "welcome" };
  if (!input.setupCompletedAt) return { kind: "wizard", step: "basics" };
  return { kind: "portal" };
}

export function isPortalRole(value: unknown): value is PortalRole {
  return value === "owner" || value === "editor" || value === "media_events";
}
