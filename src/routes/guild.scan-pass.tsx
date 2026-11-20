import { createFileRoute } from "@tanstack/react-router";
import { listPendingMemberOffers } from "@/lib/tap-card/member-offers.server";
import { listOfferTemplates } from "@/lib/tap-card/offer-templates.server";
import { listEarnedRewards, listMilestones } from "@/lib/tap-card/milestones.server";
import { tapCardYear } from "@/lib/tap-card/tap-card-time";
import { OfferApprovalsPanel } from "@/components/guild/tap-card/OfferApprovalsPanel";
import { TemplatesPanel } from "@/components/guild/tap-card/TemplatesPanel";
import { MilestonesPanel } from "@/components/guild/tap-card/MilestonesPanel";
import { RewardsPanel } from "@/components/guild/tap-card/RewardsPanel";
import { PassesPanel } from "@/components/guild/tap-card/PassesPanel";
import { getPassReport, listPasses } from "@/lib/tap-card/trail-pass-admin.server";
import { RecentPasses } from "@/components/guild/tap-card/RecentPasses";
import { TapCardTabs, isTapCardTab, type TapCardTab } from "@/components/guild/tap-card/TapCardTabs";

type Search = { tab?: TapCardTab; show?: "all"; year?: number };

/** /guild/scan-pass: the Inland Scan Pass program (every Guild admin). ?tab=offers|templates|milestones|rewards|passes
 * (The printed-pass batches tab is hidden: passes live on customers' phones.) */
export const Route = createFileRoute("/guild/scan-pass")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(isTapCardTab(search.tab) && search.tab !== "offers" ? { tab: search.tab } : {}),
    ...(search.show === "all" ? { show: "all" as const } : {}),
    ...(typeof search.year === "number" && Number.isInteger(search.year) ? { year: search.year } : {}),
  }),
  loaderDeps: ({ search }) => ({
    tab: search.tab ?? ("offers" as TapCardTab),
    show: search.show === "all" ? ("all" as const) : ("waiting" as const),
    year: search.year,
  }),
  staleTime: 0,
  loader: async ({ deps }) => {
    const pending = await listPendingMemberOffers();
    const base = { tab: deps.tab, pendingCount: pending.length };
    switch (deps.tab) {
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
      case "passes": {
        const report = await getPassReport({ data: { year: deps.year } });
        return { ...base, report, passes: await listPasses({ data: { year: report.year } }) };
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
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">Inland Scan Pass</h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          The Beer Trail offer, each stop's loyalty rewards and milestones, and Beer Trail Pass sales.
        </p>
      </div>
      <TapCardTabs
        tab={data.tab}
        badges={{ offers: data.pendingCount }}
        alerts={{ offers: data.pendingCount > 0 }}
        onChange={(t) => navigate({ search: t === "offers" ? {} : { tab: t } })}
      />
      {data.tab === "offers" && "pending" in data && <OfferApprovalsPanel pending={data.pending} />}
      {data.tab === "templates" && "templates" in data && <TemplatesPanel templates={data.templates} />}
      {data.tab === "milestones" && "milestones" in data && <MilestonesPanel milestones={data.milestones} />}
      {data.tab === "passes" && "report" in data && (
        <>
          <PassesPanel key={data.report.year} report={data.report} onYearChange={(year) => navigate({ search: { tab: "passes", year } })} />
          {"passes" in data && <RecentPasses passes={data.passes} />}
        </>
      )}
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
