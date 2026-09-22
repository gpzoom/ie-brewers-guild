import { cn } from "@/lib/utils";

type LogoChipProps = {
  src: string | null;
  alt: string;
  size?: number; // px; defaults to 72 (mobile). Pass 104 for the desktop hero.
  className?: string;
};

/**
 * Always places a member logo on a light chip, never directly on a dark
 * surface (spec, "Logos and assets": a transparent PNG of a dark-ink
 * mark disappears against the dark guild chrome). Every logo render in
 * this build goes through this component -- most importantly the
 * cross-link card at the bottom of every profile, which the spec calls
 * out by name as where this bites.
 *
 * Renders through a plain <img>, never inlined markup -- a member-
 * uploaded SVG logo can carry script and must never be parsed as markup
 * in this page's origin (spec, "Logos and assets").
 */
export function LogoChip({ src, alt, size = 72, className }: LogoChipProps) {
  if (!src) return null;

  return (
    <div
      className={cn("flex items-center justify-center rounded-full bg-canvas p-2 shadow-sm", className)}
      style={{ width: size, height: size }}
    >
      <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
