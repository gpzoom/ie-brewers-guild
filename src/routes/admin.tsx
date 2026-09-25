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
    // The member's name shows in the top bar for everyone (artboard
    // AdminBasics) and names who's being edited in the impersonation band.
    const [publishGateData, memberName] = await Promise.all([
      getPublishGateData({ data: { memberId: context.memberId } }),
      getMemberDisplayName({ data: { memberId: context.memberId } }),
    ]);
    return { publishGateData, memberName };
  },
  head: () => ({ meta: [{ title: "Member admin — Inland Southern California Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { memberId, isImpersonating } = Route.useRouteContext();
  const { publishGateData, memberName } = Route.useLoaderData();
  return (
    <AdminShell
      memberId={memberId}
      memberName={memberName}
      isImpersonating={isImpersonating}
      impersonatedMemberName={isImpersonating ? memberName : null}
      previewHref={`/members/${publishGateData.slug}`}
      isPublished={publishGateData.status === "published"}
      publishSlot={<PublishGateDialog memberId={memberId} initial={publishGateData} />}
    >
      <Outlet />
    </AdminShell>
  );
}
