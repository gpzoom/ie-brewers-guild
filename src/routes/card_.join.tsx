import { createFileRoute } from "@tanstack/react-router";
import { getFreeCardPage } from "@/lib/tap-card/free-card.server";
import { TapCardShell } from "@/components/tap-card/TapCardShell";
import { FreeCardForm } from "@/components/tap-card/FreeCardForm";

/** /card/join[?plate=CODE]: the free loyalty-only Scan Pass (universal card, spec 2026-11-19). */
export const Route = createFileRoute("/card_/join")({
  staleTime: 0,
  validateSearch: (search: Record<string, unknown>): { plate?: string } => (typeof search.plate === "string" ? { plate: search.plate } : {}),
  loaderDeps: ({ search }) => ({ plate: search.plate }),
  loader: ({ deps }) => getFreeCardPage({ data: { plate: deps.plate } }),
  head: () => ({ meta: [{ title: "Get your free Scan Pass — Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FreeCardRoute,
});

function FreeCardRoute() {
  const page = Route.useLoaderData();
  return (
    <TapCardShell>
      <FreeCardForm page={page} />
    </TapCardShell>
  );
}
