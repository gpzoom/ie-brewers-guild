import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { stopImpersonation } from "@/lib/guild/impersonation.server";
import { signOutEverything } from "@/lib/auth/sign-out.server";
import {
  AppTopBar,
  SidebarSignOut,
  StatusBand,
  bandButtonClass,
  sidebarItemClass,
  sidebarNavClass,
  topBarOutlineClass,
} from "@/components/shell/AppChrome";

// Order follows artboard AdminBasics's sidebar; Discount has no artboard
// and keeps its place at the end. `short` is the phone tab-strip label
// (artboard AdminPhone). "Basics & hours" is one item for both
// /admin/basics and /admin/hours -- the pages themselves merge in a later
// stage; until then /admin/hours still works and still lights this item.
export type ShellNavItem = {
  to: string;
  label: string;
  short: string;
  /** Paths that light this item (the item's own path and anything under it). */
  match: readonly string[];
};

const NAV_ITEMS: readonly ShellNavItem[] = [
  { to: "/admin/basics", label: "Basics & hours", short: "Basics", match: ["/admin/basics", "/admin/hours"] },
  { to: "/admin/media", label: "Photos & video", short: "Photos", match: ["/admin/media"] },
  { to: "/admin/theme", label: "Theme", short: "Theme", match: ["/admin/theme"] },
  { to: "/admin/links", label: "Links & contact", short: "Links", match: ["/admin/links"] },
  { to: "/admin/events", label: "Events", short: "Events", match: ["/admin/events"] },
  { to: "/admin/discount", label: "Discount", short: "Discount", match: ["/admin/discount"] },
];

function isActivePath(pathname: string, prefixes: readonly string[]) {
  const normalized = pathname.replace(/\/+$/, "");
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

/**
 * Member admin shell (artboards AdminBasics = desktop, AdminPhone = phone;
 * spec, "Layout and breakpoints": the admin ships phone and desktop
 * layouts together). A near-black top bar -- label, the member's name,
 * Preview, Publish -- over a 236px left sidebar ("YOUR PROFILE") and the
 * section content. On a phone the sidebar becomes a horizontal tab strip
 * under the top bar, Preview stays in the top bar as a text link, and the
 * Publish control pins to the bottom of the screen.
 *
 * The Publish control itself is rendered by PublishGateDialog, passed in
 * as `publishSlot` so this shell doesn't need to know about publish-gate
 * logic. It is rendered exactly ONCE below: PublishGateDialog renders a
 * Radix <Dialog>, whose <DialogContent> portals to document.body, so the
 * dialog's visible content is unaffected by CSS hidden/md:hidden on
 * whatever container it's nested in. Rendering `{publishSlot}` twice would
 * create two independent component instances with their own, unsynced
 * `open`/`confirmed`/`currentStatus` useState -- e.g. resizing across the
 * `md` breakpoint while the phone instance's dialog is open would leave it
 * open while also exposing the desktop instance's own, separate Publish
 * button/dialog. Instead, a single instance's WRAPPING element repositions
 * itself responsively: `fixed inset-x-0 bottom-0` (pinned bottom bar,
 * viewport-relative -- nothing above it sets a transform/filter) at phone
 * widths, `md:static` (back into the top bar's flow) at `md:` and up. The
 * Preview link is a plain stateless link, so it lives here instead and is
 * free to change shape per breakpoint.
 */
export function AdminShell({
  memberId,
  memberName = null,
  isImpersonating = false,
  impersonatedMemberName = null,
  previewHref,
  liveHref,
  publishSlot,
  navItems = NAV_ITEMS,
  topBarLabel = "ISC Brewers Guild · Member admin",
  sidebarExtra,
  children,
}: {
  memberId: string;
  memberName?: string | null;
  isImpersonating?: boolean;
  impersonatedMemberName?: string | null;
  /** The draft preview (/admin/preview). */
  previewHref?: string;
  /** The live public page, once the member is published. */
  liveHref?: string;
  publishSlot?: ReactNode;
  /** The sidebar's sections; /admin's by default (the portal passes its own, per role). */
  navItems?: readonly ShellNavItem[];
  topBarLabel?: string;
  /** Anything under the sections, above Sign out (the portal's Switch business). */
  sidebarExtra?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  async function handleSignOut() {
    await signOutEverything();
    await router.navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      {isImpersonating && (
        <StatusBand
          message={
            <>
              You are editing as {impersonatedMemberName ?? "this member"}. Changes are saved to their
              draft and go live when you publish.
            </>
          }
          actions={
            <button type="button" onClick={handleStop} className={bandButtonClass}>
              Stop
            </button>
          }
        />
      )}

      <AppTopBar label={topBarLabel} shortLabel={memberName ?? "Member admin"}>
        {memberName && (
          <span className="hidden max-w-[16rem] truncate text-[13px] text-text-muted xl:inline">
            {memberName}
          </span>
        )}
        {previewHref && (
          <a
            href={previewHref}
            target="_blank"
            rel="noopener"
            className={`${topBarOutlineClass} max-md:h-11 max-md:border-0 max-md:px-2.5 max-md:text-text-muted`}
          >
            Preview
          </a>
        )}
        {liveHref && (
          <a
            href={liveHref}
            target="_blank"
            rel="noopener"
            className={`${topBarOutlineClass} max-md:h-11 max-md:border-0 max-md:px-2.5 max-md:text-text-muted`}
          >
            <span className="md:hidden">Live page</span>
            <span className="hidden md:inline">View profile</span>
          </a>
        )}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-canvas-2 bg-canvas px-4 pb-4 pt-3 md:static md:inset-auto md:z-auto md:border-0 md:bg-transparent md:p-0">
          {publishSlot}
        </div>
      </AppTopBar>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav aria-label="Admin sections" className={sidebarNavClass}>
          {/* Whose profile this is, always in view -- especially while a Guild
              admin is editing as a member. Phones show the name in the top bar. */}
          <div className="hidden px-3 pb-3 font-display text-[19px] font-bold leading-tight tracking-[-0.01em] text-ink normal-case [overflow-wrap:anywhere] md:block">
            {memberName ? `${memberName} Profile` : "Your profile"}
          </div>
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.match);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={sidebarItemClass(active)}
              >
                <span className="md:hidden">{item.short}</span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
          {sidebarExtra}
          <SidebarSignOut onClick={handleSignOut} />
        </nav>

        {/*
          Not a <main> -- the root layout (src/routes/__root.tsx) already
          renders one <main> around the whole route Outlet, /admin
          included. A second <main> here would be a duplicate landmark.
          pb-56 on a phone keeps the last field clear of the pinned
          Publish bar.
        */}
        <div className="min-w-0 flex-1 px-4 pb-56 pt-5 md:px-9 md:py-[30px]" data-member-id={memberId}>
          {children}
        </div>
      </div>
    </div>
  );
}
