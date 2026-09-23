import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { listCarouselSlides } from "@/lib/media/carousel.server";
import { getMemberCover } from "@/lib/media/cover.server";
import { getMemberLogo } from "@/lib/media/logo.server";
import { listUploadTokens } from "@/lib/media/upload-tokens.server";
import { listPendingMedia } from "@/lib/media/review-tray.server";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { CreatorLinkPanel } from "@/components/admin/CreatorLinkPanel";
import { ReviewTray } from "@/components/admin/ReviewTray";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => {
    const [assets, slides, cover, logo, uploadTokens, pending] = await Promise.all([
      listMemberMedia({ data: { memberId: context.memberId } }),
      listCarouselSlides({ data: { memberId: context.memberId } }),
      getMemberCover({ data: { memberId: context.memberId } }),
      getMemberLogo({ data: { memberId: context.memberId } }),
      listUploadTokens({ data: { memberId: context.memberId } }),
      listPendingMedia({ data: { memberId: context.memberId } }),
    ]);
    return { assets, slides, cover, logo, uploadTokens, pending };
  },
  component: MediaRoute,
});

function MediaRoute() {
  const { assets, slides, cover, logo, uploadTokens, pending } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <div className="space-y-8">
      <ReviewTray initialPending={pending} />
      <LogoUploader memberId={memberId} initialLogoUrl={logo.logoUrl} />
      <MediaGallery memberId={memberId} initialAssets={assets} />
      <CarouselEditor memberId={memberId} initialSlides={slides} galleryAssets={assets} />
      <CoverEditor
        memberId={memberId}
        coverAssetId={cover.cover_asset_id}
        coverCrop={cover.cover_crop}
        galleryAssets={assets}
      />
      <CreatorLinkPanel memberId={memberId} initialTokens={uploadTokens} />
    </div>
  );
}
