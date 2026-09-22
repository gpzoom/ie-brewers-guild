import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { MediaGallery } from "@/components/admin/MediaGallery";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => listMemberMedia({ data: { memberId: context.memberId } }),
  component: MediaRoute,
});

function MediaRoute() {
  const assets = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return <MediaGallery memberId={memberId} initialAssets={assets} />;
}
