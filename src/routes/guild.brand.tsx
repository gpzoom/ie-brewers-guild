import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBrandSettings } from "@/lib/brand/brand-settings.server";
import { BrandEditor } from "@/components/guild/BrandEditor";

/**
 * Brand & theme: super admin only (docs/member-profiles.md, "Super admin").
 * A Guild admin is sent to the roster; saving is refused on the server and
 * in the database regardless.
 */
export const Route = createFileRoute("/guild/brand")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/guild/roster" });
  },
  loader: async () => getBrandSettings(),
  component: BrandRoute,
});

function BrandRoute() {
  const settings = Route.useLoaderData();
  return <BrandEditor settings={settings} />;
}
