import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { listCarouselSlides } from "@/lib/media/carousel.server";
import { getMemberCover } from "@/lib/media/cover.server";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { CoverEditor } from "@/components/admin/CoverEditor";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => {
    const [assets, slides, cover] = await Promise.all([
      listMemberMedia({ data: { memberId: context.memberId } }),
      listCarouselSlides({ data: { memberId: context.memberId } }),
      getMemberCover({ data: { memberId: context.memberId } }),
    ]);
    return { assets, slides, cover };
  },
  component: MediaRoute,
});

function MediaRoute() {
  const { assets, slides, cover } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <div className="space-y-8">
      <MediaGallery memberId={memberId} initialAssets={assets} />
      <CarouselEditor memberId={memberId} initialSlides={slides} galleryAssets={assets} />
      <CoverEditor
        memberId={memberId}
        coverAssetId={cover.cover_asset_id}
        coverCrop={cover.cover_crop}
        galleryAssets={assets}
      />
    </div>
  );
}
