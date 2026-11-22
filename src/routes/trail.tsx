import { createFileRoute, Link } from "@tanstack/react-router";
import { getTrailPage } from "@/lib/tap-card/trail.server";
import { SectionHeader } from "@/components/site/SectionHeader";
import { MembersMap } from "@/components/site/MembersMap";
import { Button } from "@/components/ui/button";
import { trailOfferHeadline } from "@/lib/tap-card/tap-card-copy";

/**
 * /trail: the Inland Scan Pass for the public -- how it works, the stops on a
 * map, and each stop's offer. Published trail stops only.
 */
export const Route = createFileRoute("/trail")({
  staleTime: 0,
  loader: () => getTrailPage(),
  head: () => ({
    meta: [
      { title: "Inland Scan Pass — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content: "Get an Inland Scan Pass on your phone, scan in at every new taproom on the trail, and get the Beer Trail offer at each stop.",
      },
      { property: "og:title", content: "Inland Scan Pass" },
    ],
  }),
  component: TrailPage,
});

function TrailPage() {
  const { members, stops, trailOffer } = Route.useLoaderData();
  const steps = [
    {
      title: "Get your pass",
      body: "Scan the QR code at any stop's counter to get an Inland Scan Pass on your phone and join the Beer Trail.",
    },
    {
      title: "Scan in at every new taproom",
      body: "Scan the counter plate, then the staff QR code. Your visit counts, and you get that stop's offer once a year.",
    },
    { title: "Earn Guild rewards", body: "Visit more stops to earn rewards from the Guild. Visits count — not how much you drink." },
  ];

  return (
    <div className="pb-20">
      <section className="mx-auto max-w-7xl px-4 pt-16 md:px-6">
        <SectionHeader
          eyebrow="Inland Scan Pass"
          title={trailOfferHeadline(trailOffer)}
          subtitle="One pass for every independent taproom on the trail. Discover a brewery you've never been to."
          align="center"
        />
        <ol className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-border/60 bg-card p-5">
              <div className="font-display text-3xl text-primary">{i + 1}</div>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Already have a pass?</p>
          <Button asChild size="lg" variant="outline" className="h-11">
            <Link to="/card">Sign in to your pass</Link>
          </Button>
        </div>
      </section>

      {members.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-16 md:px-6">
          <SectionHeader eyebrow="The stops" title="On the map." align="center" />
          <div className="mt-8">
            <MembersMap members={members} linkSearch={{}} />
          </div>
        </section>
      )}

      <section className="mx-auto max-w-4xl px-4 pt-16 md:px-6">
        <SectionHeader eyebrow="Offers" title={`${stops.length} ${stops.length === 1 ? "stop" : "stops"} on the trail`} align="center" />
        {stops.length === 0 ? (
          <p className="mt-6 text-center text-muted-foreground">The first stops are coming soon.</p>
        ) : (
          <ul className="mt-8 divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {stops.map((s) => (
              <li key={s.memberId} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <Link to="/members/$slug" params={{ slug: s.slug }} className="font-semibold hover:text-primary">
                    {s.name}
                  </Link>
                  {s.city && <span className="ml-2 text-sm text-muted-foreground">{s.city}</span>}
                </div>
                <div className="text-sm">{s.offer}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          21 and over. One Beer Trail offer per stop per calendar year. Come back for loyalty rewards set by each brewery
          and approved by the Guild. See the{" "}
          <a href="/terms" className="underline underline-offset-2">
            Terms of Use
          </a>
          .
        </p>
      </section>
    </div>
  );
}
