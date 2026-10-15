import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { news, type NewsResult } from "@/data/site";
import heroImg from "@/assets/hero-news.jpg";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News — Inland Southern California Brewers Guild" },
      { name: "description", content: "The latest news, advocacy wins, and announcements from the Inland Southern California Brewers Guild." },
      { property: "og:title", content: "News — Inland Southern California Brewers Guild" },
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
              <p className="mt-3 text-lg text-foreground">{n.excerpt}</p>
              {n.body?.map((paragraph, i) => (
                <p key={i} className="mt-4 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {n.results?.map((group) => (
                <div key={group.heading} className="mt-8">
                  <h3 className="text-lg text-primary">{group.heading}</h3>
                  <ul className="mt-3 divide-y divide-border rounded-[14px] border border-border bg-card">
                    {group.items.map((r) => (
                      <ResultRow key={`${r.beer}-${r.brewery}`} result={r} />
                    ))}
                  </ul>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

const AWARD_STYLE: Record<string, { background: string; color: string }> = {
  Gold: { background: "#D9AE3B", color: "#241F1A" },
  Silver: { background: "#B9BEC5", color: "#241F1A" },
  Bronze: { background: "#C27C4E", color: "#241F1A" },
};

/** One medal or final-table beer: award, beer, brewery and city, category. */
function ResultRow({ result: r }: { result: NewsResult }) {
  const style = AWARD_STYLE[r.award] ?? {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
  };
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 md:px-5">
      <span
        className="w-fit shrink-0 rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em] sm:mt-0.5 sm:w-24 sm:text-center"
        style={style}
      >
        {r.award}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[18px] leading-tight">{r.beer}</span>
        <span className="text-[15px] font-semibold text-foreground">
          {r.memberSlug ? (
            <Link
              to="/members/$slug"
              params={{ slug: r.memberSlug }}
              className="underline decoration-primary underline-offset-4 hover:text-primary"
            >
              {r.brewery}
            </Link>
          ) : (
            r.brewery
          )}{" "}
          · {r.city}
        </span>
        <span className="text-[14px] text-muted-foreground">{r.category}</span>
      </div>
    </li>
  );
}
