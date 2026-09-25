import type { CSSProperties } from "react";

/** Fractions of the original image's width/height (spec, "Media model"). */
export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * Renders an arbitrary fractional crop rectangle in pure CSS: scale the
 * full original image up so the cropped fraction fills the container
 * edge-to-edge, then translate so the crop's top-left lands on the
 * container's top-left. The caller wraps the returned style on an <img>
 * inside a `position: relative; overflow: hidden` container sized to the
 * display aspect ratio (spec: "the cropper reconciles it" to that
 * ratio -- this function trusts the stored rectangle is already correct
 * for the slot it's rendered into).
 *
 * This is the v1, CSS-only rendering path the spec explicitly allows
 * ("real server-side pixel resizing is a future optimization").
 */
/**
 * Derives the crop for a WIDER frame (e.g. the 4:1 desktop cover band) from
 * a crop composed for a narrower one (the 5:2 cover editor), without
 * stretching: same horizontal span, height cut by fromAspect/toAspect, and
 * the vertical position kept proportional -- a crop the member pushed to
 * the top stays top-anchored, a centered one stays centered, a bottom one
 * stays bottom. Returns the crop unchanged when toAspect isn't wider.
 */
export function cropForWiderFrame(crop: CropRect, fromAspect: number, toAspect: number): CropRect {
  if (toAspect <= fromAspect || crop.h <= 0) return crop;
  const h = crop.h * (fromAspect / toAspect);
  const slack = 1 - crop.h;
  const position = slack > 1e-6 ? Math.min(Math.max(crop.y / slack, 0), 1) : 0.5;
  const y = position * (1 - h);
  // When the stored crop already spans the image's full height, the narrower
  // slice is centered on it instead of on the whole image.
  const centeredY = crop.y + (crop.h - h) / 2;
  return { x: crop.x, y: slack > 1e-6 ? y : centeredY, w: crop.w, h };
}

export function computeCropStyle(crop: CropRect): CSSProperties {
  const { x, y, w, h } = crop;

  if (w <= 0 || h <= 0) {
    return { position: "absolute", inset: 0, width: "100%", height: "100%" };
  }

  return {
    position: "absolute",
    width: `${(100 / w).toFixed(4)}%`,
    height: `${(100 / h).toFixed(4)}%`,
    // Prefix the sign explicitly rather than negating before toFixed():
    // (-0).toFixed(4) is "0.0000" in JS (the sign is dropped), but the
    // identity/edge-aligned crops need a literal "-0.0000%" to be
    // consistent with the always-negative offset math.
    left: `-${((x / w) * 100).toFixed(4)}%`,
    top: `-${((y / h) * 100).toFixed(4)}%`,
    maxWidth: "none",
  };
}
