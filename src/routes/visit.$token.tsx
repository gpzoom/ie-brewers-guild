import { createFileRoute } from "@tanstack/react-router";
import { checkVisitLink } from "@/lib/events/visit-link.server";
import { VisitLinkPage } from "@/components/site/VisitLinkPage";

/** A Guild member visit email's button (spec, "The email buttons"): read on open, change only on the button. */
export const Route = createFileRoute("/visit/$token")({
  loader: ({ params }) => checkVisitLink({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "A Guild member's visit — ISC Brewers Guild" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: function VisitRoute() {
    const { token } = Route.useParams();
    return <VisitLinkPage token={token} initial={Route.useLoaderData()} />;
  },
});
