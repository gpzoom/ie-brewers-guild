import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { signOutEverything } from "@/lib/auth/sign-out.server";
import type { GuildShellSummary } from "@/lib/guild/guild-shell.server";
import {
  AppTopBar,
  SidebarGroupLabel,
  SidebarSignOut,
  sidebarItemClass,
  sidebarNavClass,
  topBarOutlineClass,
} from "@/components/shell/AppChrome";

function isActivePath(pathname: string, prefix: string) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

/**
 * Guild admin shell (artboards GuildMembers / GuildApprovals): the same
 * near-black top bar as the member admin ("ISC BREWERS GUILD · GUILD
 * ADMIN", plus a "View site" link back to the public site and the admin's
 * email) over a 236px "GUILD" sidebar. On a phone the sidebar becomes a
 * horizontally scrolling tab strip under the top bar, like the member
 * admin's.
 *
 * /guild is a bare route in __root.tsx, so this is the only chrome on
 * every /guild/<section> page -- the public header, footer and the old
 * Guild strip under the public header are gone here (owner decision,
 * docs/design/README.md).
 */
export function GuildShell({ summary, children }: { summary: GuildShellSummary; children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await signOutEverything();
    await router.navigate({ to: "/" });
  }

  const inquiriesActive = isActivePath(pathname, "/guild/inquiries");
  const membersActive = isActivePath(pathname, "/guild/roster");
  const brandActive = isActivePath(pathname, "/guild/brand");
  const categoriesActive = isActivePath(pathname, "/guild/categories");

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <AppTopBar label="ISC Brewers Guild · Guild admin" shortLabel="Guild admin">
        {summary.adminEmail && (
          <span className="hidden max-w-[18rem] truncate text-[13px] text-text-muted md:inline">
            {summary.adminEmail}
          </span>
        )}
        <a href="/" className={`${topBarOutlineClass} max-md:h-11 max-md:border-0 max-md:px-2.5 max-md:text-text-muted`}>
          View site
        </a>
      </AppTopBar>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav aria-label="Guild admin sections" className={sidebarNavClass}>
          <SidebarGroupLabel>Guild</SidebarGroupLabel>

          <Link
            to="/guild/inquiries"
            search={{ filter: "open" }}
            aria-current={inquiriesActive ? "page" : undefined}
            className={sidebarItemClass(inquiriesActive)}
          >
            Inquiries
            {summary.openInquiryCount !== null && summary.openInquiryCount > 0 && (
              <span
                className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white"
                aria-label={`${summary.openInquiryCount} open`}
              >
                {summary.openInquiryCount}
              </span>
            )}
          </Link>

          <Link
            to="/guild/roster"
            aria-current={membersActive ? "page" : undefined}
            className={sidebarItemClass(membersActive)}
          >
            Members
            {summary.memberCount !== null && (
              <span
                className={`text-[11px] font-normal ${membersActive ? "text-ink-subtle md:text-text-muted" : "text-ink-subtle"}`}
                aria-label={`${summary.memberCount} members`}
              >
                {summary.memberCount}
              </span>
            )}
          </Link>

          <span
            aria-disabled="true"
            className="flex min-h-12 shrink-0 items-center justify-between gap-2 whitespace-nowrap px-2.5 text-[13px] text-ink-subtle md:min-h-11 md:px-3 md:text-sm"
          >
            Applications
            <span className="text-[10px] tracking-[0.08em] text-ink-subtle">SOON</span>
          </span>

          <Link
            to="/guild/brand"
            aria-current={brandActive ? "page" : undefined}
            className={sidebarItemClass(brandActive)}
          >
            Brand &amp; theme
          </Link>

          <Link
            to="/guild/categories"
            aria-current={categoriesActive ? "page" : undefined}
            className={sidebarItemClass(categoriesActive)}
          >
            Categories
          </Link>

          <SidebarSignOut onClick={handleSignOut} />
        </nav>

        {/* Not a <main> -- __root.tsx's own <main> already wraps this Outlet. */}
        <div className="min-w-0 flex-1 px-4 pb-10 pt-5 md:px-9 md:py-[30px]">{children}</div>
      </div>
    </div>
  );
}
