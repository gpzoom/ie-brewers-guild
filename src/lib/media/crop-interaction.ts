import type { CropRect } from "@/lib/media/crop";

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

/** scaleFactor > 1 zooms in (shrinks the window); < 1 zooms out, capped so it can never exceed the full original. */
export function zoomCropRect(crop: CropRect, scaleFactor: number): CropRect {
  const centerX = crop.x + crop.w / 2;
  const centerY = crop.y + crop.h / 2;
  const w = Math.min(Math.max(crop.w / scaleFactor, 0.05), 1);
  const h = Math.min(Math.max(crop.h / scaleFactor, 0.05), 1);
  const x = Math.min(Math.max(centerX - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(centerY - h / 2, 0), 1 - h);
  return { x, y, w, h };
}
