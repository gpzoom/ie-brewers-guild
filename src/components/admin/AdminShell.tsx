import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
 * Mobile-first admin shell (spec, "Layout and breakpoints": "the admin
 * panel ships with phone and desktop layouts together, not desktop
 * first... on a phone the left rail becomes a horizontal tab strip... and
 * Publish pins to the bottom of the screen"). This task builds ONLY the
 * phone behavior -- every class below applies at every width until Task 32
 * adds the md: breakpoint overrides that turn the top strip into a left
 * rail and un-pin the Publish bar, per the spec's own stated build order.
 *
 * The Publish button itself is rendered by PublishGateDialog (Task 23),
 * passed in as `publishSlot` so this shell doesn't need to know about
 * publish-gate logic.
 */
export function AdminShell({
  memberId,
  publishSlot,
  children,
}: {
  memberId: string;
  publishSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col pb-24">
      <nav
        aria-label="Admin sections"
        className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted [&.active]:bg-primary/10 [&.active]:text-primary"
            activeProps={{ className: "active" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 px-4 py-6" data-member-id={memberId}>
        {children}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-3">
        {publishSlot}
      </div>
    </div>
  );
}
