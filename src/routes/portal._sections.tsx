import { Fragment, useMemo } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { getPortalShell } from "@/lib/portal/portal-shell.server";
import { PORTAL_SECTION_LABELS, portalSectionsFor } from "@/lib/portal/portal-sections";
import { AdminShell, type ShellNavItem } from "@/components/admin/AdminShell";
import { PublishGateDialog } from "@/components/admin/PublishGateDialog";
import { DraftStatusProvider, useDraftStatus } from "@/components/admin/DraftStatusContext";
import {
  MemberEditingProvider,
  type MemberEditingValue,
} from "@/components/admin/MemberEditingContext";
import { sidebarItemClass } from "@/components/shell/AppChrome";

/**
 * The portal's layout (plan phase 5; docs/member-profiles.md, "Routes":
 * /portal/[section]) -- pathless, so the sections sit at /portal/basics,
 * /portal/photos and so on. Its beforeLoad resolves the member from the
 * session on every navigation (getPortalShell -> requirePortalMember):
 * signed out -> sign-in, no single business -> /portal, setup not done
 * (owner or full editor) -> /portal, which starts the wizard.
 *
 * The shell is /admin's (AdminShell: top bar with Preview and the publish
 * controls, the section sidebar), with the portal's sections for the
 * viewer's role, and the same two providers the /admin layout has, so
 * every editor behaves exactly as it does there.
 */
export const Route = createFileRoute("/portal/_sections")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  beforeLoad: async () => ({ shell: await getPortalShell() }),
  head: () => ({
    meta: [
      { title: "Member Portal — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PortalLayout,
});

function PortalLayout() {
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
        basics: shell.role === "media_events" ? null : { to: "/portal/basics" },
        hours: shell.role === "media_events" ? null : { to: "/portal/basics", hash: "hours" },
        events: { to: "/portal/events" },
      },
    }),
    [shell],
  );
  // key={memberId}: switching business must never carry the previous
  // member's draft status or editor state over.
  return (
    <MemberEditingProvider key={shell.memberId} value={editing}>
      <DraftStatusProvider initial={shell.draftStatus}>
        <PortalLayoutInner />
      </DraftStatusProvider>
    </MemberEditingProvider>
  );
}

function PortalLayoutInner() {
  const { shell } = Route.useRouteContext();
  const epoch = useDraftStatus()?.epoch ?? 0;
  const isPublished = shell.status === "published";
  const navItems: ShellNavItem[] = portalSectionsFor(shell).map((section) => ({
    to: `/portal/${section}`,
    label: PORTAL_SECTION_LABELS[section].label,
    short: PORTAL_SECTION_LABELS[section].short,
    match: [`/portal/${section}`],
  }));
  return (
    <AdminShell
      memberId={shell.memberId}
      memberName={shell.memberName}
      isImpersonating={shell.isImpersonating}
      impersonatedMemberName={shell.isImpersonating ? shell.memberName : null}
      previewHref="/portal/preview"
      liveHref={isPublished ? `/members/${shell.slug}` : undefined}
      publishSlot={<PublishGateDialog memberId={shell.memberId} initial={shell.publishGate} />}
      navItems={navItems}
      topBarLabel="ISC Brewers Guild · Member Portal"
      sidebarExtra={
        shell.membershipCount > 1 ? (
          <Link to="/portal" search={{ switch: true }} className={sidebarItemClass(false)}>
            <span className="md:hidden">Switch</span>
            <span className="hidden md:inline">Switch business</span>
          </Link>
        ) : null
      }
    >
      {/* Remounted after a discard so every editor starts again from the reloaded draft. */}
      <Fragment key={`${shell.memberId}:${epoch}`}>
        <Outlet />
      </Fragment>
    </AdminShell>
  );
}
