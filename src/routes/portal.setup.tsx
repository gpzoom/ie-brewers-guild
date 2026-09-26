import { useMemo } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getPortalSetupShell } from "@/lib/portal/portal-setup.server";
import { DraftStatusProvider } from "@/components/admin/DraftStatusContext";
import {
  MemberEditingProvider,
  type MemberEditingValue,
} from "@/components/admin/MemberEditingContext";

/**
 * /portal/setup: the setup wizard's layout (plan phase 4). Its beforeLoad
 * resolves the member from the session on every navigation
 * (getPortalSetupShell -> requirePortalMember): signed out -> sign-in
 * (returning to /portal), no single business -> /portal, a Photos & events
 * editor -> /portal. The step route under it does the per-step
 * gatekeeping from the shell it puts in context.
 *
 * It provides what the editor components need from their surroundings --
 * the member editing context and the draft status -- the same two
 * providers the /admin layout has, so the editors behave identically in
 * both places. /portal is already a canvas + bare route prefix in
 * __root.tsx (light theme, no site header/footer).
 */
export const Route = createFileRoute("/portal/setup")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  beforeLoad: async () => ({ shell: await getPortalSetupShell() }),
  head: () => ({
    meta: [
      { title: "Set up your profile — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SetupLayout,
});

function SetupLayout() {
  const { shell } = Route.useRouteContext();
  const editing = useMemo<MemberEditingValue>(
    () => ({
      memberId: shell.memberId,
      memberName: shell.memberName,
      memberType: shell.memberType,
      role: shell.draftStatus.role,
      isImpersonating: shell.isImpersonating,
      isPublished: shell.status === "published",
      slug: shell.slug,
      surface: "portal",
      paths: {
        // The Basics step closes once setup is complete; the portal's Basics
        // & hours section is the link target from then on.
        basics: shell.setupCompleted ? { to: "/portal/basics" } : { to: "/portal/setup/basics" },
        hours: { to: "/portal/setup/hours" },
        events:
          shell.memberType === "mobile"
            ? { to: "/portal/setup/hours" }
            : { to: "/portal/setup/events" },
      },
    }),
    [shell],
  );
  return (
    <MemberEditingProvider value={editing}>
      <DraftStatusProvider initial={shell.draftStatus}>
        <Outlet />
      </DraftStatusProvider>
    </MemberEditingProvider>
  );
}
