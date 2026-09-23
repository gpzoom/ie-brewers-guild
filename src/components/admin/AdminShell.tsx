import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { stopImpersonation } from "@/lib/guild/impersonation.server";
import { signOutEverything } from "@/lib/auth/sign-out.server";

const NAV_ITEMS = [
  { to: "/admin/basics", label: "Basics" },
  { to: "/admin/hours", label: "Hours" },
  { to: "/admin/media", label: "Media" },
  { to: "/admin/events", label: "Events" },
  { to: "/admin/links", label: "Links & contact" },
  { to: "/admin/theme", label: "Theme" },
  { to: "/admin/discount", label: "Discount" },
] as const;

/**
 * Admin shell (spec, "Layout and breakpoints": "the admin panel ships
 * with phone and desktop layouts together, not desktop first... on a
 * phone the left rail becomes a horizontal tab strip... and Publish pins
 * to the bottom of the screen"). At `md:` and above, the horizontal tab
 * strip becomes a left vertical rail and the Publish control moves from a
 * bottom-pinned bar into a top bar above the section content.
 *
 * The Publish button itself is rendered by PublishGateDialog (Task 23),
 * passed in as `publishSlot` so this shell doesn't need to know about
 * publish-gate logic. It is rendered exactly ONCE below: PublishGateDialog
 * renders a Radix <Dialog>, whose <DialogContent> portals to
 * document.body (see src/components/ui/dialog.tsx's DialogPortal), so the
 * dialog's visible content is unaffected by CSS hidden/md:hidden on
 * whatever container it's nested in. Rendering `{publishSlot}` twice would
 * create two independent component instances with their own, unsynced
 * `open`/`confirmed`/`currentStatus` useState -- e.g. resizing across the
 * `md` breakpoint while the mobile instance's dialog is open would leave
 * it open (portaled, so untouched by md:hidden) while also exposing the
 * desktop instance's own, separate Publish button/dialog. Instead, a
 * single instance's WRAPPING element repositions itself responsively:
 * `fixed inset-x-0 bottom-0` (pinned bottom bar, viewport-relative
 * regardless of DOM nesting) at phone widths, `md:static` (back into
 * normal document flow, right-justified, above <main>) at `md:` and up.
 */
export function AdminShell({
  memberId,
  isImpersonating = false,
  impersonatedMemberName = null,
  publishSlot,
  children,
}: {
  memberId: string;
  isImpersonating?: boolean;
  impersonatedMemberName?: string | null;
  publishSlot?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  async function handleSignOut() {
    await signOutEverything();
    await router.navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {isImpersonating && (
        <div
          role="alert"
          className="flex min-h-11 flex-wrap items-center justify-between gap-2 bg-danger px-4 py-2 text-sm font-medium text-white"
        >
          <span>
            Editing as {impersonatedMemberName ?? "this member"}. Every change here is logged against your own
            Guild admin account.
          </span>
          <button
            type="button"
            onClick={handleStop}
            className="min-h-11 rounded-md border border-white/60 px-3 py-1 font-semibold hover:bg-white/10"
          >
            Stop
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col pb-24 md:flex-row md:pb-0">
        <nav
          aria-label="Admin sections"
          className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-6"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted [&.active]:bg-primary/10 [&.active]:text-primary md:w-full"
              activeProps={{ className: "active" }}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleSignOut}
            className="ml-auto min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </nav>

        <div className="flex flex-1 flex-col">
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-3 md:static md:inset-auto md:z-auto md:flex md:justify-end md:border-b md:border-t-0 md:px-6 md:py-3">
            {publishSlot}
          </div>

          {/*
            Not a <main> -- the root layout (src/routes/__root.tsx) already
            renders one <main> around the whole route Outlet, /admin
            included. A second <main> here would be a duplicate landmark
            (invalid HTML, and two competing "main" regions for screen
            reader users).
          */}
          <div className="flex-1 px-4 py-6 md:px-8" data-member-id={memberId}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
