import { cn } from "@/lib/utils";

type LogoChipProps = {
  src: string | null;
  alt: string;
  size?: number; // px; defaults to 68 (the phone hero, artboards D/E/V).
  // Radius, border and ground come from the caller (the hero chip is a
  // white rounded square with a canvas-colored ring; the cross-link
  // card's is an ivory rounded square) -- see the artboards.
  className?: string;
  /**
   * The member's chosen tile color (members.logo_background, resolved by
   * logoBackgroundColor). Wins over any bg-* class; omitted = white.
   */
  background?: string | null;
};

/**
 * Always places a member logo on its own chip, never directly on a page
 * surface (spec, "Logos and assets": a transparent PNG of a dark-ink
 * mark disappears against the dark guild chrome). The chip is white unless
 * the member chose a dark or theme-color tile for a light logo
 * (members.logo_background). Every logo render in
 * this build goes through this component -- most importantly the
 * cross-link card at the bottom of every profile, which the spec calls
 * out by name as where this bites.
 *
 * Renders through a plain <img>, never inlined markup -- a member-
 * uploaded SVG logo can carry script and must never be parsed as markup
 * in this page's origin (spec, "Logos and assets").
 */
export function LogoChip({ src, alt, size = 68, className, background }: LogoChipProps) {
  if (!src) return null;

  return (
    <div
      className={cn("box-border flex shrink-0 items-center justify-center overflow-hidden bg-white p-1.5", className)}
      style={{ width: size, height: size, ...(background ? { backgroundColor: background } : {}) }}
    >
      <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
