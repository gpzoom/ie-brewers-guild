import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";
import { SITE_URL } from "@/lib/email/build-email-content";
import { signVisitLink, visitLinkExpiry, type VisitAction } from "@/lib/events/visit-link-token";
import type { EmailVisit } from "@/lib/events/guest-stop-email";

const STAGING_ORIGIN = "https://ie-brewers-guild-staging.boblelle77.workers.dev";

/** Which site this Worker is (its SITE_ORIGIN var): staging sends only the Sample test taprooms' mail, to the test inbox. */
export function siteRole(siteOrigin: string | undefined): { origin: string; staging: boolean } {
  return siteOrigin === STAGING_ORIGIN ? { origin: STAGING_ORIGIN, staging: true } : { origin: SITE_URL, staging: false };
}

export async function visitButtons(
  visit: GuestStopNoticeRow,
  status: EventHostStatus,
  ctx: { origin: string; secret: string; now: Date },
): Promise<EmailVisit["buttons"]> {
  if (visit.kind === "canceled" || !visit.event_id) return [];
  const actions: Array<[string, VisitAction]> =
    status === "pending" ? [["Approve", "approve"], ["Decline", "decline"]] : [["Hide this visit", "hide"]];
  const expiresAt = visitLinkExpiry(visit.starts_at, visit.ends_at, ctx.now);
  return Promise.all(
    actions.map(async ([label, action]) => ({
      label,
      href: `${ctx.origin}/visit/${await signVisitLink({ eventId: visit.event_id!, hostId: visit.host_member_id, action, expiresAt }, ctx.secret)}`,
    })),
  );
}
