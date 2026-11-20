import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The Inland Tap Card was renamed the Inland Scan Pass (2026-11-20). This
 * route stays only so old links and bookmarks to /admin/tap-card land on
 * /admin/scan-pass. The parent /admin route's beforeLoad still runs first.
 */
export const Route = createFileRoute("/admin/tap-card")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/scan-pass", replace: true });
  },
});
