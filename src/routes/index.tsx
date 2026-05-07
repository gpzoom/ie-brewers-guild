import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/PageHero";
import { SectionHeader } from "@/components/site/SectionHeader";
import { ArrowRight, Calendar, MapPin } from "lucide-react";
import heroImg from "@/assets/hero-home.jpg";
import advocacyImg from "@/assets/pillar-advocacy.jpg";
import educationImg from "@/assets/pillar-education.jpg";
import eventsImg from "@/assets/pillar-events.jpg";
const featuredImg = "/events/frontier-beer-fest.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IE Brewers Guild — Home" },
      { name: "description", content: "The home of independent craft breweries. Advocacy, education, and events that strengthen our local brewing community." },
      { property: "og:title", content: "IE Brewers Guild — Home" },
      { property: "og:description", content: "The home of independent craft breweries." },
      { property: "og:image", content: heroImg },
      { property: "twitter:image", content: heroImg },
    ],
  }),
  component: HomePage,
});

const pillars = [
  {
    title: "Advocacy",
    image: advocacyImg,
    body: "We support independent brewers by advocating at the local, state, and federal level — partnering with like-minded organizations along the way.",
    href: "/about",
  },
  {
    title: "Education",
    image: educationImg,
    body: "Educating the community about craft brewing and offering opportunities for industry pros is a pillar of our organization.",
    href: "/about",
  },
  {
    title: "Events",
    image: eventsImg,
    body: "Producing local events with our member breweries gives us the chance to engage with the people who make this community special.",
    href: "/events",
  },
] as const;

function HomePage() {
  return (
    <>
      <PageHero
        image={heroImg}
        title="Welcome to the home of independent craft breweries."
        subtitle="The IE Brewers Guild promotes and protects local independently-owned breweries and advocates for the strengthening of the craft beer industry."
        minHeight="min-h-[85vh]"
      >
        <Button asChild size="lg"><Link to="/members">Meet our brewers</Link></Button>
        <Button asChild size="lg" variant="outline"><Link to="/events">Upcoming events</Link></Button>
      </PageHero>

      {/* Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <SectionHeader
          eyebrow="What we do"
          title="Three pillars, one mission."
          subtitle="Everything we do for our member breweries lives under advocacy, education, or events."
          align="center"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pillars.map((p) => (
            <article key={p.title} className="group overflow-hidden rounded-lg border border-border bg-card transition-transform hover:-translate-y-1">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-6">
                <h3 className="text-2xl text-primary">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
                <Link to={p.href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wider text-foreground hover:text-primary">
                  Learn more <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Featured event */}
      <section className="relative overflow-hidden border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center md:px-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">Featured Event</div>
            <h2 className="text-4xl md:text-5xl">Independent Beer Fest</h2>
            <p className="mt-4 text-muted-foreground">
              Our annual Beer Week kick-off festival is just around the corner. Join us at Harbor Park
              on June 14th for the definitive independent beer festival — 40+ breweries, food, and music.
            </p>
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-foreground/80">
              <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Sat, June 14</span>
              <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Harbor Park</span>
            </div>
            <div className="mt-7">
              <Button asChild size="lg"><Link to="/events">More info</Link></Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border shadow-[var(--shadow-glow)]">
            <img src={featuredImg} alt="Independent Beer Fest" loading="lazy" className="h-full w-full object-cover" />
          </div>
        </div>
      </section>
    </>
  );
}
