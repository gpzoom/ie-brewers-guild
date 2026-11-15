import type { PortalDestination } from "@/lib/portal/portal-destination";

/**
 * Join the Guild, step 2 (/join/finish): the pure rules, so the server
 * function and the tests share them.
 *
 * "I'm done" emails the Guild inbox ("{business} added details to their
 * application") at most once a day per applicant. The last email time is
 * members.join_details_notified_at; the server stamps it with a
 * conditional update using detailsNotifyCutoff, so two quick clicks can't
 * both send.
 */

export const DETAILS_NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** True when the Guild hasn't been told in the last 24 hours (or ever). */
export function shouldNotifyDetails(lastNotifiedAt: string | null, now: Date): boolean {
  if (!lastNotifiedAt) return true;
  const last = new Date(lastNotifiedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= DETAILS_NOTIFY_INTERVAL_MS;
}

/** The ISO time 24 hours before `now`: a stamp at or before it may be replaced. */
export function detailsNotifyCutoff(now: Date): string {
  return new Date(now.getTime() - DETAILS_NOTIFY_INTERVAL_MS).toISOString();
}

export type JoinFinishKind = "form" | "inactive" | "not-applicant";

/**
 * What /join/finish shows for the portal's chosen member (Review Focus 5):
 * the form only for an applicant; "isn't active" for a declined one;
 * everyone else is sent to /portal. Never an editable form for anyone but
 * an applicant.
 */
export function joinFinishKind(destination: PortalDestination): JoinFinishKind {
  if (destination.kind === "join-finish") return "form";
  if (destination.kind === "inactive") return "inactive";
  return "not-applicant";
}
