/**
 * Who may load a PRIVATE gallery file through /api/admin-media/$assetId
 * (the member's own editors, the draft preview, the setup wizard). Pure, so
 * the route and the tests share one rule. The route resolves the inputs
 * from the session the same way the Member Portal does
 * (portal-session.server.ts):
 *
 * - Not signed in -> no.
 * - A valid "Edit as them" cookie started by THIS signed-in user -> only
 *   the impersonated member's files. (A cookie started by someone else is
 *   ignored, as /portal ignores it.)
 * - Otherwise -> the file's member must be one the user is linked to in
 *   member_users (any role; a Guild admin who is also linked counts, like
 *   anyone else) -- the same rule RLS applies to media_assets.
 * - Shared look (multi-location part 4): in a one-manager business the
 *   logo, cover and link-preview image live in ONE location's gallery. A
 *   viewer who may edit another location X of that business (linked to X,
 *   or editing as X) may also see the photo when it is X's current draft
 *   or live logo, cover or link preview -- never a sibling's other
 *   gallery photos. The route works out sharedLookMembers.
 *
 * Anything else is a flat 404 in the route, so a caller can never tell a
 * real asset id from a made-up one.
 */
export type AdminMediaAccessInput = {
  userId: string | null;
  /** From a verified, unexpired impersonation cookie, or null. */
  impersonation: { actorUserId: string; memberId: string } | null;
  /** The member that owns the requested asset. */
  assetMemberId: string;
  /** Whether member_users links the user to assetMemberId (only asked when it matters). */
  isLinkedToAssetMember: boolean;
  /**
   * Other locations of the asset member's one-manager business whose
   * current draft or live logo, cover or link preview is this asset, and
   * whether member_users links the user to each. Empty (or left out)
   * otherwise.
   */
  sharedLookMembers?: { memberId: string; isLinked: boolean }[];
};

export function canViewAdminMedia(input: AdminMediaAccessInput): boolean {
  if (!input.userId) return false;
  const shared = input.sharedLookMembers ?? [];
  if (input.impersonation && input.impersonation.actorUserId === input.userId) {
    const editingAs = input.impersonation.memberId;
    return editingAs === input.assetMemberId || shared.some((m) => m.memberId === editingAs);
  }
  return input.isLinkedToAssetMember || shared.some((m) => m.isLinked);
}

/** Whether the route needs to look up member_users at all for this request. */
export function needsMembershipLookup(input: {
  userId: string | null;
  impersonation: { actorUserId: string } | null;
}): boolean {
  if (!input.userId) return false;
  return !(input.impersonation && input.impersonation.actorUserId === input.userId);
}
