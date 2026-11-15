import type { MemberStatus } from "@/lib/supabase/types";

type ApprovalSubject = {
  status: MemberStatus;
  applied_via_join_at?: string | null;
  join_welcomed_at?: string | null;
};

/**
 * A member who came in through Join and has never been welcomed. Whatever its
 * status, Approve only moves it to Draft: publishing (which sends the welcome
 * email) happens from "Edit as them" or by the owner.
 */
export function isUnwelcomedJoinApplicant(m: ApprovalSubject): boolean {
  return !!m.applied_via_join_at && !m.join_welcomed_at;
}

/**
 * What the roster's Approve writes. An applicant (status "applied"), or any
 * Join member never welcomed yet, moves to Draft: the owner reviews and
 * publishes it themselves (or a Guild admin does from "Edit as them"). Every
 * other member keeps the original behavior and goes straight to published.
 */
export function approvalPatch(
  m: ApprovalSubject,
  userId: string,
  now: Date,
): { status: "draft" | "published"; approved_at: string; approved_by_user_id: string } {
  return {
    status: m.status === "applied" || isUnwelcomedJoinApplicant(m) ? "draft" : "published",
    approved_at: now.toISOString(),
    approved_by_user_id: userId,
  };
}

/**
 * Whether the roster shows Approve. Hidden on published rows, and on the
 * Draft of a Join applicant never welcomed yet: Approve could only leave it
 * in Draft, and publishing it is done from "Edit as them".
 */
export function rosterShowsApprove(m: ApprovalSubject): boolean {
  if (m.status === "published") return false;
  return !(m.status === "draft" && isUnwelcomedJoinApplicant(m));
}

/** The welcome email goes out once, on the first publish of a member who applied through Join. */
export function shouldSendWelcome(m: {
  status: MemberStatus;
  applied_via_join_at: string | null;
  join_welcomed_at: string | null;
}): boolean {
  return m.status === "published" && m.applied_via_join_at !== null && m.join_welcomed_at === null;
}
