import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { MemberImage } from "@/components/profile/MemberImage";
import { isHttpUrl } from "@/lib/links/url-safety";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import type { MemberThemeName } from "@/lib/theme/member-themes";
import type { ProfileMediaMode } from "@/lib/members/profile-object";
import { cn } from "@/lib/utils";

const MAX_SLIDES = 4;

type MediaCarouselProps = {
  slides: (CarouselSlideRow & { asset: MediaAssetRow })[];
  memberName: string;
  theme: MemberThemeName;
  mediaMode: ProfileMediaMode;
};

// "View on Instagram →" (artboards D/E/V/L) -- named for where the
// member's own outbound link actually goes.
function outboundLabel(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "View post";
  }
  if (host.endsWith("instagram.com")) return "View on Instagram";
  if (host.endsWith("facebook.com") || host === "fb.watch") return "View on Facebook";
  if (host.endsWith("tiktok.com")) return "View on TikTok";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "View on YouTube";
  return "View post";
}

const pillClass = "rounded-pill bg-[#E0D9CC]/90 px-2.5 py-1 text-[10px] tracking-[0.08em] text-[#3A332C] lg:px-3 lg:py-[5px]";

/**
 * Spec, "The slot": one 4:5 ratio for every slide, max four, no dots for
 * a single slide (which implies 2-4 slide carousels DO show dots).
 * Spec, "Empty and error states": no slides -> module omitted entirely,
 * the cover and hero carry the page.
 *
 * Look (artboards D/E/V/L): a rounded portrait slot with a "1 / 4"
 * counter top-left, the slide's outbound link as a "View on Instagram →"
 * pill bottom-left, and the dots bottom-right, all laid over the photo.
 * Swipe (touch), the arrow keys, and -- on a mouse/trackpad -- round
 * previous/next buttons at the sides move between slides.
 *
 * `.slice(0, MAX_SLIDES)` is a defensive belt-and-braces cap: the write
 * path is the real enforcement of "maximum four slides," but this
 * component should never render a fifth slide even if a future admin
 * tool or a manual DB fix lets one through upstream.
 */
export function MediaCarousel({ slides, memberName, theme, mediaMode }: MediaCarouselProps) {
  const capped = slides.slice(0, MAX_SLIDES);
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(capped.length > 1);

  useEffect(() => {
    if (!api) return;

    const onSelect = () => {
      setSelectedIndex(api.selectedScrollSnap());
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  if (capped.length === 0) return null;

  // Multiple slides need a way to reach them -- counter, dots, and the
  // previous/next buttons. A single slide needs none (spec: no dots for
  // one slide, and there's nothing else to navigate to).
  const showControls = capped.length > 1;
  const roundButton =
    "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#D3CBBD] bg-canvas/90 text-ink shadow-sm hover:bg-canvas disabled:opacity-0 pointer-fine:flex";

  return (
    <Carousel className="relative w-full" setApi={setApi} tabIndex={0} aria-label={`${memberName} photos`}>
      <CarouselContent>
        {capped.map((slide) => {
          const outboundUrl = slide.outbound_url;
          return (
            <CarouselItem key={slide.id}>
              <div className="relative">
                <MemberImage
                  src={`${mediaMode === "preview" ? "/api/admin-media" : "/api/member-media"}/${slide.asset.id}`}
                  crop={slide.crop}
                  alt={`${memberName} photo`}
                  theme={theme}
                  aspectClassName="aspect-[4/5]"
                  className="rounded-2xl lg:rounded-[18px]"
                />
                {/* Render-boundary guard -- same shape as LinkPills.tsx's own
                    isHttpUrl filter, and for the same reason: this is what
                    actually protects every visitor, regardless of how a
                    non-http(s) `outbound_url` (e.g. `javascript:...`) got
                    into the row -- existing data, a bypass of
                    updateCarouselSlideLink's own write-boundary check (a
                    member has direct RLS-scoped REST access to their own
                    carousel_slides rows), or a future write path. See
                    url-safety.ts's isHttpUrl doc comment. A slide whose
                    stored outbound_url isn't a genuine http(s) URL simply
                    gets no link pill -- the photo itself still shows.
                    Checking `isHttpUrl` in the same condition is what lets
                    TypeScript narrow `outboundUrl` to `string` below. */}
                {outboundUrl && isHttpUrl(outboundUrl) && (
                  <a
                    href={outboundUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3.5 left-3.5 flex min-h-11 items-center lg:bottom-4 lg:left-4"
                  >
                    <span className="rounded-pill border border-[#D3CBBD] bg-canvas px-[13px] py-2 text-[11px] font-medium text-ink lg:px-3.5 lg:py-[9px] lg:text-xs">
                      {outboundLabel(outboundUrl)} →
                    </span>
                  </a>
                )}
              </div>
            </CarouselItem>
          );
        })}
      </CarouselContent>
      {showControls && (
        <>
          <span className={cn(pillClass, "pointer-events-none absolute left-3.5 top-3.5 lg:left-4 lg:top-4")} aria-live="polite">
            {selectedIndex + 1} / {capped.length}
          </span>
          <span
            className="pointer-events-none absolute bottom-[33px] right-3.5 flex gap-[5px] lg:bottom-[34px] lg:right-4 lg:gap-1.5"
            aria-hidden="true"
          >
            {capped.map((slide, index) => (
              <span
                key={slide.id}
                className={cn(
                  "block h-[7px] w-[7px] rounded-full transition-colors lg:h-2 lg:w-2",
                  index === selectedIndex ? "bg-[#3A332C]" : "bg-[#D3CBBD]",
                )}
              />
            ))}
          </span>
          <button
            type="button"
            className={cn(roundButton, "left-3")}
            onClick={() => api?.scrollPrev()}
            disabled={!canPrev}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn(roundButton, "right-3")}
            onClick={() => api?.scrollNext()}
            disabled={!canNext}
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </Carousel>
  );
}
