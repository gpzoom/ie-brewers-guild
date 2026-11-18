import type { MemberNotificationRow, MemberRole } from "@/lib/supabase/types";
import type {
  ClosedDayConflictDetails,
  NoticeContext,
  NotificationTypeDef,
  UtcCalendarDetails,
} from "./types";
import { zoneLabel } from "@/lib/events/calendar-time-zone";

const ALL_ROLES: MemberRole[] = ["owner", "co_owner", "editor", "media_events"];

const registry = new Map<string, NotificationTypeDef<unknown>>();

export function registerNotificationType<D>(def: NotificationTypeDef<D>): void {
  registry.set(def.type, def as NotificationTypeDef<unknown>);
}

export function typeDef(type: string): NotificationTypeDef<unknown> {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown notification type: ${type}`);
  return def;
}

/** What an insert copies from the registry. */
export function rowFields(def: NotificationTypeDef<unknown>): {
  kind: MemberNotificationRow["kind"];
  recipient_roles: MemberRole[];
  email_mode: MemberNotificationRow["email_mode"];
  reminder_days: number | null;
} {
  return {
    kind: def.kind,
    recipient_roles: def.recipientRoles,
    email_mode: def.emailMode,
    reminder_days: def.reminderDaysBefore,
  };
}

/** "Thu, Nov 26" for a YYYY-MM-DD calendar date, in the given time zone. */
function formatDay(date: string, timezone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // Noon UTC stays on the same calendar day in every US time zone.
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function conflictSentence(d: ClosedDayConflictDetails, ctx: NoticeContext): string {
  const day = formatDay(d.closed_date, ctx.timezone);
  const note = d.closed_note ? ` (${d.closed_note})` : "";
  const title = ctx.eventTitle ?? "event";
  const other = ctx.otherMemberName ?? "the taproom";
  if (d.role === "host") {
    return `${other}'s "${title}" is on ${day}, a day you've marked closed${note}. It's hidden from both your pages until this is fixed.`;
  }
  if (d.role === "guest") {
    return `Your stop "${title}" at ${other} is on ${day}, a day they've marked closed${note}. It's hidden until this is fixed. Contact ${other} or change your schedule.`;
  }
  return `Your event "${title}" is on ${day}, a day you've marked closed${note}. It's hidden from your public page until this is fixed.`;
}

const closedDayConflict: NotificationTypeDef<ClosedDayConflictDetails> = {
  type: "closed_day_conflict",
  kind: "problem",
  recipientRoles: ALL_ROLES,
  guildSees: true,
  countsInGuildSummary: true,
  emailMode: "batched",
  reminderDaysBefore: 3,
  portal(d, ctx) {
    const buttons = [{ label: "Edit in Events", to: "/portal/events" }];
    if (d.role !== "guest") buttons.push({ label: "Check Special hours", to: "/portal/basics" });
    return {
      title: "An event is on a closed day",
      body: conflictSentence(d, ctx),
      buttons,
    };
  },
  email(d, ctx, sendKind) {
    return {
      heading:
        sendKind === "reminder"
          ? "Reminder: an event is on a closed day"
          : "An event is on a closed day",
      lines: [conflictSentence(d, ctx)],
      button: { label: d.role === "guest" ? "Open your events" : "Edit in Events", path: "/portal/events" },
    };
  },
};

function utcSentence(d: UtcCalendarDetails): string {
  const which = d.purpose === "food" ? "food calendar" : "events calendar";
  return `Your Google Calendar (${which}) is set to ${zoneLabel(d.feed_time_zone)}, not Pacific Time. For now the Guild site adjusts your event times so they show correctly, but please fix it: in Google Calendar, open Settings, choose this calendar, and set its Time zone to (GMT-08:00) Pacific Time - Los Angeles. Then check that your event times still look right.`;
}

const utcCalendar: NotificationTypeDef<UtcCalendarDetails> = {
  type: "utc_calendar",
  kind: "problem",
  recipientRoles: ALL_ROLES,
  guildSees: true,
  countsInGuildSummary: true,
  emailMode: "batched",
  reminderDaysBefore: null,
  portal(d) {
    return {
      title: "Your calendar's time zone needs fixing",
      body: utcSentence(d),
      buttons: [{ label: "Edit in Events", to: "/portal/events" }],
    };
  },
  email(d, _ctx, sendKind) {
    return {
      heading:
        sendKind === "reminder" ? "Reminder: your calendar's time zone needs fixing" : "Your calendar's time zone needs fixing",
      lines: [utcSentence(d)],
      button: { label: "Edit in Events", path: "/portal/events" },
    };
  },
};

registerNotificationType(closedDayConflict);
registerNotificationType(utcCalendar);
