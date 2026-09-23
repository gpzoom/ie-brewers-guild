import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { getPublishGateData } from "@/lib/hours/publish-gate.server";
import { AdminShell } from "@/components/admin/AdminShell";
import { PublishGateDialog } from "@/components/admin/PublishGateDialog";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await requireMemberSession();
    return { memberId: session.memberId, userId: session.userId };
  },
  loader: async ({ context }) => getPublishGateData({ data: { memberId: context.memberId } }),
  head: () => ({ meta: [{ title: "Member admin — IE Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { memberId } = Route.useRouteContext();
  const { status, memberType, hoursConfirmedAt, hours, specialHours, appearanceStartTimes } =
    Route.useLoaderData();
  return (
    <AdminShell
      memberId={memberId}
      publishSlot={
        <PublishGateDialog
          memberId={memberId}
          memberType={memberType}
          status={status}
          hoursConfirmedAt={hoursConfirmedAt}
          hours={hours}
          specialHours={specialHours}
          appearanceStartTimes={appearanceStartTimes}
        />
      }
    >
      <Outlet />
    </AdminShell>
  );
}
