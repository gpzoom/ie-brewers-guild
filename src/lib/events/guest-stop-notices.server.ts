import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendRawEmail } from "@/lib/email/send";
import { siteRole } from "@/lib/events/guest-stop-send";
import { runGuestStopSend } from "@/lib/events/guest-stop-run";
import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";

const BATCH = 200;

/**
 * Sends the queued Guild member visit emails (spec, "The send queue"): one
 * per taproom, to its owner and full editors. The live site takes every
 * taproom but the Sample test ones; staging takes only those, and sends to
 * the test inbox. The rules are in guest-stop-run.ts; this file supplies the
 * database and Resend. Never throws.
 */
export async function sendGuestStopNotices(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const vars = env as { SITE_ORIGIN?: string; GUEST_STOP_LINK_SECRET?: string };
    if (!vars.GUEST_STOP_LINK_SECRET) {
      console.error("sendGuestStopNotices: GUEST_STOP_LINK_SECRET is not set");
      return;
    }
    const role = siteRole(vars.SITE_ORIGIN);
    if (!role) {
      console.error(`sendGuestStopNotices: unknown SITE_ORIGIN (${vars.SITE_ORIGIN ?? "not set"}) -- sending nothing`);
      return;
    }
    const db = await getSupabaseServiceRoleClient();

    await runGuestStopSend({
      role,
      secret: vars.GUEST_STOP_LINK_SECRET,
      now: new Date(),
      async claim() {
        const { data, error } = await db.rpc("claim_guest_stop_notices", { p_limit: BATCH, p_sample_only: role.staging });
        if (error) throw error;
        return (data ?? []) as GuestStopNoticeRow[];
      },
      async loadTaproom(hostId, eventIds) {
        const [host, people, links] = await Promise.all([
          db.from("members").select("slug, business_name, street_address, timezone").eq("id", hostId).maybeSingle(),
          db.from("member_users").select("user_id").eq("member_id", hostId).in("role", ["owner", "editor"]),
          eventIds.length
            ? db.from("event_hosts").select("event_id, status").in("event_id", eventIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (host.error) throw host.error;
        if (people.error) throw people.error;
        if (links.error) throw links.error;
        const recipients: string[] = [];
        for (const p of (people.data ?? []) as Array<{ user_id: string }>) {
          const { data: u, error } = await db.auth.admin.getUserById(p.user_id);
          if (error) throw error;
          if (u?.user?.email) recipients.push(u.user.email);
        }
        const row = host.data as { slug: string; business_name: string; street_address: string | null; timezone: string | null } | null;
        return {
          taproom: row
            ? { slug: row.slug, businessName: row.business_name, street: row.street_address, timezone: row.timezone || "America/Los_Angeles" }
            : null,
          recipients,
          statusByEvent: new Map(((links.data ?? []) as Array<{ event_id: string; status: EventHostStatus }>).map((l) => [l.event_id, l.status])),
        };
      },
      send: (email) => sendRawEmail(email),
      async markSent(ids, lastError) {
        const { error } = await db
          .from("guest_stop_notices")
          .update({ sent_at: new Date().toISOString(), last_error: lastError })
          .in("id", ids);
        if (error) throw error;
      },
      async markFailed(id, message) {
        // The claim already counted this attempt; release it for the next run.
        const { error } = await db.from("guest_stop_notices").update({ claimed_at: null, last_error: message }).eq("id", id);
        if (error) throw error;
      },
    });
  } catch (err) {
    console.error("sendGuestStopNotices failed", err);
  }
}
