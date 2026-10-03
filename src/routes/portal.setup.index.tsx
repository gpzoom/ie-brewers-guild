import { createFileRoute, redirect } from "@tanstack/react-router";

/** /portal/setup on its own: /portal decides which step (or the portal) to open. */
export const Route = createFileRoute("/portal/setup/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal" });
  },
});
