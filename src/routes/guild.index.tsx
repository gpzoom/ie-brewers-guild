import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/guild/")({
  beforeLoad: () => {
    throw redirect({ href: "/guild/roster" });
  },
});
