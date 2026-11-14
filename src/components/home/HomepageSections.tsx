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
      {sections.map((s, i) => {
        // Old layout: each block has 64/80px above it; the last also keeps 64/80px below.
        const pad = `px-4 pt-16 md:px-6 md:pt-20${i === sections.length - 1 ? " pb-16 md:pb-20" : ""}`;
        if (s.kind === "events") {
          return (
            <section key="events" id="coming-up" className={`mx-auto max-w-7xl scroll-mt-24 ${pad}`}>
              {carousel}
            </section>
          );
        }
        if (s.kind === "spotlight") {
          if (!CURRENT_SPOTLIGHT) return null;
          return (
            <section key="spotlight" className={`mx-auto max-w-7xl ${pad}`}>
              <SpotlightShowcase spotlight={CURRENT_SPOTLIGHT} />
            </section>
          );
        }
        return (
          <section key={s.id} className={`mx-auto max-w-7xl ${pad}`}>
            <ImageAnnouncement section={s} />
          </section>
        );
      })}
    </>
  );
}
