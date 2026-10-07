import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendRawEmail } from "@/lib/email/send";
import { STAGING_GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import { buildGuestStopEmail, groupNotices, type EmailVisit } from "@/lib/events/guest-stop-email";
import { siteRole, visitButtons } from "@/lib/events/guest-stop-send";
import type { EventHostStatus, GuestStopNoticeRow } from "@/lib/supabase/types";

const BATCH = 200;

/**
 * Sends the queued Guild member visit emails (spec, "The send queue"): one
 * per taproom, to its owner and full editors. The live site takes every
 * taproom but the Sample test ones; staging takes only those, and sends to
 * the test inbox. Never throws.
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
    const db = await getSupabaseServiceRoleClient();
    const { data, error } = await db.rpc("claim_guest_stop_notices", { p_limit: BATCH, p_sample_only: role.staging });
    if (error) throw error;
    const claimed = (data ?? []) as GuestStopNoticeRow[];
    if (claimed.length === 0) return;
    const now = new Date();

    for (const [hostId, visits] of groupNotices(claimed)) {
      const ids = claimed.filter((c) => c.host_member_id === hostId).map((c) => c.id);
      try {
        const [{ data: host }, { data: people }, { data: links }] = await Promise.all([
          db.from("members").select("slug, business_name, street_address, timezone").eq("id", hostId).maybeSingle(),
          db.from("member_users").select("user_id").eq("member_id", hostId).in("role", ["owner", "editor"]),
          db.from("event_hosts").select("event_id, status").in("event_id", visits.map((v) => v.event_id).filter(Boolean) as string[]),
        ]);
        const statusOf = new Map(((links ?? []) as Array<{ event_id: string; status: EventHostStatus }>).map((l) => [l.event_id, l.status]));
        const emails: string[] = [];
        for (const p of (people ?? []) as Array<{ user_id: string }>) {
          const { data: u } = await db.auth.admin.getUserById(p.user_id);
          if (u?.user?.email) emails.push(u.user.email);
        }
        const to = role.staging ? [STAGING_GUILD_NOTIFICATION_EMAIL] : emails;
        if (!host || to.length === 0) {
          await db.from("guest_stop_notices").update({ sent_at: now.toISOString(), last_error: "no recipient" }).in("id", ids);
          continue;
        }
        const withButtons: EmailVisit[] = await Promise.all(
          visits.map(async (v) => ({
            ...v,
            buttons: await visitButtons(v, statusOf.get(v.event_id ?? "") ?? "shown", { origin: role.origin, secret: vars.GUEST_STOP_LINK_SECRET!, now }),
          })),
        );
        const email = buildGuestStopEmail({
          taproomName: host.business_name as string,
          street: (host.street_address as string | null) ?? null,
          timezone: (host.timezone as string) || "America/Los_Angeles",
          visits: withButtons,
          pageUrl: `${role.origin}/members/${host.slug as string}#events`,
          eventsUrl: `${role.origin}/portal/events`,
          staging: role.staging,
        });
        await sendRawEmail({ to, ...email });
        await db.from("guest_stop_notices").update({ sent_at: now.toISOString(), last_error: null }).in("id", ids);
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        console.error("sendGuestStopNotices: taproom failed", hostId, message);
        for (const id of ids) {
          const row = claimed.find((c) => c.id === id)!;
          await db.from("guest_stop_notices").update({ claimed_at: null, attempts: row.attempts + 1, last_error: message }).eq("id", id);
        }
      }
    }
  } catch (err) {
    console.error("sendGuestStopNotices failed", err);
  }
}
