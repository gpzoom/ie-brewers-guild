import { createFileRoute, Link } from "@tanstack/react-router";
import { getMemberProfileData } from "@/lib/members/member-profile.server";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";

export const Route = createFileRoute("/members_/$slug")({
  validateSearch: validateDirectorySearch,
  loaderDeps: ({ search }) => ({ filter: search.filter, sort: search.sort }),
  loader: async ({ params, deps }) =>
    getMemberProfileData({ data: { slug: params.slug, filter: deps.filter, sort: deps.sort } }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { member, ogImageUrl, siteOrigin } = loaderData;
    // tagline is string | null, but a member who clears the field in
    // admin realistically stores "" rather than null -- "" isn't
    // nullish, so `?? fallback` alone would ship a blank description.
    // `?.trim() || fallback` catches both null and whitespace-only.
    const fallbackDescription =
      member.member_type === "producer"
        ? `${member.business_name} — an independent producer member of the IE Brewers Guild in ${member.city}.`
        : member.member_type === "mobile"
          ? `${member.business_name} — an independent mobile member of the IE Brewers Guild in ${member.city}.`
          : `${member.business_name} — an Allied Member of the IE Brewers Guild in ${member.city}.`;
    const description = member.tagline?.trim() || fallbackDescription;
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
        // "script:ld+json" (not a hand-built `scripts` entry) is what
        // routes this through the router's own escapeHtml() before it's
        // serialized into the page -- business_name/tagline are
        // admin-curated today but become member-editable in the Member
        // Admin phase, and a raw JSON.stringify(...) into `scripts`
        // doesn't escape "<" or "/", so a value containing
        // "</script><script>..." would break out and execute.
        {
          "script:ld+json": {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: member.business_name,
            description,
            url: canonicalUrl,
            image: ogImageUrl ?? undefined,
            telephone: member.phone ?? undefined,
            // city/state are always present (mobile members have no
            // street_address by design), so PostalAddress is emitted
            // unconditionally with streetAddress/postalCode added only
            // when available, rather than omitting address entirely for
            // every mobile member.
            address: {
              "@type": "PostalAddress",
              ...(member.street_address ? { streetAddress: member.street_address } : {}),
              addressLocality: member.city,
              addressRegion: member.state,
              ...(member.postal_code ? { postalCode: member.postal_code } : {}),
            },
          },
        },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
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
