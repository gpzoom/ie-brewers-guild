import { getRequest } from "@tanstack/react-start/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { resolveMemberOwnerEmails } from "@/lib/email/resolve-recipient.server";
import { sendTransactionalEmail } from "@/lib/email/send";

function currentRequestUrl(): string | null {
  try {
    return getRequest().url;
  } catch {
    return null;
  }
}

/**
 * Welcome email for a member who applied through Join, sent once, the first
 * time their profile is published. NEVER throws: it runs after a successful
 * publish and must not turn that into a failure.
 *
 * The claim is one atomic conditional UPDATE (stamp join_welcomed_at only if
 * still null, applied via Join, and published), so two simultaneous publishes
 * cannot both send. Only the caller that gets a row back sends.
 *
 * If the send fails, the stamp we wrote is cleared (matching its exact value,
 * so we never clear a different writer's stamp) so a later publish retries.
 */
export async function sendJoinWelcomeIfDue(memberId: string): Promise<void> {
  try {
    const supabase = await getSupabaseServiceRoleClient();
    const stamp = new Date().toISOString();
    const { data: claimed, error } = await supabase
      .from("members")
      .update({ join_welcomed_at: stamp })
      .eq("id", memberId)
      .is("join_welcomed_at", null)
      .not("applied_via_join_at", "is", null)
      .eq("status", "published")
      .select("slug, business_name");
    if (error) throw new Error(error.message);
    const row = claimed?.[0];
    if (!row) return; // not an applicant, not published, or already welcomed

    try {
      const [email] = await resolveMemberOwnerEmails(supabase, memberId);
      if (!email) {
        console.warn(`sendJoinWelcomeIfDue: no owner email for member ${memberId} -- nothing sent.`);
        return;
      }
      const siteUrl = resolveEmailSiteUrl(currentRequestUrl());
      await sendTransactionalEmail({
        trigger: "application_approved",
        memberId,
        businessName: row.business_name,
        email,
        profileUrl: `${siteUrl}/members/${row.slug}`,
      });
    } catch (sendError) {
      await supabase
        .from("members")
        .update({ join_welcomed_at: null })
        .eq("id", memberId)
        .eq("join_welcomed_at", stamp);
      throw sendError;
    }
  } catch (err) {
    console.error(
      `sendJoinWelcomeIfDue failed for member ${memberId}:`,
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
