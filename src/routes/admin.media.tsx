import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { listCarouselSlides } from "@/lib/media/carousel.server";
import { getMemberCover } from "@/lib/media/cover.server";
import { getMemberSocialImage } from "@/lib/media/social-image.server";
import { listUploadTokens } from "@/lib/media/upload-tokens.server";
import { listPendingMedia } from "@/lib/media/review-tray.server";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { SocialImageEditor } from "@/components/admin/SocialImageEditor";
import { CreatorLinkPanel } from "@/components/admin/CreatorLinkPanel";
import { ReviewTray } from "@/components/admin/ReviewTray";

export const Route = createFileRoute("/admin/media")({
  loader: async ({ context }) => {
    const [assets, slides, cover, socialImage, uploadTokens, pending] = await Promise.all([
      listMemberMedia({ data: { memberId: context.memberId } }),
      listCarouselSlides({ data: { memberId: context.memberId } }),
      getMemberCover({ data: { memberId: context.memberId } }),
      getMemberSocialImage({ data: { memberId: context.memberId } }),
      listUploadTokens({ data: { memberId: context.memberId } }),
      listPendingMedia({ data: { memberId: context.memberId } }),
    ]);
    return { assets, slides, cover, socialImage, uploadTokens, pending };
  },
  component: MediaRoute,
});

/**
 * Photos & video (artboard AdminMedia): slides + crop at the top, then the
 * gallery upload box, cover photo, creator link + review tray, and the
 * social sharing image. The logo lives on Basics & hours.
 */
function MediaRoute() {
  const { assets, slides, cover, socialImage, uploadTokens, pending } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <div className="flex flex-col gap-8 md:gap-9">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">
          Photos &amp; video
        </h1>
        <p className="text-[13px] text-ink-muted">
          Up to four slides. Visitors swipe through them on your profile, so lead with your best one.
        </p>
      </header>

      <CarouselEditor memberId={memberId} initialSlides={slides} galleryAssets={assets} />

      <MediaGallery memberId={memberId} assets={assets} slides={slides} />

      <CoverEditor
        memberId={memberId}
        coverAssetId={cover.cover_asset_id}
        coverCrop={cover.cover_crop}
        galleryAssets={assets}
      />

      <div className="flex flex-col gap-6">
        <CreatorLinkPanel
          memberId={memberId}
          initialTokens={uploadTokens}
          pendingCount={pending.length}
        />
        <ReviewTray initialPending={pending} />
      </div>

      <SocialImageEditor
        memberId={memberId}
        memberType={socialImage.member_type}
        ogImageAssetId={socialImage.og_image_asset_id}
        galleryAssets={assets}
      />
    </div>
  );
}
