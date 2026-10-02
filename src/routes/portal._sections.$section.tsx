import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPortalSectionData } from "@/lib/portal/portal-shell.server";
import {
  canOpenPortalSection,
  firstPortalSection,
  isPortalSection,
  legacyPortalSection,
} from "@/lib/portal/portal-sections";
import { PortalSectionView } from "@/components/portal/PortalSectionView";

/**
 * /portal/$section: one portal section by name. A section the viewer can't
 * open (a Photos & events editor on Basics, anyone but the owner on People,
 * Discount for a non-Allied member, a made-up name) goes to their first
 * section. getPortalSectionData checks the same rule again on the server
 * and resolves the member from the session; only the section name is sent.
 */
export const Route = createFileRoute("/portal/_sections/$section")({
  staleTime: 0,
  gcTime: 0,
  beforeLoad: ({ context, params }) => {
    const { shell } = context;
    // Renamed or merged sections (/portal/photos is part of Logo, Photos & Cover).
    const renamed = legacyPortalSection(params.section);
    if (renamed) throw redirect({ to: "/portal/$section", params: { section: renamed } });
    if (!isPortalSection(params.section) || !canOpenPortalSection(params.section, shell)) {
      throw redirect({
        to: "/portal/$section",
        params: { section: firstPortalSection(shell.role) },
      });
    }
  },
  loader: ({ params }) => getPortalSectionData({ data: { section: params.section } }),
  component: SectionPage,
});

function SectionPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  // Keyed by member and section: each section's editors start from their
  // own freshly loaded data.
  return (
    <PortalSectionView key={`${shell.memberId}:${data.section}`} data={data} shell={shell} />
  );
}
