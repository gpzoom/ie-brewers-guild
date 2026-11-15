import type { PortalDestination } from "@/lib/portal/portal-destination";
import type { MemberStatus } from "@/lib/supabase/types";

/**
 * Join the Guild: an applicant (status "applied") or a declined applicant
 * may only use /join/finish. Every member-side action outside it that
 * could reach other people or the Guild -- People (invites send email from
 * the Guild's domain), type-change requests -- refuses them with this
 * check, server-side, whatever the browser calls.
 */

export const APPLICATION_NOT_ACTIVE_MESSAGE =
  "This isn't available while your application is being reviewed.";

/** Throws a friendly error for an applicant or a declined applicant. */
export function assertActiveMember(member: { destination: PortalDestination }): void {
  if (member.destination.kind === "join-finish" || member.destination.kind === "inactive") {
    throw new Error(APPLICATION_NOT_ACTIVE_MESSAGE);
  }
}

/**
 * The same rule from a raw status, for /admin's member session (which has
 * no portal destination): applied and declined members are sent to /portal.
 */
export function isApplicationStatus(status: MemberStatus | null | undefined): boolean {
  return status === "applied" || status === "declined";
}
