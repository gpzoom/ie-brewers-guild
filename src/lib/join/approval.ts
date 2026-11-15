import type { MemberStatus } from "@/lib/supabase/types";

/**
 * What the roster's Approve writes. An applicant (status "applied") moves to
 * Draft: the owner reviews and publishes it themselves (or a Guild admin does
 * from "Edit as them"). Every other status keeps the original behavior and
 * goes straight to published.
 */
export function approvalPatch(
  status: MemberStatus,
  userId: string,
  now: Date,
): { status: "draft" | "published"; approved_at: string; approved_by_user_id: string } {
  return {
    status: status === "applied" ? "draft" : "published",
    approved_at: now.toISOString(),
    approved_by_user_id: userId,
  };
}

/** The welcome email goes out once, on the first publish of a member who applied through Join. */
export function shouldSendWelcome(m: {
  status: MemberStatus;
  applied_via_join_at: string | null;
  join_welcomed_at: string | null;
}): boolean {
  return m.status === "published" && m.applied_via_join_at !== null && m.join_welcomed_at === null;
}
