import { createFileRoute } from "@tanstack/react-router";
import { listCardBatches } from "@/lib/tap-card/batches.server";
import { listPendingMemberOffers } from "@/lib/tap-card/member-offers.server";
import { listOfferTemplates } from "@/lib/tap-card/offer-templates.server";
import { listEarnedRewards, listMilestones } from "@/lib/tap-card/milestones.server";
import { tapCardYear } from "@/lib/tap-card/tap-card-time";
import { CardBatchesPanel } from "@/components/guild/tap-card/CardBatchesPanel";
import { OfferApprovalsPanel } from "@/components/guild/tap-card/OfferApprovalsPanel";
import { TemplatesPanel } from "@/components/guild/tap-card/TemplatesPanel";
import { MilestonesPanel } from "@/components/guild/tap-card/MilestonesPanel";
import { RewardsPanel } from "@/components/guild/tap-card/RewardsPanel";
import { TapCardTabs, isTapCardTab, type TapCardTab } from "@/components/guild/tap-card/TapCardTabs";

type Search = { tab?: TapCardTab; show?: "all" };

/** /guild/tap-card: the Inland Tap Card program (every Guild admin). ?tab=cards|offers|templates|milestones|rewards */
export const Route = createFileRoute("/guild/tap-card")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(isTapCardTab(search.tab) && search.tab !== "cards" ? { tab: search.tab } : {}),
    ...(search.show === "all" ? { show: "all" as const } : {}),
  }),
  loaderDeps: ({ search }) => ({
    tab: search.tab ?? ("cards" as TapCardTab),
    show: search.show === "all" ? ("all" as const) : ("waiting" as const),
  }),
  staleTime: 0,
  loader: async ({ deps }) => {
    const pending = await listPendingMemberOffers();
    const base = { tab: deps.tab, pendingCount: pending.length };
    switch (deps.tab) {
      case "cards": {
        return { ...base, batches: await listCardBatches() };
      }
      case "offers":
        return { ...base, pending };
      case "templates":
        return { ...base, templates: await listOfferTemplates() };
      case "milestones":
        return { ...base, milestones: await listMilestones() };
      case "rewards": {
        const year = tapCardYear(new Date());
        return { ...base, year, show: deps.show, rewards: await listEarnedRewards({ data: { year, show: deps.show } }) };
      }
    }
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
          Cards that bartenders tap to record visits, the Beer Trail offer, and each stop's loyalty rewards.
        </p>
      </div>
      <TapCardTabs
        tab={data.tab}
        badges={{ offers: data.pendingCount }}
        alerts={{ offers: data.pendingCount > 0 }}
        onChange={(t) => navigate({ search: t === "cards" ? {} : { tab: t } })}
      />
      {data.tab === "cards" && "batches" in data && <CardBatchesPanel batches={data.batches} />}
      {data.tab === "offers" && "pending" in data && <OfferApprovalsPanel pending={data.pending} />}
      {data.tab === "templates" && "templates" in data && <TemplatesPanel templates={data.templates} />}
      {data.tab === "milestones" && "milestones" in data && <MilestonesPanel milestones={data.milestones} />}
      {data.tab === "rewards" && "rewards" in data && (
        <RewardsPanel
          rewards={data.rewards}
          year={data.year}
          show={data.show}
          onShowChange={(show) => navigate({ search: { tab: "rewards", ...(show === "all" ? { show: "all" } : {}) } })}
        />
      )}
    </div>
  );
}
