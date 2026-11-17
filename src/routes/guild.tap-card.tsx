import { createFileRoute } from "@tanstack/react-router";
import { listCardBatches, listTrailBreweries } from "@/lib/tap-card/batches.server";
import { listPendingOffers } from "@/lib/tap-card/offers.server";
import { CardBatchesPanel } from "@/components/guild/tap-card/CardBatchesPanel";
import { OfferApprovalsPanel } from "@/components/guild/tap-card/OfferApprovalsPanel";
import { TapCardTabs, isTapCardTab, type TapCardTab } from "@/components/guild/tap-card/TapCardTabs";

/** /guild/tap-card: the Inland Tap Card program (every Guild admin). ?tab=cards|offers|milestones|rewards */
export const Route = createFileRoute("/guild/tap-card")({
  validateSearch: (search: Record<string, unknown>): { tab?: TapCardTab } =>
    isTapCardTab(search.tab) && search.tab !== "cards" ? { tab: search.tab } : {},
  loaderDeps: ({ search }) => ({ tab: search.tab ?? "cards" }),
  staleTime: 0,
  loader: async ({ deps }) => {
    if (deps.tab === "cards") {
      const [batches, breweries] = await Promise.all([listCardBatches(), listTrailBreweries()]);
      return { tab: deps.tab, batches, breweries };
    }
    if (deps.tab === "offers") return { tab: deps.tab, pending: await listPendingOffers() };
    return { tab: deps.tab };
  },
  component: TapCardRoute,
});

function TapCardRoute() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">Inland Tap Card</h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          Cards that bartenders tap to record visits and the once-a-year first-beer offer at every stop on the trail.
        </p>
      </div>
      <TapCardTabs tab={data.tab} onChange={(t) => navigate({ search: t === "cards" ? {} : { tab: t } })} />
      {data.tab === "cards" && "batches" in data && <CardBatchesPanel batches={data.batches!} breweries={data.breweries!} />}
      {data.tab === "offers" && "pending" in data && <OfferApprovalsPanel pending={data.pending!} />}
    </div>
  );
}
