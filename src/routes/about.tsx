import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { SectionHeader } from "@/components/site/SectionHeader";
import heroImg from "@/assets/hero-about.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Inland Southern California Brewers Guild" },
      { name: "description", content: "Learn about the Inland Southern California Brewers Guild's mission, history, and leadership team supporting independent craft alcohol producers." },
      { property: "og:title", content: "About — Inland Southern California Brewers Guild" },
      { property: "og:description", content: "Our mission, history, and leadership." },
      { property: "og:image", content: heroImg },
      { property: "twitter:image", content: heroImg },
    ],
  }),
  component: AboutPage,
});

const board = [
  { name: "Name", role: "President", brewery: "Brewery Name" },
  { name: "Name", role: "Vice President", brewery: "Brewery Name" },
  { name: "Name", role: "Treasurer", brewery: "Brewery Name" },
  { name: "Name", role: "Secretary", brewery: "Brewery Name" },
  { name: "Name", role: "At-Large", brewery: "Brewery Name" },
  { name: "Name", role: "At-Large", brewery: "Brewery Name" },
];

function AboutPage() {
  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="About the guild"
        title="Independent. Local. Together."
        subtitle="A nonprofit trade association bringing together independent craft alcohol producers and the businesses that support them — built by our local industry, for our local industry."
      />

      <section className="mx-auto max-w-4xl px-4 py-20 md:px-6">
        <SectionHeader eyebrow="Our mission" title="Why the guild exists." />
        <div className="mt-6 space-y-5 text-foreground/85">
          <p>
            The Inland Southern California Brewers Guild promotes, supports, and advocates for
            independently owned craft alcohol producers throughout our region. Our membership
            includes breweries, wineries, cideries, meaderies, distilleries, and other independent
            craft beverage producers.
          </p>
          <p>
            Our Guild also welcomes brewing and beverage supply companies, equipment manufacturers,
            service providers, retailers, and other affiliate businesses that support the craft
            alcohol industry.
          </p>
          <p>
            From small independent producers to established regional businesses, our members share
            knowledge, resources, education, advocacy, and opportunities to collaborate. By bringing
            producers, suppliers, and industry partners together, we can strengthen local businesses
            and build a more connected craft alcohol community.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <SectionHeader
            eyebrow="What we focus on"
            title="Advocacy, education, community."
          />
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              { t: "Advocacy", b: "We work with local councils, state legislators, and federal partners to defend small-brewer interests on tax, distribution, and licensing." },
              { t: "Education", b: "From homebrew clinics to professional brewer development, we invest in the people behind the beer." },
              { t: "Community", b: "Festivals, collaboration brew days, and member meetups that bring our breweries — and their fans — together." },
            ].map((x) => (
              <div key={x.t}>
                <h3 className="text-2xl text-primary">{x.t}</h3>
                <p className="mt-2 text-muted-foreground">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <SectionHeader eyebrow="Leadership" title="Board of directors." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {board.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-5">
              <div className="text-lg font-semibold text-foreground">{m.name}</div>
              <div className="text-sm text-primary">{m.role}</div>
              <div className="text-sm text-muted-foreground">{m.brewery}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
