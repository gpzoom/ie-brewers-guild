import { createFileRoute } from "@tanstack/react-router";
import { listMemberMedia } from "@/lib/media/media-gallery.server";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { listUploadTokens } from "@/lib/media/upload-tokens.server";
import { listPendingMedia } from "@/lib/media/review-tray.server";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";
import { LogoPhotosCoverSection } from "@/components/admin/LogoPhotosCoverSection";

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
 * Logo, Photos & Cover (redesign, 2026-10-02): the same page as wizard step
 * 4 and the portal section -- logo, gallery (camera-roll hint, creator link
 * and review tray), carousel, cover, then the social sharing image -- with
 * the live preview beside it. The logo moved here from Basics & hours.
 *
 * The slides (draft `media`), the logo, cover and social sharing image
 * (draft `basics`) read from and save to the member's DRAFT. The gallery,
 * creator links and the review tray aren't drafted.
 */
function MediaRoute() {
  const { assets, draft, uploadTokens, pending } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
      <div className="flex flex-col gap-8 md:gap-9">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">
            Logo, Photos &amp; Cover
          </h1>
          <p className="text-[13px] text-ink-muted">
            Your logo, the photos for your page, and the wide cover across the top. Start with the
            gallery: your slides and cover are picked from it.
          </p>
        </header>
        {/* /admin has no People page; Edit as them sessions reach the portal's. */}
        <LogoPhotosCoverSection
          draft={draft}
          assets={assets}
          uploadTokens={uploadTokens}
          pending={pending}
          canEditLogoAndCover
          peopleHref="/portal/people"
          showSocialImage
        />
      </div>
    </SameMemberGuard>
  );
}
