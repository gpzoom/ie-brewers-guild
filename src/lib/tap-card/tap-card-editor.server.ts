import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { STAFF_CODES_OWNER_ONLY } from "@/lib/tap-card/staff-codes";
import { isTrailStop } from "@/lib/tap-card/staff-qr";

/**
 * A brewery's own Scan Pass screens (Portal > Scan Pass and /admin/scan-pass).
 * The Scan Pass tables are server-only, so first ask the database whether the
 * signed-in person is the owner, a co-owner, a full editor, or a Guild admin
 * (Edit as them) of this member -- the is_member_full_editor check other
 * editors use -- and that it's a producer on the trail; only then hand back
 * the service-role client. No createServerFn here.
 */
export async function requireTapCardEditor(memberId: string) {
  return requireTapCardRole(memberId, "is_member_full_editor", "Only the owner or a full editor can manage the Scan Pass.");
}

/**
 * Staff codes and staff activity (spec 2026-11-23): the owner, a co-owner, or
 * a Guild admin (Edit as them). Not a full editor, who could be the person
 * being looked into.
 */
export async function requireTapCardOwner(memberId: string) {
  return requireTapCardRole(memberId, "is_member_owner_level", STAFF_CODES_OWNER_ONLY);
}

async function requireTapCardRole(memberId: string, rpc: "is_member_full_editor" | "is_member_owner_level", refusal: string) {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Please sign in again.");
  const { data: allowed, error } = await supabase.rpc(rpc, { target_member_id: memberId });
  if (error) throw new Error(error.message);
  if (allowed !== true) throw new Error(refusal);
  const service = await getSupabaseServiceRoleClient();
  const { data: member } = await service.from("members").select("member_type, trail_eligible").eq("id", memberId).maybeSingle();
  if (!member) throw new Error("Member not found.");
  // Universal card: every member has the Scan Pass; trailStop decides the Beer Trail parts.
  return { userId: auth.user.id, service, trailStop: isTrailStop({ memberType: member.member_type, trailEligible: member.trail_eligible === true }) };
}
