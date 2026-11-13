import type { MemberNotificationRow, MemberRole } from "@/lib/supabase/types";

export type NotificationKind = "problem" | "message";

export type NoticeContext = {
  memberName: string;
  otherMemberName: string | null;
  eventTitle: string | null;
  /** The recipient member's IANA time zone; dates are shown in it. */
  timezone: string;
};

export type NotificationTypeDef<D> = {
  type: string;
  kind: NotificationKind;
  recipientRoles: MemberRole[];
  guildSees: boolean;
  countsInGuildSummary: boolean;
  emailMode: "batched" | "none";
  reminderDaysBefore: number | null;
  portal(
    d: D,
    ctx: NoticeContext,
  ): { title: string; body: string; buttons: Array<{ label: string; to: string }> };
  email(
    d: D,
    ctx: NoticeContext,
    sendKind: "notice" | "reminder",
  ): { heading: string; lines: string[]; button: { label: string; path: string } | null };
  afterSend?: (row: MemberNotificationRow) => Promise<void>;
};

export type ClosedDayConflictDetails = {
  role: "own" | "host" | "guest";
  event_id: string;
  other_member_id: string | null;
  closed_date: string;
  closed_note: string | null;
};

export type UtcCalendarDetails = {
  calendar_connection_id: string;
  purpose: "events" | "food";
  feed_time_zone: string;
};
