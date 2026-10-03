import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Hours now live on the one "Basics & hours" page (artboard AdminBasics;
 * owner decision 2026-09-25). This route stays only so old links and
 * bookmarks to /admin/hours land on that page's hours section. The parent
 * /admin route's beforeLoad (the member-session check) still runs first.
 */
export const Route = createFileRoute("/admin/hours")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/basics", hash: "hours" });
  },
});
