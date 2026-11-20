import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isTrailStop } from "@/lib/tap-card/staff-qr";

/**
 * A brewery's own Tap Card screens (Portal > Tap Card and /admin/tap-card).
 * The Tap Card tables are server-only, so first ask the database whether the
 * signed-in person is the owner, a co-owner, a full editor, or a Guild admin
 * (Edit as them) of this member -- the is_member_full_editor check other
 * editors use -- and that it's a producer on the trail; only then hand back
 * the service-role client. No createServerFn here.
 */
export async function requireTapCardEditor(memberId: string) {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Please sign in again.");
  const { data: allowed, error } = await supabase.rpc("is_member_full_editor", { target_member_id: memberId });
  if (error) throw new Error(error.message);
  if (allowed !== true) throw new Error("Only the owner or a full editor can manage the Tap Card.");
  const service = await getSupabaseServiceRoleClient();
  const { data: member } = await service.from("members").select("member_type, trail_eligible").eq("id", memberId).maybeSingle();
  if (!member) throw new Error("Member not found.");
  // Universal card: every member has the Tap Card; trailStop decides the Beer Trail parts.
  return { userId: auth.user.id, service, trailStop: isTrailStop({ memberType: member.member_type, trailEligible: member.trail_eligible === true }) };
}
