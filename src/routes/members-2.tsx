import { createFileRoute, notFound } from "@tanstack/react-router";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { getMembersV2Data } from "@/lib/members/members-v2.server";
import { MembersV2Page } from "@/components/site/members-v2/MembersV2Page";

/**
 * Members page v2 -- a staging trial (docs/superpowers/specs/2026-10-05-members-page-v2-design.md).
 * Not in the menu, noindex, and a 404 on the live site's hostnames
 * (members-v2-gate.ts). /members is unchanged.
 */
export const Route = createFileRoute("/members-2")({
  validateSearch: validateDirectorySearch,
  loader: async () => {
    const data = await getMembersV2Data();
    if (!data.enabled) throw notFound();
    return data;
  },
  head: () => ({
    meta: [
      { title: "Member Directory (v2) — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MembersV2Route,
});

function MembersV2Route() {
  const { cards, pins } = Route.useLoaderData();
  const search = Route.useSearch();
  return <MembersV2Page cards={cards} pins={pins} search={search} />;
}
