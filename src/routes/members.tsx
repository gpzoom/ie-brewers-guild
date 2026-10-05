import { createFileRoute } from "@tanstack/react-router";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { getMembersV2Data } from "@/lib/members/members-v2.server";
import { MembersV2Page } from "@/components/site/members-v2/MembersV2Page";

/**
 * The Members page: list beside the map, one card per member, search,
 * member type, Near me, and mobile members' stops today
 * (docs/superpowers/specs/2026-10-05-members-page-v2-design.md). Became
 * /members on 5 October 2026 (owner); the previous page is /members-1, and
 * /members-2 (its trial address) redirects here.
 */
export const Route = createFileRoute("/members")({
  validateSearch: validateDirectorySearch,
  loader: () => getMembersV2Data(),
  head: () => ({
    meta: [
      { title: "Member Directory — Inland Southern California Brewers Guild" },
      { name: "description", content: "Discover the independent producers, mobile members, and Allied Members that make up the Inland Southern California Brewers Guild." },
      { property: "og:title", content: "Member Directory" },
      { property: "og:description", content: "The independent producers, mobile members, and Allied Members behind the guild." },
    ],
  }),
  component: MembersRoute,
});

function MembersRoute() {
  const { cards, pins } = Route.useLoaderData();
  const search = Route.useSearch();
  return <MembersV2Page cards={cards} pins={pins} search={search} />;
}
