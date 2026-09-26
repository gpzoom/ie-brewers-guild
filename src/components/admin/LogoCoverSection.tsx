import type { MemberDraftBundle } from "@/lib/drafts/drafts.server";
import type { MediaAssetRow } from "@/lib/supabase/types";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { SaveNoteText } from "@/components/admin/SaveNote";

/**
 * "Logo & cover" (plan Decision 4): the logo (PNG only, Decision 6) with
 * its background choice, and the cover photo with its crop -- all in the
 * draft's `basics` section, so owners and full editors only. Wizard step 4
 * mounts it now; the phase 5 portal mounts the same component as its own
 * section. It knows nothing about either route: the member comes from the
 * props, the save note from the member editing context.
 *
 * The cover is picked from the member's photo gallery, which a brand-new
 * member doesn't have yet -- so the gallery's upload box is here too
 * (optional via `showGalleryUpload`). An upload re-runs the page's loader,
 * which brings the new photo into the cover picker.
 */
export function LogoCoverSection({
  draft,
  galleryAssets,
  showGalleryUpload = true,
}: {
  draft: MemberDraftBundle;
  galleryAssets: MediaAssetRow[];
  showGalleryUpload?: boolean;
}) {
  const memberId = draft.member.id;
  const basics = draft.data.basics;
  const hasApprovedPhoto = galleryAssets.some((asset) => asset.review_status === "approved");
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="logo-section-heading" className="flex flex-col gap-3">
        <h2
          id="logo-section-heading"
          className="font-sans text-[14px] font-bold uppercase tracking-[0.12em] text-ink"
        >
          Logo
        </h2>
        <LogoUploader
          memberId={memberId}
          initialLogoUrl={draft.logoUrl}
          initialBackground={basics.logo_background}
          theme={draft.data.theme.theme}
          businessName={basics.business_name}
        />
      </section>

      <CoverEditor
        memberId={memberId}
        coverAssetId={basics.cover_asset_id}
        coverCrop={basics.cover_crop}
        galleryAssets={galleryAssets}
      />

      {showGalleryUpload && (
        <div className="flex flex-col gap-2">
          {!hasApprovedPhoto && (
            <p className="text-[13px] text-ink-muted">
              No photos yet? Add one to your gallery below, then choose it as your cover.
            </p>
          )}
          <MediaGallery memberId={memberId} assets={galleryAssets} />
        </div>
      )}

      <p className="border-t border-canvas-2 pt-[18px] text-[13px] text-ink-muted">
        <SaveNoteText />
      </p>
    </div>
  );
}
