import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";
import { SITE_URL } from "@/lib/email/build-email-content";
import { signVisitLink, visitLinkExpiry, type VisitAction } from "@/lib/events/visit-link-token";
import type { EmailVisit } from "@/lib/events/guest-stop-email";

const STAGING_ORIGIN = "https://ie-brewers-guild-staging.boblelle77.workers.dev";

/**
 * Which site this Worker is, from its SITE_ORIGIN var (wrangler.jsonc /
 * wrangler.staging.jsonc): staging sends only the Sample test taprooms'
 * mail, to the test inbox. Missing or unknown: null, and nothing is sent --
 * a staging Worker that lost its setting must never send as the live site.
 */
export function siteRole(siteOrigin: string | undefined): { origin: string; staging: boolean } | null {
  if (siteOrigin === STAGING_ORIGIN) return { origin: STAGING_ORIGIN, staging: true };
  if (siteOrigin === SITE_URL) return { origin: SITE_URL, staging: false };
  return null;
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
