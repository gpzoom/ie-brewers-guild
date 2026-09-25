import type { CropRect } from "@/lib/media/crop";

/** Carousel slide frame: portrait 4:5 (spec, "The slot"). */
export const CAROUSEL_ASPECT = 4 / 5;
/**
 * Cover band: 2.5:1 on phone (spec, "Profile hero and theme"). Desktop's
 * 4:1 reuses this same rectangle (Phase 3's stated v1 limitation).
 */
export const COVER_ASPECT = 2.5;

/**
 * The 4:5 slot is fixed (spec, "The slot") -- what the member actually
 * controls is which part of their original photo fills it. These are the
 * three operations CropEditor.tsx needs: an initial centered crop when an
 * image is first assigned to a slide/cover, panning, and zooming, all
 * expressed as the same fractional CropRect Phase 3's computeCropStyle
 * already renders.
 */
export function initialCropForAspect(naturalWidth: number, naturalHeight: number, targetAspect: number): CropRect {
  const naturalAspect = naturalWidth / naturalHeight;

  if (naturalAspect > targetAspect) {
    const w = targetAspect / naturalAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }

  const h = naturalAspect / targetAspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

export function panCropRect(crop: CropRect, deltaX: number, deltaY: number): CropRect {
  const x = Math.min(Math.max(crop.x + deltaX, 0), 1 - crop.w);
  const y = Math.min(Math.max(crop.y + deltaY, 0), 1 - crop.h);
  return { ...crop, x, y };
}

/** Smallest crop window side, as a fraction of the original (i.e. max 20x zoom). */
const MIN_CROP_FRACTION = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * scaleFactor > 1 zooms in (shrinks the window); < 1 zooms out, capped so it
 * can never exceed the full original.
 *
 * Both sides are divided by the SAME (clamped) factor, so the crop's aspect
 * ratio never changes -- clamping w and h independently (the original shape
 * of this function) silently changed the aspect as soon as one side hit a
 * bound, which is what visibly stretched the image inside its fixed-aspect
 * frame. The factor is clamped so neither side exceeds 1 (the full
 * original) or drops below MIN_CROP_FRACTION; if those two limits conflict
 * (an extremely thin crop), "never exceed the original" wins.
 */
export function zoomCropRect(crop: CropRect, scaleFactor: number): CropRect {
  if (crop.w <= 0 || crop.h <= 0 || !(scaleFactor > 0)) return crop;
  const centerX = crop.x + crop.w / 2;
  const centerY = crop.y + crop.h / 2;
  // factor >= max(w, h) keeps both sides <= 1; factor <= min(w, h) / MIN
  // keeps both sides >= MIN.
  const minFactor = Math.max(crop.w, crop.h);
  const maxFactor = Math.max(minFactor, Math.min(crop.w, crop.h) / MIN_CROP_FRACTION);
  const factor = clamp(scaleFactor, minFactor, maxFactor);
  const w = crop.w / factor;
  const h = crop.h / factor;
  const x = clamp(centerX - w / 2, 0, 1 - w);
  const y = clamp(centerY - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

/**
 * True when the crop's REAL (pixel) aspect -- (w * naturalWidth) /
 * (h * naturalHeight) -- matches the frame it's rendered into, within a
 * small relative tolerance (floating-point drift from repeated pan/zoom).
 * computeCropStyle sizes the <img> width and height independently, so a
 * crop that fails this check renders visibly stretched or squashed.
 */
export function cropMatchesAspect(
  crop: CropRect,
  naturalWidth: number,
  naturalHeight: number,
  frameAspect: number,
  tolerance = 0.01,
): boolean {
  if (crop.w <= 0 || crop.h <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return false;
  const actual = (crop.w * naturalWidth) / (crop.h * naturalHeight);
  return Math.abs(actual / frameAspect - 1) <= tolerance;
}

/**
 * The nearest crop with the frame's real aspect: same center point, same
 * area (so a mostly-right crop keeps roughly its zoom level), scaled down
 * only if a side would exceed the full original, then nudged back inside
 * [0, 1]. For the legacy full-image fallback crop {0,0,1,1} this yields
 * exactly initialCropForAspect's centered fill. Returns the input crop
 * unchanged (same object) when it already matches.
 */
export function fitCropToAspect(
  crop: CropRect,
  naturalWidth: number,
  naturalHeight: number,
  frameAspect: number,
): CropRect {
  if (naturalWidth <= 0 || naturalHeight <= 0 || frameAspect <= 0) return crop;
  if (crop.w <= 0 || crop.h <= 0) return initialCropForAspect(naturalWidth, naturalHeight, frameAspect);
  if (cropMatchesAspect(crop, naturalWidth, naturalHeight, frameAspect)) return crop;

  // Required w/h ratio in fractional (not pixel) units.
  const ratio = (frameAspect * naturalHeight) / naturalWidth;
  const area = crop.w * crop.h;
  let h = Math.sqrt(area / ratio);
  let w = ratio * h;
  const overflow = Math.max(w, h);
  if (overflow > 1) {
    w /= overflow;
    h /= overflow;
  }
  const centerX = crop.x + crop.w / 2;
  const centerY = crop.y + crop.h / 2;
  return {
    x: clamp(centerX - w / 2, 0, 1 - w),
    y: clamp(centerY - h / 2, 0, 1 - h),
    w,
    h,
  };
}
