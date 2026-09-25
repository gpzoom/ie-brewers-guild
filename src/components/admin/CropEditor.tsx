import { useEffect, useRef, useState } from "react";
import { computeCropStyle, type CropRect } from "@/lib/media/crop";
import {
  fitCropToAspect,
  initialCropForAspect,
  panCropRect,
  zoomCropRect,
} from "@/lib/media/crop-interaction";
import { Button } from "@/components/ui/button";

type NaturalSize = { url: string; width: number; height: number };

/**
 * A pointer-drag-to-pan, button-to-zoom crop editor over a fixed-aspect
 * window. Fires onChange with each new CropRect; the caller (CarouselEditor,
 * CoverEditor) is responsible for persisting it via its own autosaving
 * mutation -- this component holds no server state itself.
 *
 * Stretch guard: computeCropStyle sizes the <img> width and height
 * independently, so a stored crop whose REAL aspect doesn't match the frame
 * (e.g. the {0,0,1,1} fallback saved for assets uploaded before
 * media_assets.width/height were recorded) renders visibly squashed. Once
 * the image loads, this reads its naturalWidth/naturalHeight and, if the
 * crop doesn't fit the frame, displays the nearest valid crop instead
 * (fitCropToAspect: same center, same area) AND hands it to onChange once,
 * so the caller's normal save path persists the correction -- otherwise the
 * public profile (MemberImage uses the stored crop) would stay squashed
 * until the member happened to pan/zoom. That one write is guarded per
 * image URL (autoCorrectedUrlRef), so it can't loop: a loader refresh that
 * brings back the corrected value matches and does nothing, and a failed
 * save that rolls back to the bad crop isn't retried for the same image.
 * While a Guild admin is impersonating this does write (and audit) -- it's
 * a real correction to the stored data.
 */
export function CropEditor({
  imageUrl,
  crop,
  aspect,
  aspectClassName,
  onChange,
}: {
  imageUrl: string;
  crop: CropRect;
  /** Frame width / height, e.g. 4 / 5 or 2.5 -- must match aspectClassName. */
  aspect: number;
  aspectClassName: string; // e.g. "aspect-[4/5]"
  onChange: (crop: CropRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);

  // Tied to the URL it was measured for, so switching photos never applies
  // the previous photo's size to the new one.
  const size = natural && natural.url === imageUrl ? natural : null;
  const displayCrop = size ? fitCropToAspect(crop, size.width, size.height, aspect) : crop;

  // Persist a display-only correction exactly once per loaded image.
  // fitCropToAspect returns the SAME object when the crop already fits, so
  // identity is the "needs correcting" test.
  const autoCorrectedUrlRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!size || displayCrop === crop) return;
    if (autoCorrectedUrlRef.current === size.url) return;
    autoCorrectedUrlRef.current = size.url;
    onChangeRef.current(displayCrop);
  }, [size, crop, displayCrop]);

  function recordNaturalSize(img: HTMLImageElement) {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNatural({ url: imageUrl, width: img.naturalWidth, height: img.naturalHeight });
    }
  }

  // A cached image can finish loading before React attaches onLoad (e.g.
  // during hydration), in which case onLoad never fires.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) recordNaturalSize(img);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  function onPointerDown(event: React.PointerEvent) {
    setDragStart({ x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = -(event.clientX - dragStart.x) / rect.width;
    const deltaY = -(event.clientY - dragStart.y) / rect.height;
    onChange(panCropRect(displayCrop, deltaX * displayCrop.w, deltaY * displayCrop.h));
    setDragStart({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp() {
    setDragStart(null);
  }

  // pointerup isn't the only way a drag ends -- an incoming call, an OS
  // gesture, or the browser otherwise interrupting an active touch/pen
  // interaction fires pointercancel instead, with no pointerup at all. Left
  // unhandled, dragStart stays set and a later, unrelated pointermove
  // (from a completely different subsequent gesture) keeps panning the
  // crop with no button/finger actually held.
  function onPointerCancel() {
    setDragStart(null);
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        // touch-none: without it a finger drag on a phone scrolls the page
        // instead of panning the photo.
        className={`relative w-full touch-none overflow-hidden rounded-md bg-canvas-2 ${
          dragStart ? "cursor-grabbing" : "cursor-grab"
        } ${aspectClassName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        role="application"
        aria-label="Drag to reposition the crop"
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          style={computeCropStyle(displayCrop)}
          draggable={false}
          className="pointer-events-none select-none"
          onLoad={(e) => recordNaturalSize(e.currentTarget)}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">Drag to reposition</p>
      <div className="flex justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          aria-label="Zoom out"
          onClick={() => onChange(zoomCropRect(displayCrop, 0.9))}
        >
          −
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          aria-label="Zoom in"
          onClick={() => onChange(zoomCropRect(displayCrop, 1.1))}
        >
          +
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={!size}
          onClick={() => {
            if (size) onChange(initialCropForAspect(size.width, size.height, aspect));
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
