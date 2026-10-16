import type { RosterEntry } from "@/lib/guild/roster.server";
import type { RosterBusiness } from "@/lib/guild/roster-groups";
import { computeHoursConfirmationBadge } from "@/lib/hours/publish-gate";

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Weekly hours only go stale for members that keep them (Mobile members list appearances instead). */
export function hasStaleHours(entry: RosterEntry, now: Date): boolean {
  if (entry.member.member_type === "mobile") return false;
  return computeHoursConfirmationBadge(entry.member.hours_confirmed_at, now).kind === "stale";
}

/**
 * Who signs in for this row. In a one-manager business that is the
 * business's manager, not the location's own owner -- so the row reports
 * the manager's state (spec 2026-10-15). Null once someone has signed in.
 */
function signInDetail(entry: RosterEntry, business: RosterBusiness | undefined): string | null {
  if (business?.mode === "one_manager") {
    if (!business.hasManager) return "manager not invited yet";
    if (!business.managerSignedIn) return "manager invited, not signed in";
    return null;
  }
  if (entry.claimState === "unclaimed") return "not invited yet";
  if (entry.claimState === "invited_not_signed_in") return "invited, not signed in";
  return null;
}

/**
 * The muted line under the row's title: "City · <the one thing worth
 * knowing>". `withoutCity` is for a location under its business, whose
 * title is already the city (artboard BZ1).
 */
export function resolveDetailLine(
  entry: RosterEntry,
  now: Date,
  options: { business?: RosterBusiness; withoutCity?: boolean } = {},
): string {
  const { member } = entry;
  let detail = signInDetail(entry, options.business);
  if (detail === null) {
    if (hasStaleHours(entry, now) && member.hours_confirmed_at)
      detail = `hours confirmed ${formatShortDate(member.hours_confirmed_at)}`;
    else if (member.status === "published" && !member.dues_received_at)
      detail = "dues not recorded";
    else if (member.member_since_year) detail = `member since ${member.member_since_year}`;
  }
  if (options.withoutCity) return detail ?? "";
  return detail ? `${member.city} · ${detail}` : member.city;
}
