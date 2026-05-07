import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { events } from "@/data/site";
import { Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
const featuredImg = "/events/frontier-beer-fest.png";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events — IE Brewers Guild" },
      { name: "description", content: "Upcoming festivals, member meetups, and brew days hosted by the IE Brewers Guild." },
      { property: "og:title", content: "Events — IE Brewers Guild" },
      { property: "og:description", content: "Upcoming festivals and community events." },
      { property: "og:image", content: featuredImg },
      { property: "twitter:image", content: featuredImg },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const featured = events.find((e) => "featured" in e && e.featured);
  const rest = events.filter((e) => e !== featured);

  return (
    <>
      <PageHero
        image={featuredImg}
        eyebrow="Get involved"
        title="Upcoming events."
        subtitle="From festivals to brew days — there's always something happening with the guild."
        minHeight="min-h-[55vh]"
      />

      {featured && (
        <section className="border-y border-border bg-card/40">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:px-6">
            <div className="overflow-hidden rounded-lg border border-border">
              <img src={featuredImg} alt={featured.title} loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">Featured</div>
              <h2 className="text-4xl">{featured.title}</h2>
              <div className="mt-3 flex flex-wrap gap-5 text-sm text-foreground/80">
                <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {featured.date}</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {featured.location}</span>
              </div>
              <p className="mt-4 text-muted-foreground">{featured.excerpt}</p>
              <div className="mt-6"><Button size="lg">Get tickets</Button></div>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-6">
        <h2 className="text-3xl">More events</h2>
        <div className="mt-8 space-y-4">
          {rest.map((e) => (
            <article key={e.slug} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl text-foreground">{e.title}</h3>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-foreground/80">
                  <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {e.date}</span>
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {e.location}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{e.excerpt}</p>
              </div>
              <Button variant="outline">Details</Button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
