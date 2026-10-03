import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { signHoursConfirmToken } from "@/lib/hours/confirm-token";
import { sendTransactionalEmail } from "@/lib/email/send";
import { hasAlreadyBeenNotifiedForCurrentStalenessEpisode } from "@/lib/hours/hours-stale-cron";
import { SITE_URL } from "@/lib/email/build-email-content";
import type { MemberRow } from "@/lib/supabase/types";

/**
 * Sends exactly one notice per staleness episode (this plan's Decision 15):
 * hours_confirmed_at more than 90 days old, and not yet notified for the
 * current confirmation (hasAlreadyBeenNotifiedForCurrentStalenessEpisode,
 * hours-stale-cron.ts -- extracted there, separately unit-tested, rather
 * than left as inline boolean logic here). Members who have never
 * confirmed hours (hours_confirmed_at is null) are explicitly excluded --
 * the spec's "different, gentler prompt" for that case is a UI affordance
 * (PublishGateDialog / the admin's left-rail notice), not an email.
 */
export async function sendHoursStaleNotices(): Promise<void> {
  const supabase = await getSupabaseServiceRoleClient();
  const staleThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: members, error } = await supabase
    .from("members")
    .select("*")
    .eq("status", "published")
    .not("hours_confirmed_at", "is", null)
    .lt("hours_confirmed_at", staleThreshold);

  if (error || !members) {
    console.error("sendHoursStaleNotices: failed to list members", error);
    return;
  }

  const { env } = await import("cloudflare:workers");
  const secret = (env as { HOURS_CONFIRM_SECRET?: string }).HOURS_CONFIRM_SECRET;
  if (!secret) {
    console.error("sendHoursStaleNotices: HOURS_CONFIRM_SECRET is not set");
    return;
  }

  for (const member of members as MemberRow[]) {
    if (
      hasAlreadyBeenNotifiedForCurrentStalenessEpisode(
        member.hours_stale_notice_sent_at ?? null,
        member.hours_confirmed_at,
      )
    ) {
      continue;
    }

    const token = await signHoursConfirmToken(member.id, secret);
    const siteOrigin = SITE_URL; // no in-flight request to read an origin from in a cron -- reuses the same production-domain constant build-email-content.ts already defines, rather than a second hardcoded literal.

    // "Notified" must only ever mean "actually emailed" -- hours_stale_notice_sent_at
    // is the ONLY signal hasAlreadyBeenNotifiedForCurrentStalenessEpisode has for
    // permanently suppressing further notices for this staleness episode, so writing
    // it after a failed send would starve that member of any future notice until they
    // independently reconfirm their hours (an action unrelated to ever having been
    // prompted to). This matters concretely today: sendTransactionalEmail is still
    // Task 19's unimplemented stub that always throws, so leaving this write outside
    // the try/catch would have permanently (and silently) marked every currently-stale
    // member "notified" on this cron's very first production run without a single real
    // email going out -- a review finding, not a hypothetical.
    try {
      await sendTransactionalEmail({
        trigger: "hours_stale",
        memberId: member.id,
        confirmUrl: `${siteOrigin}/api/confirm-hours/${token}`,
      });
      await supabase.from("members").update({ hours_stale_notice_sent_at: new Date().toISOString() }).eq("id", member.id);
    } catch (err) {
      console.error("sendTransactionalEmail(hours_stale) failed", err);
    }
  }
}
