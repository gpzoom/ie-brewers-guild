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
