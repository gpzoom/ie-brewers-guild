import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { computeCropStyle, cropForWiderFrame, type CropRect } from "@/lib/media/crop";
import {
  fitCropToAspect,
  initialCropForAspect,
  panCropRect,
  zoomCropRect,
} from "@/lib/media/crop-interaction";

type NaturalSize = { url: string; width: number; height: number };

/** Zoom slider range, as a multiple of the widest crop the frame allows (1 = the whole photo fits). */
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

/** Outline button used for Reset here and for the callers' extra actions (artboard AdminMedia). */
export const cropActionButtonClass =
  "inline-flex h-11 flex-1 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-4 text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute h-3.5 w-3.5 border-[#F9F6F0] ${className}`} />;
}

/**
 * A pointer-drag-to-pan, slider-to-zoom crop editor over a fixed-aspect
 * window. Fires onChange with each new CropRect; the caller (CarouselEditor,
 * CoverEditor) is responsible for persisting it via its own autosaving
 * mutation -- this component holds no server state itself.
 *
 * Zoom goes through zoomCropRect (aspect-preserving, centre-anchored), with
 * the slider's value expressed relative to the widest crop the frame allows
 * (initialCropForAspect) -- so 1x is "whole photo fits" for every photo.
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
  wideGuideAspect,
  actions,
}: {
  imageUrl: string;
  crop: CropRect;
  /** Frame width / height, e.g. 4 / 5 or 2.5 -- must match aspectClassName. */
  aspect: number;
  aspectClassName: string; // e.g. "aspect-[4/5]"
  onChange: (crop: CropRect) => void;
  /**
   * When the same crop is also shown in a WIDER frame elsewhere (the 4:1
   * desktop cover band), shades the parts of this frame that the wider one
   * cuts off -- computed with the same cropForWiderFrame the public page uses.
   */
  wideGuideAspect?: number;
  /** Extra buttons shown beside Reset (e.g. "Remove from carousel"). */
  actions?: ReactNode;
}) {
  const zoomId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);

  // Tied to the URL it was measured for, so switching photos never applies
  // the previous photo's size to the new one.
  const size = natural && natural.url === imageUrl ? natural : null;
  const displayCrop = size ? fitCropToAspect(crop, size.width, size.height, aspect) : crop;

  // Widest crop this frame allows for this photo -- the slider's 1x.
  const baseWidth = size ? initialCropForAspect(size.width, size.height, aspect).w : null;
  const zoom =
    baseWidth && displayCrop.w > 0
      ? Math.min(Math.max(baseWidth / displayCrop.w, MIN_ZOOM), MAX_ZOOM)
      : MIN_ZOOM;

  // Visible band of the wider frame, as fractions of THIS frame's height.
  let wideBand: { top: number; height: number } | null = null;
  if (wideGuideAspect && wideGuideAspect > aspect && displayCrop.h > 0) {
    const wide = cropForWiderFrame(displayCrop, aspect, wideGuideAspect);
    wideBand = { top: (wide.y - displayCrop.y) / displayCrop.h, height: wide.h / displayCrop.h };
  }

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

  /** Slider -> the aspect-preserving zoomCropRect, targeting an absolute zoom level. */
  function onZoomInput(targetZoom: number) {
    if (!baseWidth || !(targetZoom > 0) || displayCrop.w <= 0) return;
    const targetWidth = baseWidth / targetZoom;
    const next = zoomCropRect(displayCrop, displayCrop.w / targetWidth);
    if (next !== displayCrop) onChange(next);
  }

  return (
    <div className="flex flex-col gap-[13px]">
      {/* Dark frame + crop window with corner marks (artboard AdminMedia). */}
      <div className="rounded-[13px] bg-[#221E18] p-[21px]">
        <div
          ref={containerRef}
          // touch-none: without it a finger drag on a phone scrolls the page
          // instead of panning the photo.
          className={`relative w-full touch-none overflow-hidden rounded-[4px] bg-[#38322A] ${
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
          {wideBand && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 bg-black/50"
                style={{ height: `${(wideBand.top * 100).toFixed(2)}%` }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50"
                style={{ height: `${((1 - wideBand.top - wideBand.height) * 100).toFixed(2)}%` }}
              />
            </>
          )}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[4px] border-2 border-[#F9F6F0]" />
          <Corner className="left-2 top-2 border-l-[3px] border-t-[3px]" />
          <Corner className="right-2 top-2 border-r-[3px] border-t-[3px]" />
          <Corner className="bottom-2 left-2 border-b-[3px] border-l-[3px]" />
          <Corner className="bottom-2 right-2 border-b-[3px] border-r-[3px]" />
          {!dragStart && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] tracking-[0.1em] text-[#EFEAE1] [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]"
            >
              DRAG TO REPOSITION
            </div>
          )}
        </div>
      </div>

      {wideBand && (
        <p className="text-[11px] leading-[1.5] text-ink-subtle">
          The shaded strips are hidden on wide screens.
        </p>
      )}

      <div className="flex flex-col gap-[7px]">
        <label htmlFor={zoomId} className="text-[12px] font-medium text-ink">
          Zoom
        </label>
        <input
          id={zoomId}
          type="range"
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={1}
          value={Math.round(zoom * 100)}
          disabled={!size}
          aria-valuetext={`${zoom.toFixed(1)}×`}
          onChange={(e) => onZoomInput(Number(e.target.value) / 100)}
          className="h-11 w-full cursor-pointer accent-ink disabled:cursor-default disabled:opacity-50"
        />
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          className={cropActionButtonClass}
          disabled={!size}
          onClick={() => {
            if (size) onChange(initialCropForAspect(size.width, size.height, aspect));
          }}
        >
          Reset
        </button>
        {actions}
      </div>
    </div>
  );
}
