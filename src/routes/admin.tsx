import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await requireMemberSession();
    return { memberId: session.memberId, userId: session.userId };
  },
  head: () => ({ meta: [{ title: "Member admin — IE Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { memberId } = Route.useRouteContext();
  return (
    <AdminShell memberId={memberId}>
      <Outlet />
    </AdminShell>
  );
}
