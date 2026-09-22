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
  head: () => ({
    meta: UNDER_CONSTRUCTION
      ? [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1" },
          { title: "IE Brewers Guild — Under Construction" },
          { name: "description", content: "Our site is currently under construction. Check back soon." },
          { name: "robots", content: "noindex" },
        ]
      : [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "IE Brewers Guild — Independent Craft Breweries" },
      { name: "description", content: "Promoting and protecting independent craft breweries through advocacy, education, and community events." },
      { property: "og:title", content: "IE Brewers Guild — Independent Craft Breweries" },
      { property: "og:description", content: "Promoting and protecting independent craft breweries through advocacy, education, and community events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "IE Brewers Guild — Independent Craft Breweries" },
      { name: "twitter:description", content: "Promoting and protecting independent craft breweries through advocacy, education, and community events." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/ZNUDewqcAPUUwTYIElb09eZE6MH2/social-images/social-1778196049824-ie-brewers-guild-logo.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/ZNUDewqcAPUUwTYIElb09eZE6MH2/social-images/social-1778196049824-ie-brewers-guild-logo.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Chivo:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
const BARE_ROUTE_PREFIXES = ["/admin"];

function isBarePathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (BARE_ROUTES.includes(normalized)) return true;
  return BARE_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
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
