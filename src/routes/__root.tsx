import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Toaster } from "@/components/ui/sonner";
import { UnderConstruction } from "@/components/site/UnderConstruction";
import { getActiveBrandTokens } from "@/lib/brand/active-brand.server";
import { getGuildAdminStatus } from "@/lib/guild/guild-admin-status.server";

const UNDER_CONSTRUCTION = import.meta.env.VITE_UNDER_CONSTRUCTION === "true";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display text-primary">404</h1>
        <h2 className="mt-4 text-xl">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    // Run in parallel -- these are two unrelated concerns (theme tokens,
    // whether the viewer is a Guild admin -- read by members_.$slug.tsx's
    // ProfilePreviewBanner) that both need to be known before the
    // page renders, and there's no reason to pay for them sequentially.
    // getGuildAdminStatus is cheap for the vast majority of anonymous
    // visitors (it short-circuits on cookie presence before doing any
    // real session check -- see its own doc comment).
    const [brand, adminStatus] = await Promise.all([getActiveBrandTokens(), getGuildAdminStatus()]);
    return { ...brand, isGuildAdmin: adminStatus.isGuildAdmin };
  },
  head: ({ loaderData }) => ({
    meta: UNDER_CONSTRUCTION
      ? [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1" },
          { title: "Inland Southern California Brewers Guild — Under Construction" },
          { name: "description", content: "Our site is currently under construction. Check back soon." },
          { name: "robots", content: "noindex" },
        ]
      : [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Inland Southern California Brewers Guild — Independent Craft Breweries" },
      { name: "description", content: "Promoting and protecting independent craft breweries through advocacy, education, and community events." },
      { property: "og:title", content: "Inland Southern California Brewers Guild — Independent Craft Breweries" },
      { property: "og:description", content: "Promoting and protecting independent craft breweries through advocacy, education, and community events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Inland Southern California Brewers Guild — Independent Craft Breweries" },
      { name: "twitter:description", content: "Promoting and protecting independent craft breweries through advocacy, education, and community events." },
      { property: "og:image", content: "https://iscbrewersguild.org/og/site-default.png" },
      { name: "twitter:image", content: "https://iscbrewersguild.org/og/site-default.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: loaderData?.googleFontsHref ?? "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Chivo:wght@400;500;600&display=swap" },
    ],
    styles: loaderData ? [{ key: "brand-tokens", children: loaderData.css }] : [],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Route subtrees drawn in the light "canvas" app theme (styles.css's
// .theme-canvas, docs/design/README.md). Set on <html> rather than a
// wrapper div because Radix dialogs/popovers/selects portal to <body>,
// outside any wrapper -- only an ancestor of <body> reaches them. The
// public site (including /contact) stays on the dark theme.
const CANVAS_ROUTE_PREFIXES = ["/admin", "/guild", "/signin", "/send", "/portal"];
// ...except the draft previews (src/routes/admin_.preview.tsx, the portal's
// src/routes/portal.preview.tsx and the setup wizard's preview step), which
// show the profile the way the public page does: dark site ground, light card.
const NON_CANVAS_ROUTES = ["/admin/preview", "/portal/preview", "/portal/setup/preview"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function isCanvasPathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return !NON_CANVAS_ROUTES.includes(normalized) && matchesPrefix(normalized, CANVAS_ROUTE_PREFIXES);
}

function RootShell({ children }: { children: React.ReactNode }) {
  // The shell renders inside the router (Match.js wraps the root match in
  // it), so this reads the same location during SSR and on the client, and
  // re-renders on every client-side navigation -- no hydration mismatch,
  // no flash when moving between the public site and the admin.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCanvas = !UNDER_CONSTRUCTION && isCanvasPathname(pathname);
  return (
    <html lang="en" className={isCanvas ? "theme-canvas" : undefined}>
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Routes that render standalone, without the site header/footer. Exact-match
// only -- fine for single pages with no children.
const BARE_ROUTES = ["/survey-results"];

// Route subtrees that render standalone, without the site header/footer,
// including every child route underneath them. /admin is here (not in
// BARE_ROUTES above) because it isn't a single page -- AdminShell (its own
// mobile tab strip + pinned Publish bar) is the chrome for every
// /admin/<section> route, and the marketing header/footer would otherwise
// wrap it on every one of those child paths too, not just /admin itself.
// /guild is here for the same reason: GuildShell (src/routes/guild.tsx) is
// the chrome for every /guild/<section> route.
// /signin and /send are standalone per their artboards (T, J): just a small
// Guild mark above a light card, no site menu.
// /portal (the Member Portal: wizard and portal) is chrome-less for the same
// reasons as /admin.
const BARE_ROUTE_PREFIXES = ["/admin", "/guild", "/signin", "/send", "/portal"];

function isBarePathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (BARE_ROUTES.includes(normalized)) return true;
  return matchesPrefix(normalized, BARE_ROUTE_PREFIXES);
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isBare = isBarePathname(pathname);

  if (UNDER_CONSTRUCTION) {
    return <UnderConstruction />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        {!isBare && <Header />}
        <main className="flex-1">
          <Outlet />
        </main>
        {!isBare && <Footer />}
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
