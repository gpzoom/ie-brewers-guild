import type { EventHostStatus } from "@/lib/supabase/types";
import type { VisitAction } from "@/lib/events/visit-link-token";

/** What the email button's page shows (spec, "The email buttons"). Pure. */
export type VisitDetails = {
  action: VisitAction;
  status: EventHostStatus;
  guestName: string;
  title: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  taproomName: string;
  timezone: string;
};
export type VisitView = { state: "invalid" | "gone" } | ({ state: "ready" | "answered" } & VisitDetails);

export function statusFor(action: VisitAction): EventHostStatus {
  return action === "approve" ? "shown" : action === "decline" ? "declined" : "hidden";
}

export function visitView(args: {
  action: VisitAction;
  hostId: string;
  link: { status: EventHostStatus; host_member_id: string } | null;
  event: { starts_at: string; ends_at: string | null; overlay_starts_at: string | null; overlay_status: string | null; title: string | null; all_day: boolean } | null;
  guestName: string;
  taproomName: string;
  timezone: string;
  now: Date;
}): VisitView {
  const { link, event } = args;
  if (!link || link.host_member_id !== args.hostId || !event) return { state: "gone" };
  const rescheduled = event.overlay_status === "rescheduled" && Boolean(event.overlay_starts_at);
  const startsAt = rescheduled ? (event.overlay_starts_at as string) : event.starts_at;
  const endsAt = rescheduled ? null : event.ends_at;
  const end = event.all_day ? new Date(startsAt).getTime() + 24 * 3600 * 1000 : endsAt ? new Date(endsAt).getTime() : new Date(startsAt).getTime() + 2 * 3600 * 1000;
  if (end <= args.now.getTime()) return { state: "gone" };
  const answered =
    link.status === statusFor(args.action) ||
    ((args.action === "approve" || args.action === "decline") && link.status !== "pending") ||
    (args.action === "hide" && (link.status === "hidden" || link.status === "declined"));
  return {
    state: answered ? "answered" : "ready",
    action: args.action,
    status: link.status,
    guestName: args.guestName,
    title: event.title?.trim() || null,
    startsAt,
    endsAt,
    allDay: event.all_day,
    taproomName: args.taproomName,
    timezone: args.timezone,
  };
}
