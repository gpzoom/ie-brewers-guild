import { createFileRoute, Link } from "@tanstack/react-router";
import { getTrailPage } from "@/lib/tap-card/trail.server";
import { SectionHeader } from "@/components/site/SectionHeader";
import { MembersMap } from "@/components/site/MembersMap";

/**
 * /trail: the Inland Tap Card for the public -- how it works, the stops on a
 * map, and each stop's offer. Published trail stops only.
 */
export const Route = createFileRoute("/trail")({
  staleTime: 0,
  loader: () => getTrailPage(),
  head: () => ({
    meta: [
      { title: "Inland Tap Card — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content: "Pick up an Inland Tap Card, have it tapped at every new taproom on the trail, and get each stop's first-beer offer.",
      },
      { property: "og:title", content: "Inland Tap Card" },
    ],
  }),
  component: TrailPage,
});

export function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function TrailPage() {
  const { members, stops, cardPriceCents } = Route.useLoaderData();
  const steps = [
    {
      title: "Pick up a card",
      body:
        cardPriceCents > 0
          ? `Get an Inland Tap Card at any stop — about ${formatPrice(cardPriceCents)}.`
          : "Get an Inland Tap Card at any stop.",
    },
    { title: "Tap it at every new taproom", body: "Have the bartender tap your card. Your visit counts, and you get that stop's offer once a year." },
    { title: "Earn Guild rewards", body: "Visit more stops to earn rewards from the Guild. Visits count — not how much you drink." },
  ];

  return (
    <div className="pb-20">
      <section className="mx-auto max-w-7xl px-4 pt-16 md:px-6">
        <SectionHeader
          eyebrow="Inland Tap Card"
          title="Your first beer for a nickel."
          subtitle="One card for every independent taproom on the trail. Discover a brewery you've never been to."
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
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have a card?{" "}
          <Link to="/card" className="font-medium text-primary underline underline-offset-2">
            See your progress
          </Link>
        </p>
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
          21 and over. One offer per stop per calendar year. Offers are set by each brewery and approved by the Guild. See the{" "}
          <a href="/terms" className="underline underline-offset-2">
            Terms of Use
          </a>
          .
        </p>
      </section>
    </div>
  );
}
