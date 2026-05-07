import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { members } from "@/data/site";
import { Beer, ExternalLink } from "lucide-react";
import heroImg from "@/assets/pillar-events.jpg";

export const Route = createFileRoute("/members")({
  head: () => ({
    meta: [
      { title: "Member Breweries — IE Brewers Guild" },
      { name: "description", content: "Discover the independent craft breweries that make up the IE Brewers Guild." },
      { property: "og:title", content: "Member Breweries" },
      { property: "og:description", content: "Independent breweries in the guild." },
    ],
  }),
  component: MembersPage,
});

function MembersPage() {
  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="Our members"
        title="The breweries behind the guild."
        subtitle="Every member is independently owned and proud of it."
        minHeight="min-h-[50vh]"
      />
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <article key={m.name} className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/60">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Beer className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-xl text-foreground">{m.name}</h3>
              <p className="text-sm text-primary">{m.neighborhood}</p>
              <p className="mt-2 text-sm text-muted-foreground">{m.style}</p>
              <a href={m.website} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wider text-foreground hover:text-primary">
                Visit <ExternalLink className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
