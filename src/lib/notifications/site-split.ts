import type { MemberNotificationRow } from "@/lib/supabase/types";
import type { ProblemOpen } from "./closed-day";

/**
 * Staging and live share one database and both run the checks
 * (spec, "Which site handles which members"). Staging handles only rows
 * whose members are all Sample test members; live handles every other row,
 * so a pre-existing Sample-plus-real row is resolved by live (but never opened).
 */
export function isSampleName(name: string): boolean {
  return /^Sample /.test(name);
}

function otherMember(details: unknown): string | null {
  const other = (details as { other_member_id?: unknown } | null)?.other_member_id;
  return typeof other === "string" ? other : null;
}

function involved(memberId: string, details: unknown): string[] {
  const other = otherMember(details);
  return other ? [memberId, other] : [memberId];
}

export function forSite<D>(
  d: { opens: ProblemOpen<D>[]; resolveRows: MemberNotificationRow[] },
  isSample: (memberId: string) => boolean,
  staging: boolean,
): { opens: ProblemOpen<D>[]; resolveIds: string[] } {
  const mine = (ids: string[]) => ids.every(isSample) === staging;
  // Owner rule: no email to a real member from testing, so a conflict mixing
  // Sample and real members is never opened on either site (resolves still go).
  const mixed = (ids: string[]) => ids.some(isSample) && !ids.every(isSample);
  return {
    opens: d.opens.filter((o) => {
      const ids = involved(o.member_id, o.details);
      return !mixed(ids) && mine(ids);
    }),
    resolveIds: d.resolveRows
      .filter((r) => mine(involved(r.member_id, r.details)))
      .map((r) => r.id),
  };
}
