import { useCallback, useState, type ReactNode } from "react";
import type { MemberDraftBundle } from "@/lib/drafts/drafts.server";
import type { MediaAssetRow, UploadTokenRow } from "@/lib/supabase/types";
import type { LogoBackground } from "@/lib/members/logo-background";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CameraRollHint } from "@/components/admin/CameraRollHint";
import { CreatorLinkPanel } from "@/components/admin/CreatorLinkPanel";
import { ReviewTray } from "@/components/admin/ReviewTray";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { SocialImageEditor } from "@/components/admin/SocialImageEditor";
import { SaveNoteText } from "@/components/admin/SaveNote";
import { PngHelpNote } from "@/components/admin/PngHelpNote";
import { ProfileHeaderPreview } from "@/components/admin/ProfileHeaderPreview";

export type LogoPhotosCoverPart = "logo" | "gallery" | "carousel" | "cover";

/**
 * The parts this viewer edits, in order. A Photos & events editor keeps
 * exactly the rights they had on the old Photos page: the gallery and the
 * slides. Logo and cover are in the draft's `basics` section, which only
 * the owner and full editors may save (and SQL refuses the rest anyway).
 */
export function logoPhotosCoverParts(canEditLogoAndCover: boolean): LogoPhotosCoverPart[] {
  return canEditLogoAndCover ? ["logo", "gallery", "carousel", "cover"] : ["gallery", "carousel"];
}

const PART_TITLES: Record<LogoPhotosCoverPart, string> = {
  logo: "Logo",
  gallery: "Gallery",
  carousel: "Carousel",
  cover: "Cover photo",
};

function Part({ n, part, lede, children }: { n: number; part: LogoPhotosCoverPart; lede?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`lpc-${part}`} className="flex flex-col gap-3">
      <h2 id={`lpc-${part}`} className="font-display text-[20px] font-bold leading-tight text-ink">
        {n} · {PART_TITLES[part]}
      </h2>
      {lede && <p className="text-pretty text-[13px] text-ink-muted">{lede}</p>}
      {children}
    </section>
  );
}

/**
 * Logo, Photos & Cover (redesign, 2026-10-02; artboards W04, W04e, W04p):
 * the logo, the gallery (with the camera-roll hint and the creator upload
 * link), the carousel slides and the cover, picked from the gallery, with a
 * live preview of the top of the profile beside them on a computer and
 * below them on a phone. Wizard step 4, the portal section and /admin/media
 * all mount this, so there's one page to keep up.
 */
export function LogoPhotosCoverSection({
  draft,
  assets,
  uploadTokens,
  pending,
  canEditLogoAndCover,
  peopleHref,
  showSocialImage,
}: {
  draft: MemberDraftBundle;
  assets: MediaAssetRow[];
  uploadTokens: UploadTokenRow[];
  pending: MediaAssetRow[];
  canEditLogoAndCover: boolean;
  /** Where People lives on this surface; null in the setup wizard. */
  peopleHref: string | null;
  showSocialImage: boolean;
}) {
  const memberId = draft.member.id;
  const basics = draft.data.basics;
  const theme = draft.data.theme.theme;

  const [logo, setLogo] = useState<{ logoUrl: string | null; background: LogoBackground }>({
    logoUrl: draft.logoUrl,
    background: basics.logo_background,
  });
  const [coverAssetId, setCoverAssetId] = useState<string | null>(basics.cover_asset_id);
  const [slides, setSlides] = useState<{ asset_id: string; sort_order: number }[]>(draft.data.media.slides);

  const onLogo = useCallback((next: { logoUrl: string | null; background: LogoBackground }) => setLogo(next), []);
  const onCover = useCallback((next: string | null) => setCoverAssetId(next), []);
  const onSlides = useCallback((next: { asset_id: string; sort_order: number }[]) => setSlides(next), []);

  const ordered = [...slides].sort((a, b) => a.sort_order - b.sort_order);
  const place = [basics.city, basics.state].filter((v) => v && v.trim() !== "").join(", ") || null;
  const parts = logoPhotosCoverParts(canEditLogoAndCover);

  const body: Record<LogoPhotosCoverPart, (n: number) => ReactNode> = {
    logo: (n) => (
      <Part key="logo" n={n} part="logo">
        <LogoUploader
          memberId={memberId}
          initialLogoUrl={draft.logoUrl}
          initialBackground={basics.logo_background}
          theme={theme}
          businessName={basics.business_name}
          onPreviewChange={onLogo}
          belowUpload={<PngHelpNote />}
          showPreview={false}
        />
      </Part>
    ),
    gallery: (n) => (
      <Part key="gallery" n={n} part="gallery">
        <MediaGallery memberId={memberId} assets={assets} />
        <CameraRollHint peopleHref={peopleHref} />
        <div className="flex flex-col gap-6">
          <CreatorLinkPanel memberId={memberId} initialTokens={uploadTokens} pendingCount={pending.length} />
          <ReviewTray initialPending={pending} />
        </div>
      </Part>
    ),
    carousel: (n) => (
      <Part key="carousel" n={n} part="carousel" lede="Up to four slides that visitors swipe through. Lead with your best one. Tall (portrait) photos work best.">
        <CarouselEditor
          memberId={memberId}
          initialSlides={draft.data.media.slides}
          galleryAssets={assets}
          onPreviewChange={onSlides}
        />
      </Part>
    ),
    cover: (n) => (
      <Part key="cover" n={n} part="cover">
        <CoverEditor
          memberId={memberId}
          coverAssetId={basics.cover_asset_id}
          coverCrop={basics.cover_crop}
          galleryAssets={assets}
          onPreviewChange={onCover}
        />
      </Part>
    ),
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-[34px]">
        {parts.map((part, i) => body[part](i + 1))}
        {showSocialImage && (
          <SocialImageEditor
            memberId={memberId}
            memberType={draft.member.member_type}
            ogImageAssetId={basics.og_image_asset_id}
            galleryAssets={assets}
          />
        )}
        <p className="border-t border-canvas-2 pt-[18px] text-[13px] text-ink-muted">
          <SaveNoteText />
        </p>
      </div>
      <aside className="flex w-full flex-col gap-2.5 lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
          Live preview
        </span>
        <ProfileHeaderPreview
          businessName={basics.business_name || "Your business"}
          place={place}
          theme={theme}
          logoUrl={logo.logoUrl}
          logoBackground={logo.background}
          coverAssetId={coverAssetId}
          firstSlideAssetId={ordered[0]?.asset_id ?? null}
          slideCount={ordered.length}
        />
      </aside>
    </div>
  );
}
