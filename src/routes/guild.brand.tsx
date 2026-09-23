import { createFileRoute } from "@tanstack/react-router";
import { getBrandSettings } from "@/lib/brand/brand-settings.server";
import { BrandEditor } from "@/components/guild/BrandEditor";

export const Route = createFileRoute("/guild/brand")({
  loader: async () => getBrandSettings(),
  component: BrandRoute,
});

function BrandRoute() {
  const settings = Route.useLoaderData();
  return <BrandEditor settings={settings} />;
}
