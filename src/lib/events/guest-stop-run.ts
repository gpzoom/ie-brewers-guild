import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";
import { STAGING_GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import { buildGuestStopEmail, groupNotices, type EmailVisit } from "@/lib/events/guest-stop-email";
import { visitButtons } from "@/lib/events/guest-stop-send";

/**
 * One 15-minute send of the taprooms' Guild member visit emails (spec,
 * "The send queue"), with its database and mail pieces passed in
 * (guest-stop-notices.server.ts supplies them), so the rules are tested
 * without either:
 * - visits already over are marked done, never emailed (a backlog can't
 *   send stale mail);
 * - one email per taproom, to its owner and full editors (staging: the
 *   test inbox);
 * - a failed lookup or send leaves the notes for the next run (claiming
 *   already counted the attempt, so it can't retry forever);
 * - a failed "mark sent" after the email went is logged, not retried here.
 */
export type RunDeps = {
  claim: () => Promise<GuestStopNoticeRow[]>;
  /** Throws on any read error, so the notes are retried rather than lost. */
  loadTaproom: (
    hostId: string,
    eventIds: string[],
  ) => Promise<{
    taproom: { slug: string; businessName: string; street: string | null; timezone: string } | null;
    recipients: string[];
    statusByEvent: Map<string, EventHostStatus>;
  }>;
  send: (email: { to: string[]; subject: string; html: string; text: string }) => Promise<void>;
  markSent: (ids: string[], lastError: string | null) => Promise<void>;
  markFailed: (id: string, message: string) => Promise<void>;
  role: { origin: string; staging: boolean };
  secret: string;
  now: Date;
};

const DEFAULT_LENGTH_MS = 2 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export function isOver(note: Pick<GuestStopNoticeRow, "starts_at" | "ends_at" | "all_day">, now: Date): boolean {
  const start = new Date(note.starts_at).getTime();
  const end = note.all_day ? start + DAY_MS : note.ends_at ? new Date(note.ends_at).getTime() : start + DEFAULT_LENGTH_MS;
  return end <= now.getTime();
}

export async function runGuestStopSend(d: RunDeps): Promise<void> {
  const claimed = await d.claim();
  if (claimed.length === 0) return;

  const over = claimed.filter((c) => isOver(c, d.now));
  if (over.length) await d.markSent(over.map((c) => c.id), "over").catch((err) => console.error("guest stop notes: mark over failed", err));
  const current = claimed.filter((c) => !isOver(c, d.now));

  for (const [hostId, visits] of groupNotices(current)) {
    const ids = current.filter((c) => c.host_member_id === hostId).map((c) => c.id);
    let email: { to: string[]; subject: string; html: string; text: string } | null = null;
    try {
      const { taproom, recipients, statusByEvent } = await d.loadTaproom(
        hostId,
        visits.map((v) => v.event_id).filter((id): id is string => Boolean(id)),
      );
      const to = d.role.staging ? [STAGING_GUILD_NOTIFICATION_EMAIL] : recipients;
      if (!taproom || to.length === 0) {
        await d.markSent(ids, "no recipient");
        continue;
      }
      const withButtons: EmailVisit[] = await Promise.all(
        visits.map(async (v) => ({
          ...v,
          buttons: await visitButtons(v, statusByEvent.get(v.event_id ?? "") ?? "shown", {
            origin: d.role.origin,
            secret: d.secret,
            now: d.now,
          }),
        })),
      );
      email = {
        to,
        ...buildGuestStopEmail({
          taproomName: taproom.businessName,
          street: taproom.street,
          timezone: taproom.timezone || "America/Los_Angeles",
          visits: withButtons,
          pageUrl: `${d.role.origin}/members/${taproom.slug}#events`,
          eventsUrl: `${d.role.origin}/portal/events`,
          staging: d.role.staging,
        }),
      };
      await d.send(email);
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      console.error("guest stop notes: taproom failed", hostId, message);
      for (const id of ids) await d.markFailed(id, message).catch(() => {});
      continue;
    }
    try {
      await d.markSent(ids, null);
    } catch (err) {
      // The email went; the claim counted the attempt, so a retry is capped.
      console.error("guest stop notes: sent but not marked", hostId, err);
    }
  }
}
