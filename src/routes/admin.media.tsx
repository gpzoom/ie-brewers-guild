import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { listUploadTokens } from "@/lib/media/upload-tokens.server";
import { listPendingMedia } from "@/lib/media/review-tray.server";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { SocialImageEditor } from "@/components/admin/SocialImageEditor";
import { CreatorLinkPanel } from "@/components/admin/CreatorLinkPanel";
import { ReviewTray } from "@/components/admin/ReviewTray";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

export const Route = createFileRoute("/admin/media")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => {
    const [assets, draft, uploadTokens, pending] = await Promise.all([
      listMemberMedia({ data: { memberId: context.memberId } }),
      getMemberDraft({ data: { memberId: context.memberId } }),
      listUploadTokens({ data: { memberId: context.memberId } }),
      listPendingMedia({ data: { memberId: context.memberId } }),
    ]);
    return { assets, draft, uploadTokens, pending };
  },
  component: MediaRoute,
});

/**
 * Photos & video (artboard AdminMedia): the gallery upload box at the top,
 * then the carousel (slides + crop), cover photo, creator link + review
 * tray, and the social sharing image (owner's order, 2026-09-26). The logo
 * lives on Basics & hours.
 *
 * Phase 2: the slides (draft `media` section) and the cover and social
 * sharing image (draft `basics`) read from and save to the member's
 * DRAFT. The gallery itself, creator links and the review tray aren't
 * drafted -- uploads, approvals and deletes happen straight away.
 */
function MediaRoute() {
  const { assets, draft, uploadTokens, pending } = Route.useLoaderData();
  const basics = draft.data.basics;
  const { memberId } = Route.useRouteContext();
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
    <div className="flex flex-col gap-8 md:gap-9">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">
          Photos &amp; video
        </h1>
        <p className="text-[13px] text-ink-muted">
          Up to four slides. Visitors swipe through them on your profile, so lead with your best
          one.
        </p>
      </header>

      <MediaGallery memberId={memberId} assets={assets} />

      <CarouselEditor
        memberId={memberId}
        initialSlides={draft.data.media.slides}
        galleryAssets={assets}
      />

      <CoverEditor
        memberId={memberId}
        coverAssetId={basics.cover_asset_id}
        coverCrop={basics.cover_crop}
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
        memberType={draft.member.member_type}
        ogImageAssetId={basics.og_image_asset_id}
        galleryAssets={assets}
      />
    </div>
    </SameMemberGuard>
  );
}
