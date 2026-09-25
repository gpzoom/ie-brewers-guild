import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { getPublishGateData } from "@/lib/hours/publish-gate.server";
import { getMemberDisplayName } from "@/lib/guild/impersonation.server";
import { AdminShell } from "@/components/admin/AdminShell";
import { PublishGateDialog } from "@/components/admin/PublishGateDialog";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await requireMemberSession();
    return {
      memberId: session.memberId,
      userId: session.userId,
      isImpersonating: session.isImpersonating,
    };
  },
  loader: async ({ context }) => {
    const [publishGateData, impersonatedMemberName] = await Promise.all([
      getPublishGateData({ data: { memberId: context.memberId } }),
      context.isImpersonating
        ? getMemberDisplayName({ data: { memberId: context.memberId } })
        : Promise.resolve(null),
    ]);
    return { publishGateData, impersonatedMemberName };
  },
  head: () => ({ meta: [{ title: "Member admin — Inland Southern California Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { memberId, isImpersonating } = Route.useRouteContext();
  const { publishGateData, impersonatedMemberName } = Route.useLoaderData();
  return (
    <AdminShell
      memberId={memberId}
      isImpersonating={isImpersonating}
      impersonatedMemberName={impersonatedMemberName}
      publishSlot={<PublishGateDialog memberId={memberId} initial={publishGateData} />}
    >
      <Outlet />
    </AdminShell>
  );
}
