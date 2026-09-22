import { useState } from "react";
import { computeCropStyle, type CropRect } from "@/lib/media/crop";
import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";
import { cn } from "@/lib/utils";

type MemberImageProps = {
  src: string | null;
  crop: CropRect | null;
  alt: string;
  theme: MemberThemeName;
  aspectClassName: string; // e.g. "aspect-[4/5]" or "aspect-[2.5/1]"
  className?: string;
};

/**
 * Crop-aware image for both the public member-logos bucket (direct
 * public URL) and the private member-media streaming route
 * (/api/member-media/$assetId) -- both are plain <img src> URLs from
 * this component's point of view. On load failure, or when there's no
 * image at all, renders a theme-coloured block instead of a broken-image
 * icon (spec, "Empty and error states": "An image fails to load ->
 * Theme-coloured block in its place, never a broken-image icon or alt
 * text alone").
 */
export function MemberImage({ src, crop, alt, theme, aspectClassName, className }: MemberImageProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={cn("relative overflow-hidden rounded-card", aspectClassName, className)}>
      {showFallback ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: getMemberThemeHex(theme) }}
          role="img"
          aria-label={alt}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          style={crop ? computeCropStyle(crop) : { position: "absolute", inset: 0, width: "100%", height: "100%" }}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
