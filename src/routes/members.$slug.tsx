import { createFileRoute, Link } from "@tanstack/react-router";
import { getMemberProfileData } from "@/lib/members/member-profile.server";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";

export const Route = createFileRoute("/members/$slug")({
  validateSearch: validateDirectorySearch,
  loaderDeps: ({ search }) => ({ filter: search.filter, sort: search.sort }),
  loader: async ({ params, deps }) =>
    getMemberProfileData({ data: { slug: params.slug, filter: deps.filter, sort: deps.sort } }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { member, ogImageUrl, siteOrigin } = loaderData;
    const description =
      member.tagline ?? `${member.business_name} — an independent ${member.member_type === "producer" ? "producer" : member.member_type === "mobile" ? "mobile" : "supply"} member of the IE Brewers Guild in ${member.city}.`;
    const canonicalUrl = `${siteOrigin}/members/${member.slug}`;

    return {
      meta: [
        { title: `${member.business_name} — IE Brewers Guild` },
        { name: "description", content: description },
        { property: "og:title", content: member.business_name },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl },
        ...(ogImageUrl ? [{ property: "og:image", content: ogImageUrl }] : []),
        { name: "twitter:card", content: ogImageUrl ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: member.business_name },
        { name: "twitter:description", content: description },
        ...(ogImageUrl ? [{ name: "twitter:image", content: ogImageUrl }] : []),
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: member.business_name,
            description,
            url: canonicalUrl,
            image: ogImageUrl ?? undefined,
            telephone: member.phone ?? undefined,
            address: member.street_address
              ? {
                  "@type": "PostalAddress",
                  streetAddress: member.street_address,
                  addressLocality: member.city,
                  addressRegion: member.state,
                  postalCode: member.postal_code ?? undefined,
                }
              : undefined,
          }),
        },
      ],
    };
  },
  component: MemberProfilePage,
  // Catches notFound() thrown from THIS route's own loader (an
  // unpublished/nonexistent slug) -- per the installed router-core
  // not-found-and-errors skill, a leaf route's notFoundComponent works
  // for exactly this case even though it can't catch unmatched-path
  // not-founds. This gives the spec's required "directory's own 404,
  // offering the member list" instead of the generic site 404 in
  // __root.tsx. It does NOT yet cover the spec's other 404 case --
  // "profile is a draft or still an application: ... preview banner to
  // its own members" -- because member auth doesn't exist until the
  // Member Admin phase. When that lands, this loader needs to branch:
  // if the requester is an authenticated editor of this member, render
  // the preview instead of throwing notFound(). Tracked here, not
  // silently dropped.
  notFoundComponent: () => (
    <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-2xl text-ink">We couldn't find that member</h1>
      <p className="text-ink-muted">They may have moved, or the profile isn't published yet.</p>
      <Link
        to="/members"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Browse all members
      </Link>
    </div>
  ),
});

function MemberProfilePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <MemberProfileTemplate data={data} search={search} />;
}
