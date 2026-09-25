import type { ReactNode } from "react";
import logo from "@/assets/logo.svg";

/**
 * Pieces shared by the member admin shell (src/components/admin/AdminShell.tsx)
 * and the Guild admin shell (src/components/guild/GuildShell.tsx) -- the
 * design canvas's app chrome (docs/design/README.md, artboards
 * AdminBasics / AdminPhone / GuildMembers / GuildApprovals): a near-black
 * top bar, a 236px left sidebar of 44px items with a dark active pill, and
 * the accent "editing as" band.
 */

/**
 * The 64px (56px on a phone) near-black top bar. `label` is the full
 * letterspaced label ("ISC BREWERS GUILD · MEMBER ADMIN"); `shortLabel` is
 * what a phone shows instead ("MEMBER ADMIN"), per artboard AdminPhone.
 */
export function AppTopBar({
  label,
  shortLabel,
  children,
}: {
  label: string;
  shortLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-bg px-3.5 md:h-16 md:px-7">
      <div className="flex min-w-0 items-center gap-[11px]">
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-surface-2 md:flex">
          <img src={logo} alt="" className="h-5 w-5 object-contain" />
        </span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          <span className="md:hidden">{shortLabel}</span>
          <span className="hidden md:inline">{label}</span>
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3">{children}</div>
    </div>
  );
}

/** Outline button/link on the dark top bar (the artboards' "Preview"). */
export const topBarOutlineClass =
  "inline-flex h-10 shrink-0 items-center rounded-[9px] border border-border-dark px-4 text-[13px] font-medium text-canvas transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright";

/** "YOUR PROFILE" / "GUILD" -- the sidebar's 10px letterspaced group label. */
export function SidebarGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="hidden px-3 pb-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-subtle md:block">
      {children}
    </div>
  );
}

/**
 * One nav item's classes. Phone: a tab in the horizontal strip under the
 * top bar (underline when active, artboard AdminPhone). md and up: a 44px
 * row in the 236px sidebar, active = dark ink pill with light text.
 */
export function sidebarItemClass(active: boolean) {
  const base =
    "flex min-h-12 shrink-0 items-center justify-between gap-2 whitespace-nowrap border-b-2 px-2.5 text-[13px] no-underline transition-colors md:min-h-11 md:rounded-[9px] md:border-b-0 md:px-3 md:text-sm";
  return active
    ? `${base} border-ink font-semibold text-ink md:bg-ink md:text-canvas`
    : `${base} border-transparent text-ink-muted hover:text-ink md:text-ink md:hover:bg-canvas-2`;
}

/** Classes for the nav's container: horizontal strip on a phone, sidebar at md. */
export const sidebarNavClass =
  "flex shrink-0 gap-1 overflow-x-auto border-b border-canvas-2 bg-canvas px-3.5 md:w-[236px] md:flex-col md:gap-[3px] md:overflow-visible md:border-b-0 md:border-r md:px-4 md:py-[26px]";

/** Sign out, at the end of the phone strip / the bottom of the sidebar. */
export function SidebarSignOut({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto flex min-h-12 shrink-0 items-center whitespace-nowrap px-2.5 text-[13px] text-ink-muted hover:text-ink md:ml-0 md:mt-6 md:min-h-11 md:rounded-[9px] md:border-t md:border-canvas-2 md:px-3 md:pt-1 md:text-sm md:hover:bg-canvas-2"
    >
      Sign out
    </button>
  );
}

export function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** White outlined button/link for use on the accent or ink bands. */
export const bandButtonClass =
  "inline-flex min-h-11 shrink-0 items-center rounded-lg border border-white px-[15px] text-[13px] font-semibold text-white no-underline transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

/**
 * The non-dismissable band (artboard GuildMembers, "What 'Edit as them'
 * looks like"): accent fill, eye icon, white text, outlined white actions.
 * `tone="ink"` is the dark variant for notices that aren't impersonation
 * (e.g. a member previewing their own draft).
 */
export function StatusBand({
  message,
  actions,
  tone = "accent",
}: {
  message: ReactNode;
  actions?: ReactNode;
  tone?: "accent" | "ink";
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-2.5 text-white md:px-7 ${
        tone === "accent" ? "bg-brand" : "bg-ink"
      }`}
    >
      <EyeIcon className="shrink-0" />
      <div className="min-w-0 flex-1 basis-48 text-sm font-semibold">{message}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
