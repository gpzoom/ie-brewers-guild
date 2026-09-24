import { Link, useRouter } from "@tanstack/react-router";
import { signOutEverything } from "@/lib/auth/sign-out.server";

const NAV_ITEMS = [
  { to: "/guild/roster", label: "Members" },
  { to: "/guild/inquiries", label: "Inquiries" },
  { to: "/guild/brand", label: "Brand & theme" },
  { to: "/guild/categories", label: "Categories" },
] as const;

/**
 * The Guild admin's nav, rendered directly under the public header on
 * EVERY page (__root.tsx) -- not just under /guild -- so a signed-in
 * Guild admin can click any public link (to check how an edit actually
 * looks live) without losing their way back into admin sections. Bug
 * report this fixes: leaving /guild via the public header used to strand
 * the admin on an ordinary page with no visible way back except /signin,
 * which re-prompted for a magic link even though their session was still
 * perfectly valid. Persisting this bar everywhere -- instead of only
 * inside /guild's own layout -- removes that dead end entirely.
 *
 * Replaces the old GuildShell component, which rendered this same nav
 * but only inside /guild's own layout route.
 */
export function GuildAdminBar() {
  const router = useRouter();

  async function handleSignOut() {
    await signOutEverything();
    await router.navigate({ to: "/" });
  }

  return (
    <nav
      aria-label="Guild admin sections"
      className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-2 py-2"
    >
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
        className="ml-auto min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
      >
        Sign out
      </button>
    </nav>
  );
}
