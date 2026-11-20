import { createFileRoute } from "@tanstack/react-router";
import { getTrailJoinPage } from "@/lib/tap-card/trail-join.server";
import { TapCardShell } from "@/components/tap-card/TapCardShell";
import { TrailJoinForm } from "@/components/tap-card/TrailJoinForm";

/** /trail/join[?plate=CODE]: join the Beer Trail; from a plate, the sale is credited to that brewery (spec 2026-11-19). */
export const Route = createFileRoute("/trail_/join")({
  staleTime: 0,
  validateSearch: (search: Record<string, unknown>): { plate?: string } => (typeof search.plate === "string" ? { plate: search.plate } : {}),
  loaderDeps: ({ search }) => ({ plate: search.plate }),
  loader: ({ deps }) => getTrailJoinPage({ data: { plate: deps.plate } }),
  head: () => ({ meta: [{ title: "Join the Beer Trail — Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TrailJoinRoute,
});

function TrailJoinRoute() {
  const page = Route.useLoaderData();
  return (
    <TapCardShell>
      <TrailJoinForm page={page} />
    </TapCardShell>
  );
}
