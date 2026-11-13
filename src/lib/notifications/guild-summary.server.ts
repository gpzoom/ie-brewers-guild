import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendRawEmail } from "@/lib/email/send";
import { STAGING_GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import { siteRole } from "@/lib/events/guest-stop-send";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import {
  buildLaunchSummaryEmail,
  buildWeeklySummaryEmail,
  countWeek,
  type LaunchNames,
} from "./guild-summary";
import "./registry";

const ROW_CAP = 5000;

/** Guild admins and super admins, as listAdmins() in guild-admins.server.ts finds them. */
async function adminEmails(
  db: Awaited<ReturnType<typeof getSupabaseServiceRoleClient>>,
): Promise<string[]> {
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .or("is_guild_admin.eq.true,is_super_admin.eq.true");
  if (error) throw error;
  const emails = new Set<string>();
  for (const p of (data ?? []) as Array<{ id: string }>) {
    const { data: u, error: uerr } = await db.auth.admin.getUserById(p.id);
    if (uerr) throw uerr;
    if (u?.user?.email) emails.add(u.user.email);
  }
  return [...emails];
}

/**
 * Monday's count email to the Guild admins: conflicts found, resolved and
 * still open this week. Skips an empty week. The caller runs it on Mondays
 * (Pacific). Staging sends only to the test inbox. Never throws.
 */
export async function sendWeeklyGuildSummary(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const role = siteRole((env as { SITE_ORIGIN?: string }).SITE_ORIGIN);
    if (!role) {
      console.error("sendWeeklyGuildSummary: unknown SITE_ORIGIN -- sending nothing");
      return;
    }
    const db = await getSupabaseServiceRoleClient();
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("member_notifications")
      .select("*")
      .eq("kind", "problem")
      .or(`status.eq.open,created_at.gte.${since},resolved_at.gte.${since}`)
      .limit(ROW_CAP);
    if (error) throw error;
    const rows = (data ?? []) as MemberNotificationRow[];
    if (rows.length >= ROW_CAP) console.error("sendWeeklyGuildSummary: row cap reached, counts may be low");
    const email = buildWeeklySummaryEmail(countWeek(rows, now), role.origin, role.staging);
    if (!email) return;
    const to = role.staging ? [STAGING_GUILD_NOTIFICATION_EMAIL] : await adminEmails(db);
    if (to.length === 0) {
      console.error("sendWeeklyGuildSummary: no Guild admin email found");
      return;
    }
    await sendRawEmail({ to, ...email });
  } catch (err) {
    console.error("sendWeeklyGuildSummary failed", err);
  }
}

/**
 * Once, at launch: tell the Guild admins about the open conflicts found
 * quietly (members were not emailed). Live site only; runs while emails are
 * still off and launch_summary_sent_at is empty, then sets it. No quiet open
 * problems: sets it without sending. Never throws.
 */
export async function maybeSendLaunchSummary(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const role = siteRole((env as { SITE_ORIGIN?: string }).SITE_ORIGIN);
    if (!role || role.staging) return;
    const db = await getSupabaseServiceRoleClient();
    const { data: s, error: serr } = await db
      .from("member_notification_settings")
      .select("emails_enabled, launch_summary_sent_at")
      .maybeSingle();
    if (serr) throw serr;
    const settings = s as { emails_enabled: boolean; launch_summary_sent_at: string | null } | null;
    if (!settings || settings.emails_enabled || settings.launch_summary_sent_at) return;

    const { data, error } = await db
      .from("member_notifications")
      .select("*")
      .eq("kind", "problem")
      .eq("quiet", true)
      .eq("status", "open")
      .limit(ROW_CAP);
    if (error) throw error;
    const rows = (data ?? []) as MemberNotificationRow[];

    if (rows.length > 0) {
      const to = await adminEmails(db);
      if (to.length === 0) {
        console.error("maybeSendLaunchSummary: no Guild admin email found; will retry");
        return;
      }
      const names: LaunchNames = { members: {}, events: {} };
      const memberIds = [...new Set(rows.map((r) => r.member_id))];
      const eventIds = [...new Set(rows.map((r) => r.event_id).filter((x): x is string => !!x))];
      if (memberIds.length) {
        const { data: m, error: merr } = await db
          .from("members")
          .select("id, business_name")
          .in("id", memberIds);
        if (merr) throw merr;
        for (const x of (m ?? []) as Array<{ id: string; business_name: string }>) {
          names.members[x.id] = x.business_name;
        }
      }
      if (eventIds.length) {
        const { data: ev, error: eerr } = await db
          .from("events")
          .select("id, title, venue_name")
          .in("id", eventIds);
        if (eerr) throw eerr;
        for (const x of (ev ?? []) as Array<{ id: string; title: string | null; venue_name: string | null }>) {
          const label = x.title ?? x.venue_name;
          if (label) names.events[x.id] = label;
        }
      }
      await sendRawEmail({ to, ...buildLaunchSummaryEmail(rows, names, role.origin, false) });
    }

    const { error: uerr } = await db
      .from("member_notification_settings")
      .update({ launch_summary_sent_at: new Date().toISOString() })
      .eq("singleton", true)
      .is("launch_summary_sent_at", null);
    if (uerr) throw uerr;
  } catch (err) {
    console.error("maybeSendLaunchSummary failed", err);
  }
}
