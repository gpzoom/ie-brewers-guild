/**
 * Which member_users row is "the account" of a member: the owner's. A
 * handed-off location also has the business manager linked as an editor,
 * and that older link must never be mistaken for the location's account.
 * Members with no owner row keep the original rule: the earliest row.
 * `rows` must already be ordered by created_at ascending.
 */
export function pickAccountUserId(
  rows: Array<{ user_id: string; role: string | null }> | null | undefined,
): string | null {
  if (!rows || rows.length === 0) return null;
  return (rows.find((r) => r.role === "owner") ?? rows[0]).user_id;
}

/**
 * Everyone who receives the Guild's emails "to the member": the owner first,
 * then each co-owner in created_at order. Business-manager editor rows never
 * qualify. With neither an owner nor a co-owner, the earliest row (the
 * original rule). `rows` must already be ordered by created_at ascending.
 */
export function pickOwnerLevelUserIds(
  rows: Array<{ user_id: string; role: string | null }> | null | undefined,
): string[] {
  if (!rows || rows.length === 0) return [];
  const owners = rows.filter((r) => r.role === "owner").map((r) => r.user_id);
  const coOwners = rows.filter((r) => r.role === "co_owner").map((r) => r.user_id);
  const ids = [...owners.slice(0, 1), ...coOwners];
  return ids.length > 0 ? ids : [rows[0].user_id];
}
