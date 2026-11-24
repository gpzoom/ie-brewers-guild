import { createFileRoute } from "@tanstack/react-router";
import { getGuildMarketplace } from "@/lib/marketplace/marketplace.server";
import { GuildMarketplace } from "@/components/guild/GuildMarketplace";

/** Guild > Marketplace: the Producers' categories and every listing. */
export const Route = createFileRoute("/guild/marketplace")({
  staleTime: 0,
  loader: () => getGuildMarketplace(),
  component: MarketplaceRoute,
});

function MarketplaceRoute() {
  const { categories, listings } = Route.useLoaderData();
  return <GuildMarketplace categories={categories} listings={listings} />;
}
