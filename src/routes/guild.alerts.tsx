import { createFileRoute, Link } from "@tanstack/react-router";
import { getMemberAlerts } from "@/lib/guild/member-alerts.server";
import { listPendingMemberOffers } from "@/lib/tap-card/member-offers.server";
import { pendingOffersText } from "@/lib/tap-card/offer-alerts";
import { MemberAlertsTable } from "@/components/guild/MemberAlertsTable";

export const Route = createFileRoute("/guild/alerts")({
  loader: async () => {
    const [alerts, pending] = await Promise.all([
      getMemberAlerts(),
      // A failed count only hides the Tap Card box, never the page.
      listPendingMemberOffers().catch(() => []),
    ]);
    return { alerts, pendingOffers: pending.length };
  },
  component: MemberAlertsRoute,
});

function MemberAlertsRoute() {
  const { alerts, pendingOffers } = Route.useLoaderData();
  return (
    <div className="flex flex-col">
      {pendingOffers > 0 && (
        <div
          role="status"
          className="mb-5 flex max-w-[720px] flex-wrap items-center gap-x-3 gap-y-1 notification-pulse rounded-[11px] border-2 border-[#B42318] bg-[#FEF3F2] px-[17px] py-[13px] text-[13px] text-[#B42318] md:mb-6"
        >
          <span aria-hidden="true">⚠</span>
          <span className="min-w-0 flex-1 text-pretty">{pendingOffersText(pendingOffers)}</span>
          <Link to="/guild/tap-card" search={{ tab: "offers" }} className="font-semibold text-[#B42318] underline underline-offset-2">
            Review offers →
          </Link>
        </div>
      )}
      <MemberAlertsTable alerts={alerts} />
    </div>
  );
}
