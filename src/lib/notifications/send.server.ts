import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendRawEmail } from "@/lib/email/send";
import { siteRole } from "@/lib/events/guest-stop-send";
import type { MemberNotificationRow, MemberRole } from "@/lib/supabase/types";
import { runNotificationSend, type ClaimedNotification } from "./send-run";
import "./registry";

const BATCH = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TZ = "America/Los_Angeles";

/**
 * Sends the queued member notification emails (spec, "Emails"): one per
 * member per run, to the people in its rows' recipient roles. The live site
 * takes every row but the Sample-only ones; staging takes only those and
 * sends to the test inbox (the claim's p_sample_only). The claim returns
 * nothing while paused. The rules are in send-run.ts; this file supplies the
 * database and Resend. A cron sender, not a member mutation (service role,
 * no session), so it isn't in the audit coverage list. Never throws.
 */
export async function sendMemberNotifications(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const vars = env as { SITE_ORIGIN?: string };
    const role = siteRole(vars.SITE_ORIGIN);
    if (!role) {
      console.error(
        `sendMemberNotifications: unknown SITE_ORIGIN (${vars.SITE_ORIGIN ?? "not set"}) -- sending nothing`,
      );
      return;
    }
    const db = await getSupabaseServiceRoleClient();

    // Per-run caches: a member's rows share these lookups.
    const memberCache = new Map<string, Promise<{ name: string; timezone: string } | null>>();
    const emailCache = new Map<string, Promise<string | null>>();
    const eventCache = new Map<string, Promise<string | null>>();

    const memberBasics = (id: string) => {
      let p = memberCache.get(id);
      if (!p) {
        p = (async () => {
          const { data, error } = await db
            .from("members")
            .select("business_name, timezone")
            .eq("id", id)
            .maybeSingle();
          if (error) throw error;
          const m = data as { business_name: string; timezone: string | null } | null;
          return m ? { name: m.business_name, timezone: m.timezone || DEFAULT_TZ } : null;
        })();
        memberCache.set(id, p);
        // A failed read isn't remembered: the next lookup tries again.
        p.catch(() => memberCache.delete(id));
      }
      return p;
    };
    const userEmail = (userId: string) => {
      let p = emailCache.get(userId);
      if (!p) {
        p = (async () => {
          const { data, error } = await db.auth.admin.getUserById(userId);
          if (error) throw error;
          return data?.user?.email ?? null;
        })();
        emailCache.set(userId, p);
        // A failed read isn't remembered: the next lookup tries again.
        p.catch(() => emailCache.delete(userId));
      }
      return p;
    };
    const eventTitle = (id: string) => {
      let p = eventCache.get(id);
      if (!p) {
        p = (async () => {
          const { data, error } = await db
            .from("events")
            .select("title, venue_name")
            .eq("id", id)
            .maybeSingle();
          if (error) throw error;
          const e = data as { title: string | null; venue_name: string | null } | null;
          return e ? (e.title ?? e.venue_name ?? null) : null;
        })();
        eventCache.set(id, p);
        // A failed read isn't remembered: the next lookup tries again.
        p.catch(() => eventCache.delete(id));
      }
      return p;
    };

    await runNotificationSend({
      role,
      now: new Date(),
      async claim() {
        const { data, error } = await db.rpc("claim_member_notification_emails", {
          p_limit: BATCH,
          p_sample_only: role.staging,
        });
        if (error) throw error;
        return (data ?? []) as ClaimedNotification[];
      },
      async loadMember(memberId) {
        const member = await memberBasics(memberId);
        if (!member) return null;
        const { data, error } = await db
          .from("member_users")
          .select("user_id, role")
          .eq("member_id", memberId);
        if (error) throw error;
        const recipientsByRole = new Map<MemberRole, string[]>();
        for (const p of (data ?? []) as Array<{ user_id: string; role: MemberRole }>) {
          const email = await userEmail(p.user_id);
          if (email) recipientsByRole.set(p.role, [...(recipientsByRole.get(p.role) ?? []), email]);
        }
        return { ...member, recipientsByRole };
      },
      async loadContext(row: MemberNotificationRow) {
        const otherId = row.details?.other_member_id;
        const [member, other, title] = await Promise.all([
          memberBasics(row.member_id),
          typeof otherId === "string" && UUID.test(otherId)
            ? memberBasics(otherId)
            : Promise.resolve(null),
          row.event_id ? eventTitle(row.event_id) : Promise.resolve(null),
        ]);
        return {
          memberName: member?.name ?? "",
          otherMemberName: other?.name ?? null,
          eventTitle: title,
          timezone: member?.timezone ?? DEFAULT_TZ,
        };
      },
      send: (email) => sendRawEmail(email),
      async markSent(rows, lastError) {
        const at = new Date().toISOString();
        // A notice already inside its reminder window counts as the reminder.
        const notices = rows
          .filter((r) => r.sendKind === "notice" && !r.alsoReminder)
          .map((r) => r.id);
        const both = rows.filter((r) => r.sendKind === "notice" && r.alsoReminder).map((r) => r.id);
        const reminders = rows.filter((r) => r.sendKind === "reminder").map((r) => r.id);
        if (notices.length) {
          // Notice and reminder share one attempts counter: reset it so the
          // later reminder gets its own retries.
          const { error } = await db
            .from("member_notifications")
            .update({ notice_sent_at: at, attempts: 0, claimed_at: null, last_error: lastError })
            .in("id", notices);
          if (error) throw error;
        }
        if (both.length) {
          const { error } = await db
            .from("member_notifications")
            .update({
              notice_sent_at: at,
              reminder_sent_at: at,
              attempts: 0,
              claimed_at: null,
              last_error: lastError,
            })
            .in("id", both);
          if (error) throw error;
        }
        if (reminders.length) {
          const { error } = await db
            .from("member_notifications")
            .update({ reminder_sent_at: at, claimed_at: null, last_error: lastError })
            .in("id", reminders);
          if (error) throw error;
        }
      },
      async markFailed(id, message) {
        // The claim already counted this attempt; release it for the next run.
        const { error } = await db
          .from("member_notifications")
          .update({ claimed_at: null, last_error: message })
          .eq("id", id);
        if (error) throw error;
      },
    });
  } catch (err) {
    console.error("sendMemberNotifications failed", err);
  }
}
