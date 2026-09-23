export type MemberClaimState = "unclaimed" | "invited_not_signed_in" | "claimed";

/**
 * Roster state, per the spec's "Migrating the existing members" and
 * "Roles" sections: a member nobody has written to yet (no member_users
 * row) is a different roster state from one who was invited and hasn't
 * signed in yet (a member_users row exists, but the invited auth.users
 * row's last_sign_in_at is still null). auth.users isn't queryable through
 * the normal RLS-scoped client, so the caller looks lastSignInAt up via
 * the service-role client's auth.admin.getUserById() and passes it in here
 * -- this function itself does no I/O.
 */
export function resolveMemberClaimState(input: {
  hasMemberUser: boolean;
  lastSignInAt: string | null;
}): MemberClaimState {
  if (!input.hasMemberUser) return "unclaimed";
  return input.lastSignInAt ? "claimed" : "invited_not_signed_in";
}
