import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { MemberImage } from "@/components/profile/MemberImage";
import { isHttpUrl } from "@/lib/links/url-safety";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import type { MemberThemeName } from "@/lib/theme/member-themes";
import { cn } from "@/lib/utils";

const MAX_SLIDES = 4;

type MediaCarouselProps = {
  slides: (CarouselSlideRow & { asset: MediaAssetRow })[];
  memberName: string;
  theme: MemberThemeName;
  isPreview: boolean;
};

/**
 * Spec, "The slot": one 4:5 ratio for every slide, max four, no dots for
 * a single slide (which implies 2-4 slide carousels DO show dots).
 * Spec, "Empty and error states": no slides -> module omitted entirely,
 * the cover and hero carry the page.
 *
 * `.slice(0, MAX_SLIDES)` is a defensive belt-and-braces cap: the write
 * path is the real enforcement of "maximum four slides," but this
 * component should never render a fifth slide even if a future admin
 * tool or a manual DB fix lets one through upstream.
 */
export function MediaCarousel({ slides, memberName, theme, isPreview }: MediaCarouselProps) {
  const capped = slides.slice(0, MAX_SLIDES);
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!api) return;

    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  if (capped.length === 0) return null;

  // Multiple slides need a way to reach them -- prev/next buttons plus
  // dot indicators. A single slide needs neither (spec: no dots for one
  // slide, and there's nothing else to navigate to).
  const showControls = capped.length > 1;

  return (
    <Carousel
      className="w-full md:w-[420px]"
      setApi={setApi}
      tabIndex={0}
      aria-label={`${memberName} photos`}
    >
      <CarouselContent>
        {capped.map((slide) => {
          const image = (
            <MemberImage
              src={`${isPreview ? "/api/admin-media" : "/api/member-media"}/${slide.asset.id}`}
              crop={slide.crop}
              alt={`${memberName} photo`}
              theme={theme}
              aspectClassName="aspect-[4/5]"
            />
          );
          const outboundUrl = slide.outbound_url;
          return (
            <CarouselItem key={slide.id}>
              {/* Render-boundary guard -- same shape as LinkPills.tsx's own
                  isHttpUrl filter, and for the same reason: this is what
                  actually protects every visitor, regardless of how a
                  non-http(s) `outbound_url` (e.g. `javascript:...`) got
                  into the row -- existing data, a bypass of
                  updateCarouselSlideLink's own write-boundary check (a
                  member has direct RLS-scoped REST access to their own
                  carousel_slides rows), or a future write path. See
                  url-safety.ts's isHttpUrl doc comment. A slide whose
                  stored outbound_url isn't a genuine http(s) URL renders
                  as a plain, non-clickable photo instead of a live
                  <a href> -- never dropped from the carousel entirely
                  (unlike LinkPills, this is still a real, intentional
                  photo the member uploaded). Checking `isHttpUrl` inside
                  the same `&&`/ternary condition (rather than a separate
                  boolean captured beforehand) is what lets TypeScript
                  narrow `outboundUrl` to `string` for the <a> branch
                  below without a non-null assertion. */}
              {outboundUrl && isHttpUrl(outboundUrl) ? (
                <a href={outboundUrl} target="_blank" rel="noreferrer" className="block">
                  {image}
                </a>
              ) : (
                image
              )}
            </CarouselItem>
          );
        })}
      </CarouselContent>
      {showControls && (
        <>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
          <div
            className="mt-3 flex items-center justify-center gap-1"
            role="tablist"
            aria-label="Slides"
          >
            {capped.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-label={`Go to slide ${index + 1}`}
                aria-selected={index === selectedIndex}
                onClick={() => api?.scrollTo(index)}
                className="flex h-8 w-8 items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    index === selectedIndex ? "bg-brand-bright" : "bg-canvas-border",
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </Carousel>
  );
}
