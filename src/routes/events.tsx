import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The Events page is gone (owner, 2026-09-28): member and Guild events now
 * live in the homepage's "Coming up at our members" carousel. Old links and
 * bookmarks land there instead of a missing page.
 */
export const Route = createFileRoute("/events")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "coming-up", statusCode: 301 });
  },
});
