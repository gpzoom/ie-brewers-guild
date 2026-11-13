import { createFileRoute } from "@tanstack/react-router";
import { listMemberNotifications } from "@/lib/notifications/portal.server";
import { NotificationsView } from "@/components/portal/NotificationsView";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

/**
 * /admin/notifications: the portal's Notifications screen on /admin, so a
 * Guild admin's Edit as them sees what the member sees (spec 2026-11-13).
 */
export const Route = createFileRoute("/admin/notifications")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's notifications while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: () => listMemberNotifications({ data: { surface: "admin" } }),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { memberId: dataMemberId, groups } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={dataMemberId}>
      <NotificationsView initial={groups} surface="admin" />
    </SameMemberGuard>
  );
}
