import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/PageHero";
import { MemberEventsCarousel } from "@/components/home/MemberEventsCarousel";
import { getHomepageData } from "@/lib/home/homepage.server";
import heroImg from "@/assets/hero-home.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inland Southern California Brewers Guild — Home" },
      { name: "description", content: "The home of independent craft alcohol producers. The Guild promotes, supports, and connects independently owned producers and industry partners throughout our region." },
      { property: "og:title", content: "Inland Southern California Brewers Guild — Home" },
      { property: "og:description", content: "The home of independent craft alcohol producers." },
      { property: "og:image", content: heroImg },
      { property: "twitter:image", content: heroImg },
    ],
  }),
  loader: () => getHomepageData(),
  component: HomePage,
});

function HomePage() {
  const { cards, guildEvent, dwellSeconds, heroImageUrl } = Route.useLoaderData();
  return (
    <>
      {/* Half its old height (owner, 2026-09-28); the image is the one the
          super admin uploaded on Settings, or the built-in one. */}
      <PageHero
        image={heroImageUrl ?? heroImg}
        title="Welcome to the home of independent craft alcohol producers."
        subtitle="The Inland Southern California Brewers Guild promotes, supports, and connects independently owned craft alcohol producers and industry partners throughout our region."
        minHeight="min-h-[42vh]"
        paddingY="py-10 md:py-12"
      >
        <Button asChild size="lg"><Link to="/members">Meet our members & partners</Link></Button>
        <Button asChild size="lg" variant="outline"><a href="#coming-up">Upcoming events</a></Button>
      </PageHero>

      {/* Replaces the three placeholder pillars and the Featured Event section. */}
      <section id="coming-up" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 md:px-6 md:py-20">
        <MemberEventsCarousel cards={cards} guildEvent={guildEvent} dwellSeconds={dwellSeconds} />
      </section>
    </>
  );
}
