import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { news } from "@/data/site";
import { ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-news.jpg";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News — IE Brewers Guild" },
      { name: "description", content: "The latest news, advocacy wins, and announcements from the IE Brewers Guild." },
      { property: "og:title", content: "News — IE Brewers Guild" },
      { property: "og:description", content: "Updates and announcements." },
    ],
  }),
  component: NewsPage,
});

function NewsPage() {
  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="Newsroom"
        title="Latest from the guild."
        subtitle="Industry news, advocacy updates, and member spotlights."
        minHeight="min-h-[50vh]"
      />
      <section className="mx-auto max-w-4xl px-4 py-20 md:px-6">
        <div className="divide-y divide-border">
          {news.map((n) => (
            <article key={n.slug} className="py-8 first:pt-0">
              <div className="text-xs uppercase tracking-widest text-primary">{n.date}</div>
              <h2 className="mt-2 text-2xl text-foreground">{n.title}</h2>
              <p className="mt-2 text-muted-foreground">{n.excerpt}</p>
              <a href="#" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wider text-foreground hover:text-primary">
                Read story <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
