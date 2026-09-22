import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { MemberImage } from "@/components/profile/MemberImage";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import type { MemberThemeName } from "@/lib/theme/member-themes";

type MediaCarouselProps = {
  slides: (CarouselSlideRow & { asset: MediaAssetRow })[];
  memberName: string;
  theme: MemberThemeName;
};

/**
 * Spec, "The slot": one 4:5 ratio for every slide, max four, no dots for
 * a single slide. Spec, "Empty and error states": no slides -> module
 * omitted entirely, the cover and hero carry the page.
 */
export function MediaCarousel({ slides, memberName, theme }: MediaCarouselProps) {
  if (slides.length === 0) return null;

  return (
    <Carousel className="w-full md:w-[420px]">
      <CarouselContent>
        {slides.map((slide) => {
          const image = (
            <MemberImage
              src={`/api/member-media/${slide.asset.id}`}
              crop={slide.crop}
              alt={`${memberName} photo`}
              theme={theme}
              aspectClassName="aspect-[4/5]"
            />
          );
          return (
            <CarouselItem key={slide.id}>
              {slide.outbound_url ? (
                <a href={slide.outbound_url} target="_blank" rel="noreferrer" className="block">
                  {image}
                </a>
              ) : (
                image
              )}
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}
