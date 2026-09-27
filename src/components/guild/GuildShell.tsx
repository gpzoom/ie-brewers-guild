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

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * The super admin's bell (docs/member-profiles.md, "Help button"): opens
 * Help messages, with the number still waiting. No number when none are.
 */
function HelpBell({ count }: { count: number }) {
  const label = count > 0 ? `Help messages: ${count} waiting` : "Help messages: none waiting";
  return (
    <Link
      to="/guild/help"
      search={{ show: "waiting" }}
      aria-label={label}
      title={label}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-canvas transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright"
    >
      <BellIcon className="h-[22px] w-[22px]" />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

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
 *
 * Super admin (docs/member-profiles.md, "Super admin"): the top bar reads
 * "Super admin" instead of "Guild admin", and a second sidebar group holds
 * the super-admin-only screens -- Brand & theme, Guild admins, Audit log,
 * Help messages -- and a bell in the top bar counts waiting Help messages.
 * A Guild admin doesn't see that group; the routes refuse them anyway.
 */
export function GuildShell({
  summary,
  isSuperAdmin,
  children,
}: {
  summary: GuildShellSummary;
  isSuperAdmin: boolean;
  children: ReactNode;
}) {
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
  const adminsActive = isActivePath(pathname, "/guild/admins");
  const auditActive = isActivePath(pathname, "/guild/audit");
  const helpActive = isActivePath(pathname, "/guild/help");
  const roleLabel = isSuperAdmin ? "Super admin" : "Guild admin";

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <AppTopBar label={`ISC Brewers Guild · ${roleLabel}`} shortLabel={roleLabel}>
        {isSuperAdmin && <HelpBell count={summary.waitingHelpCount ?? 0} />}
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
            to="/guild/categories"
            aria-current={categoriesActive ? "page" : undefined}
            className={sidebarItemClass(categoriesActive)}
          >
            Categories
          </Link>

          {isSuperAdmin && (
            <>
              <div aria-hidden="true" className="hidden md:block md:h-5" />
              <SidebarGroupLabel>Super admin</SidebarGroupLabel>
              <Link
                to="/guild/brand"
                aria-current={brandActive ? "page" : undefined}
                className={sidebarItemClass(brandActive)}
              >
                Brand &amp; theme
              </Link>
              <Link
                to="/guild/admins"
                aria-current={adminsActive ? "page" : undefined}
                className={sidebarItemClass(adminsActive)}
              >
                Guild admins
              </Link>
              <Link
                to="/guild/audit"
                aria-current={auditActive ? "page" : undefined}
                className={sidebarItemClass(auditActive)}
              >
                Audit log
              </Link>
              <Link
                to="/guild/help"
                search={{ show: "waiting" }}
                aria-current={helpActive ? "page" : undefined}
                className={sidebarItemClass(helpActive)}
              >
                Help messages
                {summary.waitingHelpCount !== null && summary.waitingHelpCount > 0 && (
                  <span
                    className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white"
                    aria-label={`${summary.waitingHelpCount} waiting`}
                  >
                    {summary.waitingHelpCount}
                  </span>
                )}
              </Link>
            </>
          )}

          <SidebarSignOut onClick={handleSignOut} />
        </nav>

        {/* Not a <main> -- __root.tsx's own <main> already wraps this Outlet. */}
        <div className="min-w-0 flex-1 px-4 pb-10 pt-5 md:px-9 md:py-[30px]">{children}</div>
      </div>
    </div>
  );
}
