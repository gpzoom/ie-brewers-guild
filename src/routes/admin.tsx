import { Fragment } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { getPublishGateData } from "@/lib/hours/publish-gate.server";
import { getDraftStatus } from "@/lib/drafts/drafts.server";
import { getMemberDisplayName } from "@/lib/guild/impersonation.server";
import { AdminShell } from "@/components/admin/AdminShell";
import { PublishGateDialog } from "@/components/admin/PublishGateDialog";
import { DraftStatusProvider, useDraftStatus } from "@/components/admin/DraftStatusContext";

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
    // getDraftStatus drives the Unpublished changes label and the
    // Publish / Discard / Move back to draft controls; the editors report
    // their saves to it (DraftStatusContext), which re-runs just this loader.
    const [publishGateData, memberName, draftStatus] = await Promise.all([
      getPublishGateData({ data: { memberId: context.memberId } }),
      getMemberDisplayName({ data: { memberId: context.memberId } }),
      getDraftStatus({ data: { memberId: context.memberId } }),
    ]);
    return { publishGateData, memberName, draftStatus };
  },
  head: () => ({ meta: [{ title: "Member admin — Inland Southern California Brewers Guild" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { draftStatus } = Route.useLoaderData();
  return (
    <DraftStatusProvider initial={draftStatus}>
      <AdminLayoutInner />
    </DraftStatusProvider>
  );
}

function AdminLayoutInner() {
  const { memberId, isImpersonating } = Route.useRouteContext();
  const { publishGateData, memberName } = Route.useLoaderData();
  const epoch = useDraftStatus()?.epoch ?? 0;
  const isPublished = publishGateData.status === "published";
  return (
    <AdminShell
      memberId={memberId}
      memberName={memberName}
      isImpersonating={isImpersonating}
      impersonatedMemberName={isImpersonating ? memberName : null}
      previewHref="/admin/preview"
      liveHref={isPublished ? `/members/${publishGateData.slug}` : undefined}
      publishSlot={<PublishGateDialog memberId={memberId} initial={publishGateData} />}
    >
      {/* Remounted after a discard so every editor starts again from the reloaded draft. */}
      <Fragment key={epoch}>
        <Outlet />
      </Fragment>
    </AdminShell>
  );
}
