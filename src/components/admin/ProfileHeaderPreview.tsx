import { logoBackgroundColor, type LogoBackground } from "@/lib/members/logo-background";
import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";

/**
 * Logo, Photos & Cover's live preview (artboards W04/W04e): the top of the
 * profile -- the Guild's dark frame, the cover (or the theme color without
 * one), the logo on its chosen tile, the name and city under the band, and
 * slide 1. It draws from the editors' current state (LogoPhotosCoverSection
 * collects it through their onPreviewChange callbacks), so it changes as
 * the member works, before anything is published.
 */
export function ProfileHeaderPreview({
  businessName,
  place,
  theme,
  logoUrl,
  logoBackground,
  coverAssetId,
  firstSlideAssetId,
  slideCount,
}: {
  businessName: string;
  place: string | null;
  theme: MemberThemeName;
  logoUrl: string | null;
  logoBackground: LogoBackground;
  coverAssetId: string | null;
  firstSlideAssetId: string | null;
  slideCount: number;
}) {
  const themeHex = getMemberThemeHex(theme);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 rounded-2xl bg-[#14100C] p-3" aria-hidden="true">
        <span className="px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#B6AC9D]">
          ISC Brewers Guild
        </span>
        <div className="overflow-hidden rounded-[12px] bg-canvas">
          {coverAssetId ? (
            <img
              src={`/api/admin-media/${coverAssetId}`}
              alt=""
              className="block h-[120px] w-full object-cover"
            />
          ) : (
            <div className="h-[120px]" style={{ backgroundColor: themeHex }} />
          )}
          <div className="flex items-center gap-3 px-3.5 pb-3.5 pt-3">
            <div
              className="flex size-[58px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-canvas-border"
              style={{ backgroundColor: logoBackgroundColor(logoBackground, theme) }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="max-h-[44px] max-w-[44px] object-contain" />
              ) : (
                <span className="text-[10px] tracking-[0.1em] text-ink-subtle">LOGO</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-display text-[18px] font-bold text-ink">
                {businessName}
              </span>
              {place && <span className="text-[12px] text-ink-muted">{place}</span>}
            </div>
          </div>
        </div>
        {firstSlideAssetId ? (
          <div className="px-3.5 pb-3.5">
            <img
              src={`/api/admin-media/${firstSlideAssetId}`}
              alt=""
              className="block h-[150px] w-full rounded-[10px] object-cover"
            />
            <span className="mt-1.5 block text-[10px] text-[#B6AC9D]">
              Slide 1 of {slideCount}
            </span>
          </div>
        ) : (
          <div className="mx-3.5 mb-3.5 flex h-[70px] items-center justify-center rounded-[10px] border border-dashed border-[#4A4238] text-[11px] text-ink-subtle">
            Your slides show here
          </div>
        )}
      </div>
      <p className="text-[12px] leading-[1.45] text-ink-muted">
        Updates as you go. Nothing changes on your live page until you publish.
      </p>
    </div>
  );
}
