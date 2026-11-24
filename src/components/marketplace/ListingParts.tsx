import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_LABELS, type ListingKind, type MarketplaceListing } from "@/lib/marketplace/marketplace";

const KIND_COLORS: Record<ListingKind, string> = {
  equipment: "bg-[#E6EDF5] text-[#234A73]",
  inventory: "bg-[#E4F0E1] text-[#2F5E2C]",
  service: "bg-[#F0E8F5] text-[#5B3475]",
  wanted: "bg-[#FBEBD3] text-[#7A4A0B]",
};

export function KindPill({ kind }: { kind: ListingKind }) {
  return (
    <span className={cn("inline-flex w-fit rounded-full px-[11px] py-1 text-[11px] font-semibold", KIND_COLORS[kind])}>
      {KIND_LABELS[kind]}
    </span>
  );
}

const arrowClass =
  "flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-canvas-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** A listing's photos with previous/next arrows; a plain tile when it has none. */
export function PhotoFlip({
  listing,
  className,
}: {
  listing: Pick<MarketplaceListing, "title" | "photoUrls">;
  className?: string;
}) {
  const urls = listing.photoUrls.filter((url): url is string => url !== null);
  const [index, setIndex] = useState(0);
  const at = urls.length ? index % urls.length : 0;
  const many = urls.length > 1;
  const step = (by: number) => setIndex((i) => (i + by + urls.length) % urls.length);
  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      {many && (
        <button type="button" className={arrowClass} aria-label={`Previous photo of ${listing.title}`} onClick={() => step(-1)}>
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
      <div className="flex aspect-[4/3] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-canvas-2">
        {urls.length ? (
          <img
            src={urls[at]}
            alt={many ? `${listing.title}, photo ${at + 1} of ${urls.length}` : listing.title}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-[12px] text-ink-muted">
            <ImageOff aria-hidden="true" className="h-6 w-6" />
            No photo
          </span>
        )}
      </div>
      {many && (
        <button type="button" className={arrowClass} aria-label={`Next photo of ${listing.title}`} onClick={() => step(1)}>
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
