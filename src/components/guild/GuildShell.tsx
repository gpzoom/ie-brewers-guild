import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { signOutEverything } from "@/lib/auth/sign-out.server";

const NAV_ITEMS = [
  { to: "/guild/roster", label: "Members" },
  { to: "/guild/inquiries", label: "Inquiries" },
  { to: "/guild/brand", label: "Brand & theme" },
  { to: "/guild/categories", label: "Categories" },
] as const;

/**
 * The Guild admin's own shell and nav. "Applications" is a disabled,
 * greyed-out entry -- per the task brief, the applications queue screen
 * itself is explicitly out of scope; this is only the nav placeholder the
 * spec's "Joining, later" section calls for ("the Guild admin nav already
 * has an Applications item marked SOON").
 */
export function GuildShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOutEverything();
    await router.navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <nav aria-label="Guild admin sections" className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted [&.active]:bg-primary/10 [&.active]:text-primary"
            activeProps={{ className: "active" }}
          >
            {item.label}
          </Link>
        ))}
        <span
          aria-disabled="true"
          className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground/50"
        >
          Applications — SOON
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className="ml-auto min-h-11 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          Sign out
        </button>
      </nav>

      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
