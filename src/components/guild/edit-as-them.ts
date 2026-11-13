import { startImpersonation } from "@/lib/guild/impersonation.server";

type RouterLike = {
  invalidate: () => Promise<unknown>;
  navigate: (opts: { to: string }) => Promise<unknown>;
};

/**
 * "Edit as them": starts editing as the member, marks every loaded page
 * stale (so nothing loaded for a previously edited member shows for this
 * one), then opens the given /admin screen. Throws on failure; callers show
 * their own error.
 */
export async function editAsThem(
  router: RouterLike,
  memberId: string,
  path: string = "/admin/basics",
): Promise<void> {
  await startImpersonation({ data: { memberId } });
  await router.invalidate();
  await router.navigate({ to: path });
}
