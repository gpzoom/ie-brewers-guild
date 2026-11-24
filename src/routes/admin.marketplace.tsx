import { createFileRoute } from "@tanstack/react-router";
import { getMemberMarketplace } from "@/lib/marketplace/marketplace.server";
import { MarketplaceSection } from "@/components/marketplace/MarketplaceSection";
import { InfoBox } from "@/components/admin/basics/ui";
import { useMemberEditing } from "@/components/admin/MemberEditingContext";

/** Marketplace (Producers only): the same screen as the portal's section. */
export const Route = createFileRoute("/admin/marketplace")({
  // Never reuse a previous visit's data: every member shares these URLs.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => ({
    marketplace: await getMemberMarketplace({ data: { memberId: context.memberId } }),
  }),
  component: MarketplaceRoute,
});

function MarketplaceRoute() {
  const { marketplace } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  const editing = useMemberEditing();
  if (!marketplace) return <InfoBox>The marketplace is only for Producers' owners and full editors.</InfoBox>;
  return (
    <MarketplaceSection
      key={memberId}
      memberId={memberId}
      isPublished={editing?.isPublished ?? false}
      initial={marketplace}
    />
  );
}
