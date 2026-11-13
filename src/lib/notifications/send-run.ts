import type { MemberNotificationRow, MemberRole } from "@/lib/supabase/types";
import { STAGING_GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import { buildNotificationEmail, type EmailItem } from "./email";
import { typeDef } from "./registry";
import type { NoticeContext } from "./types";

/** A row as claim_member_notification_emails returns it. */
export type ClaimedNotification = MemberNotificationRow & { send_kind: "notice" | "reminder" };

/**
 * alsoReminder: a notice sent when its problem is already inside the
 * reminder window counts as the reminder too, so no separate "Reminder"
 * email follows on the next run.
 */
export type SentMark = { id: string; sendKind: "notice" | "reminder"; alsoReminder?: true };

const DEFAULT_TZ = "America/Los_Angeles";

/** YYYY-MM-DD for `now` in the given time zone. */
function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(now);
}

/** YYYY-MM-DD minus whole days. */
function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Is this notice for a problem whose reminder window has already opened? */
export function noticeInReminderWindow(
  row: Pick<ClaimedNotification, "send_kind" | "kind" | "due_date" | "reminder_days">,
  timezone: string,
  now: Date,
): boolean {
  if (row.send_kind !== "notice" || row.kind !== "problem") return false;
  if (row.reminder_days == null || !row.due_date) return false;
  return todayIn(timezone, now) >= minusDays(row.due_date, row.reminder_days);
}

/**
 * One 15-minute send of member notification emails (spec, "Emails"), with
 * its database and mail pieces passed in (send.server.ts supplies them), so
 * the rules are tested without either -- the same shape as guest-stop-run.ts:
 * - one email per member per run, covering all of its claimed rows;
 * - to the people whose role is in any of those rows' recipient_roles
 *   (staging: the test inbox only);
 * - no one to send to: the rows are marked sent with "no recipient";
 * - a failed lookup or send marks that member's rows failed for the next run
 *   (the claim already counted the attempt, so retries are capped) and the
 *   other members still send;
 * - a failed "mark sent" after the email went is logged, not retried here;
 * - after a row is marked sent, its type's afterSend runs (errors logged).
 */
export type SendDeps = {
  claim: () => Promise<ClaimedNotification[]>;
  /** Throws on a read error (so the rows are retried); null if the member is gone. */
  loadMember: (memberId: string) => Promise<{
    name: string;
    timezone: string;
    recipientsByRole: Map<MemberRole, string[]>;
  } | null>;
  /** Throws on a read error. */
  loadContext: (row: MemberNotificationRow) => Promise<NoticeContext>;
  send: (email: { to: string[]; subject: string; html: string; text: string }) => Promise<void>;
  markSent: (rows: SentMark[], lastError: string | null) => Promise<void>;
  markFailed: (id: string, message: string) => Promise<void>;
  role: { origin: string; staging: boolean };
  now: Date;
};

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

function stripSendKind(row: ClaimedNotification): MemberNotificationRow {
  const { send_kind: _sendKind, ...rest } = row;
  return rest;
}

export async function runNotificationSend(d: SendDeps): Promise<void> {
  const claimed = await d.claim();
  if (claimed.length === 0) return;

  // A row whose type this code doesn't know can't be worded: fail just it.
  const known: ClaimedNotification[] = [];
  for (const row of claimed) {
    try {
      typeDef(row.type);
      known.push(row);
    } catch (err) {
      const message = errorText(err);
      console.error("member notifications: row failed", row.id, message);
      await d.markFailed(row.id, message).catch(() => {});
    }
  }

  const byMember = new Map<string, ClaimedNotification[]>();
  for (const row of known)
    byMember.set(row.member_id, [...(byMember.get(row.member_id) ?? []), row]);

  for (const [memberId, rows] of byMember) {
    let marks: SentMark[] = [];
    try {
      const member = await d.loadMember(memberId);
      const tz = member?.timezone || DEFAULT_TZ;
      marks = rows.map((r) =>
        noticeInReminderWindow(r, tz, d.now)
          ? { id: r.id, sendKind: r.send_kind, alsoReminder: true }
          : { id: r.id, sendKind: r.send_kind },
      );
      const roles = new Set(rows.flatMap((r) => r.recipient_roles));
      const addresses = new Set<string>();
      for (const role of roles)
        for (const a of member?.recipientsByRole.get(role) ?? []) addresses.add(a);
      if (!member || addresses.size === 0) {
        await d.markSent(marks, "no recipient");
        continue;
      }
      const to = d.role.staging ? [STAGING_GUILD_NOTIFICATION_EMAIL] : [...addresses];
      const items: EmailItem[] = [];
      for (const r of rows) {
        items.push({
          row: stripSendKind(r),
          sendKind: r.send_kind,
          ctx: await d.loadContext(stripSendKind(r)),
        });
      }
      const email = buildNotificationEmail({
        memberName: member.name,
        items,
        origin: d.role.origin,
        staging: d.role.staging,
      });
      await d.send({ to, ...email });
    } catch (err) {
      const message = errorText(err);
      console.error("member notifications: member failed", memberId, message);
      for (const r of rows) await d.markFailed(r.id, message).catch(() => {});
      continue;
    }
    try {
      await d.markSent(marks, null);
    } catch (err) {
      // The email went; the claim counted the attempt, so a retry is capped.
      console.error("member notifications: sent but not marked", memberId, err);
      continue;
    }
    for (const r of rows) {
      const after = typeDef(r.type).afterSend;
      if (!after) continue;
      try {
        await after(stripSendKind(r));
      } catch (err) {
        console.error("member notifications: afterSend failed", r.id, err);
      }
    }
  }
}
