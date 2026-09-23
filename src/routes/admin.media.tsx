import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { listCarouselSlides } from "@/lib/media/carousel.server";
import { getMemberCover } from "@/lib/media/cover.server";
import { getMemberLogo } from "@/lib/media/logo.server";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { LogoUploader } from "@/components/admin/LogoUploader";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => {
    const [assets, slides, cover, logo] = await Promise.all([
      listMemberMedia({ data: { memberId: context.memberId } }),
      listCarouselSlides({ data: { memberId: context.memberId } }),
      getMemberCover({ data: { memberId: context.memberId } }),
      getMemberLogo({ data: { memberId: context.memberId } }),
    ]);
    return { assets, slides, cover, logo };
  },
  component: MediaRoute,
});

function MediaRoute() {
  const { assets, slides, cover, logo } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <div className="space-y-8">
      <LogoUploader memberId={memberId} initialLogoUrl={logo.logoUrl} />
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
