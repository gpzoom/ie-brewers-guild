/**
 * The homepage spotlight (docs/member-profiles.md, "Homepage" > "Spotlight"):
 * a temporary section under the hero that plays a few slides and circles
 * our region's names on them. The super admin turns it on and off on
 * Settings (site_settings.spotlight_enabled); the content lives here, so a
 * new spotlight is a code change. Set CURRENT_SPOTLIGHT to null when there's
 * nothing to show -- the section then never appears, switch or no switch.
 */

/** Slides are 1920x1080 screenshots; highlight boxes are in those pixels. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

export type SpotlightBox = { x: number; y: number; w: number; h: number };
export type SpotlightAward = "gold" | "silver" | "bronze" | "finalist";

export type SpotlightHighlight = {
  box: SpotlightBox;
  award: SpotlightAward;
  beer: string;
  brewery: string;
  city: string;
  /** A published member's slug, for a "See their profile" link. */
  memberSlug?: string;
};

export type SpotlightSlide = {
  /** Under public/spotlight/. */
  image: string;
  /** The slide's full results, for screen readers. */
  alt: string;
  category: string;
  highlights: SpotlightHighlight[];
};

export type Spotlight = {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  slides: SpotlightSlide[];
};

export const AWARD_LABEL: Record<SpotlightAward, string> = {
  gold: "Gold medal",
  silver: "Silver medal",
  bronze: "Bronze medal",
  finalist: "Final table",
};

/** Great American Beer Festival, Denver, October 2026 (owner, 2026-10-14). */
export const CURRENT_SPOTLIGHT: Spotlight | null = {
  id: "gabf-2026",
  eyebrow: "Great American Beer Festival 2026",
  title: "Medals and final tables for our region.",
  intro:
    "Brewers from across Inland Southern California brought home hardware from Denver. Here's who made the podium and the final tables.",
  slides: [
    {
      image: "/spotlight/gabf-2026/cat-23.webp",
      category: "Category 23 · Specialty India Pale Ale · 65 entries",
      alt: "Category 23, Specialty India Pale Ale, 65 entries. Gold: Doom Sludge, Green Cheek Beer Co., Costa Mesa, CA. Silver: Big Cone, Figueroa Mountain Brewing Co., Buellton, CA. Bronze: Pepper and Peaches, Claremont Craft Ales, Claremont, CA.",
      highlights: [
        {
          box: { x: 505, y: 805, w: 420, h: 160 },
          award: "bronze",
          beer: "Pepper and Peaches",
          brewery: "Claremont Craft Ales",
          city: "Claremont",
        },
      ],
    },
    {
      image: "/spotlight/gabf-2026/cat-91.webp",
      category: "Category 91 · New Zealand-Style India Pale Ale · 89 entries",
      alt: "Category 91, New Zealand-Style India Pale Ale, 89 entries. Gold: No Fly Zone, 8 Bit Brewing Co., Murrieta, CA. Silver: Dream Logic, Meanwhile Brewing Co., Austin, TX. Bronze: Potion Crusher, Barebottle Brewing Co., San Francisco, CA.",
      highlights: [
        {
          box: { x: 505, y: 365, w: 310, h: 150 },
          award: "gold",
          beer: "No Fly Zone",
          brewery: "8 Bit Brewing Co.",
          city: "Murrieta",
        },
      ],
    },
    {
      image: "/spotlight/gabf-2026/cat-97.webp",
      category: "Category 97 · Strong Red Ale · 32 entries",
      alt: "Category 97, Strong Red Ale, 32 entries. Gold: Happy Days, Claremont Craft Ales, Claremont, CA. Silver: The Fourth Colour, Worthy Brewing, Bend, OR. Bronze: Serpent Sun, Figueroa Mountain Brewing Co., Buellton, CA.",
      highlights: [
        {
          box: { x: 505, y: 330, w: 360, h: 150 },
          award: "gold",
          beer: "Happy Days",
          brewery: "Claremont Craft Ales",
          city: "Claremont",
        },
      ],
    },
    {
      image: "/spotlight/gabf-2026/cat-54.webp",
      category: "Category 54 · Dortmunder or German-Style Festbier · 161 entries",
      alt: "Final table for Category 54, Dortmunder or German-Style Festbier, 161 entries. Fifteen finalists, including Festbier by Claremont Craft Ales of Claremont, CA, and Uncle Fester by Evans Brewing Co. of Corona, CA.",
      highlights: [
        {
          box: { x: 135, y: 615, w: 290, h: 125 },
          award: "finalist",
          beer: "Festbier",
          brewery: "Claremont Craft Ales",
          city: "Claremont",
        },
        {
          box: { x: 698, y: 485, w: 255, h: 125 },
          award: "finalist",
          beer: "Uncle Fester",
          brewery: "Evans Brewing Co.",
          city: "Corona",
        },
      ],
    },
    {
      image: "/spotlight/gabf-2026/cat-56.webp",
      category: "Category 56 · German-Style Maerzen · 184 entries",
      alt: "Final table for Category 56, German-Style Maerzen, 184 entries. Fifteen finalists, including My Favorite Marzen by Mars Brewing Company of Rancho Cucamonga, CA, and Munich Lager Bavarian Style-Maerzen by Ritual Brewing Co. of Redlands, CA.",
      highlights: [
        {
          box: { x: 698, y: 445, w: 370, h: 125 },
          award: "finalist",
          beer: "My Favorite Marzen",
          brewery: "Mars Brewing Co.",
          city: "Rancho Cucamonga",
          memberSlug: "mars-brewing-co",
        },
        {
          box: { x: 1262, y: 297, w: 480, h: 152 },
          award: "finalist",
          beer: "Munich Lager Bavarian Style-Maerzen",
          brewery: "Ritual Brewing Co.",
          city: "Redlands",
        },
      ],
    },
  ],
};

