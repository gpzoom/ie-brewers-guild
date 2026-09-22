import { useRef, useState } from "react";
import { computeCropStyle, type CropRect } from "@/lib/media/crop";
import { panCropRect, zoomCropRect } from "@/lib/media/crop-interaction";
import { Button } from "@/components/ui/button";

/**
 * A pointer-drag-to-pan, button-to-zoom crop editor over a fixed-aspect
 * window. Fires onChange with each new CropRect; the caller (CarouselEditor,
 * CoverEditor) is responsible for persisting it via its own autosaving
 * mutation -- this component holds no server state itself.
 */
export function CropEditor({
  imageUrl,
  crop,
  aspectClassName,
  onChange,
}: {
  imageUrl: string;
  crop: CropRect;
  aspectClassName: string; // e.g. "aspect-[4/5]"
  onChange: (crop: CropRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    setDragStart({ x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = -(event.clientX - dragStart.x) / rect.width;
    const deltaY = -(event.clientY - dragStart.y) / rect.height;
    onChange(panCropRect(crop, deltaX * crop.w, deltaY * crop.h));
    setDragStart({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp() {
    setDragStart(null);
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-md bg-canvas-2 ${aspectClassName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label="Drag to reposition the crop"
      >
        <img
          src={imageUrl}
          alt=""
          style={computeCropStyle(crop)}
          draggable={false}
          className="select-none"
        />
      </div>
      <div className="flex justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          aria-label="Zoom out"
          onClick={() => onChange(zoomCropRect(crop, 0.9))}
        >
          −
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          aria-label="Zoom in"
          onClick={() => onChange(zoomCropRect(crop, 1.1))}
        >
          +
        </Button>
      </div>
    </div>
  );
}
