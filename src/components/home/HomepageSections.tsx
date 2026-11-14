import type { ReactNode } from "react";
import { SpotlightShowcase } from "@/components/home/SpotlightShowcase";
import { ImageAnnouncement } from "@/components/home/ImageAnnouncement";
import { CURRENT_SPOTLIGHT } from "@/lib/home/spotlight";
import type { VisibleSection } from "@/lib/home/sections";

/** The blocks below the hero, in the order the super admin chose in Settings. */
export function HomepageSections({
  sections,
  carousel,
}: {
  sections: VisibleSection[];
  carousel: ReactNode;
}) {
  return (
    <>
      {sections.map((s) => {
        if (s.kind === "events") {
          return (
            <section key="events" id="coming-up" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-10 md:px-6 md:py-12">
              {carousel}
            </section>
          );
        }
        if (s.kind === "spotlight") {
          if (!CURRENT_SPOTLIGHT) return null;
          return (
            <section key="spotlight" className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
              <SpotlightShowcase spotlight={CURRENT_SPOTLIGHT} />
            </section>
          );
        }
        return (
          <section key={s.id} className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
            <ImageAnnouncement section={s} />
          </section>
        );
      })}
    </>
  );
}
