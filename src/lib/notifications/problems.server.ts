import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { siteRole } from "@/lib/events/guest-stop-send";
import { decideClosedDayProblems } from "./closed-day";
import { decideUtcProblems } from "./utc-calendar";
import { forSite, isSampleName } from "./site-split";
import { loadProblemInputs } from "./problems-load";

/**
 * The member-problem check (closed-day conflicts and UTC calendars): loads
 * live data, decides both types, keeps this site's rows (staging: Sample-only
 * rows; live: every other row) and writes them in one apply_member_problems
 * call. Always a full check -- the data is small. Run by the 15-minute cron
 * and after every save that can change the answer. Service role. Never
 * throws -- a save or sync that succeeded must not fail because of it.
 */
export async function refreshMemberProblems(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const vars = env as { SITE_ORIGIN?: string };
    const role = siteRole(vars.SITE_ORIGIN);
    if (!role) {
      console.error(
        `refreshMemberProblems: unknown SITE_ORIGIN (${vars.SITE_ORIGIN ?? "not set"}) -- checking nothing`,
      );
      return;
    }

    const db = await getSupabaseServiceRoleClient();
    const now = new Date();
    const inputs = await loadProblemInputs(db, now);
    const isSample = (id: string) => isSampleName(inputs.members.get(id)?.name ?? "");

    const closed = forSite(decideClosedDayProblems(inputs, now), isSample, role.staging);
    const utc = forSite(
      decideUtcProblems({
        connections: inputs.connections,
        members: inputs.members,
        openRows: inputs.utcOpenRows,
      }),
      isSample,
      role.staging,
    );
    const opens = [...closed.opens, ...utc.opens];
    const resolveIds = [...closed.resolveIds, ...utc.resolveIds];
    if (opens.length === 0 && resolveIds.length === 0) return;

    const { error } = await db.rpc("apply_member_problems", {
      p_opens: opens,
      p_resolve_ids: resolveIds,
    });
    if (error) throw error;
  } catch (err) {
    console.error("refreshMemberProblems failed", err);
  }
}