export type SpotlightBeat = { slideIndex: number; highlightIndex: number };

/** One beat per highlighted name, slide by slide. */
export function beatsOf(spotlight: Spotlight): SpotlightBeat[] {
  return spotlight.slides.flatMap((slide, slideIndex) =>
    slide.highlights.map((_, highlightIndex) => ({ slideIndex, highlightIndex })),
  );
}

/** How much of the frame a highlighted name fills once zoomed in. */
const FILL = 0.6;

/**
 * The glide toward a name: scale the slide (from its top-left corner) and
 * translate it (in % of the frame) so the name sits in the middle, filling
 * about 60% of the frame, never past maxScale and never zoomed out. Near an
 * edge the slide stops at the frame's edge instead of pulling away from it.
 */
export function zoomFor(
  box: SpotlightBox,
  maxScale: number,
): { scale: number; x: number; y: number } {
  const scale = Math.max(
    1,
    Math.min(maxScale, (FILL * SLIDE_WIDTH) / box.w, (FILL * SLIDE_HEIGHT) / box.h),
  );
  const clamp = (value: number, min: number) => Math.min(0, Math.max(min, value));
  const tx = clamp(
    SLIDE_WIDTH / 2 - scale * (box.x + box.w / 2),
    SLIDE_WIDTH - scale * SLIDE_WIDTH,
  );
  const ty = clamp(
    SLIDE_HEIGHT / 2 - scale * (box.y + box.h / 2),
    SLIDE_HEIGHT - scale * SLIDE_HEIGHT,
  );
  return { scale, x: (tx / SLIDE_WIDTH) * 100, y: (ty / SLIDE_HEIGHT) * 100 };
}

/**
 * A hand-drawn marker loop around a name: a rounded rectangle (a
 * "squircle", so it clears the name's corners, which an oval would cut
 * through) a little bigger than the box, with a slight wobble, running
 * about 1.1 times around so its ends overlap like a pen stroke. In slide
 * pixels (the overlay's viewBox).
 */
export function markerPath(box: SpotlightBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2 + Math.max(28, box.w * 0.1);
  const ry = box.h / 2 + Math.max(12, box.h * 0.08);
  const steps = 72;
  const turns = 1.1;
  const start = (-100 * Math.PI) / 180;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * turns * 2 * Math.PI;
    // The second time around drifts out a touch, as a pen does.
    const wobble = 1 + 0.025 * Math.sin(3 * t + 0.6) + 0.03 * (i / steps);
    const x = cx + rx * wobble * squircle(Math.cos(t));
    const y = cy + ry * wobble * squircle(Math.sin(t));
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(" ");
}

/** Pushes a circle's point out toward the corners of its square. */
function squircle(v: number): number {
  return Math.sign(v) * Math.abs(v) ** 0.45;
}
