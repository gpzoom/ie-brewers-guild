import { useState } from "react";
import {
  assignCarouselSlide,
  unassignCarouselSlide,
  updateCarouselSlideCrop,
  updateCarouselSlideLink,
} from "@/lib/media/carousel.server";
import { CropEditor } from "@/components/admin/CropEditor";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SLOTS = [0, 1, 2, 3];

/** "Portrait" everywhere a member can see it -- "4:5" appears once, as small grey supporting text (spec, "The slot"). */
export function CarouselEditor({
  memberId,
  initialSlides,
  galleryAssets,
}: {
  memberId: string;
  initialSlides: CarouselSlideRow[];
  galleryAssets: MediaAssetRow[];
}) {
  const [slides, setSlides] = useState(initialSlides);

  function slideForSlot(slot: number) {
    return slides.find((slide) => slide.sort_order === slot);
  }

  async function onAssign(slot: number, asset: MediaAssetRow) {
    const { id, crop } = await assignCarouselSlide({
      data: { memberId, sortOrder: slot, assetId: asset.id, asset: { width: asset.width, height: asset.height } },
    });
    setSlides((prev) => [
      ...prev.filter((slide) => slide.sort_order !== slot),
      { id, member_id: memberId, asset_id: asset.id, crop, outbound_url: null, sort_order: slot },
    ]);
  }

  async function onUnassign(slide: CarouselSlideRow) {
    setSlides((prev) => prev.filter((s) => s.id !== slide.id));
    await unassignCarouselSlide({ data: { id: slide.id } });
  }

  function onCropChange(slide: CarouselSlideRow, crop: CarouselSlideRow["crop"]) {
    setSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, crop } : s)));
    void updateCarouselSlideCrop({ data: { id: slide.id, crop } });
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Portrait carousel</h2>
      <p className="text-xs text-muted-foreground">4:5 — up to four slides.</p>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SLOTS.map((slot) => {
          const slide = slideForSlot(slot);
          const asset = slide ? galleryAssets.find((a) => a.id === slide.asset_id) : undefined;
          return (
            <div key={slot} className="space-y-2">
              {slide && asset ? (
                <>
                  {/* Served through /api/admin-media, NOT /api/member-media --
                      that other route only serves an asset once it's already
                      referenced by a PUBLISHED member's own logo/cover/
                      carousel slide, which this member's own admin panel
                      can't rely on while they're still assigning/editing
                      slots (and possibly still draft/pending themselves).
                      /api/admin-media instead checks OWNERSHIP via
                      requireMemberSession(), which is the right rule here.
                      See src/routes/api.admin-media.$assetId.ts and
                      MediaGallery.tsx's identical choice. */}
                  <CropEditor
                    imageUrl={`/api/admin-media/${asset.id}`}
                    crop={slide.crop}
                    aspectClassName="aspect-[4/5]"
                    onChange={(crop) => onCropChange(slide, crop)}
                  />
                  <Label htmlFor={`slide-link-${slide.id}`}>Tap-through link (optional)</Label>
                  <Input
                    id={`slide-link-${slide.id}`}
                    defaultValue={slide.outbound_url ?? ""}
                    className="h-11"
                    onBlur={(e) => void updateCarouselSlideLink({ data: { id: slide.id, outboundUrl: e.target.value || null } })}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9 w-full" onClick={() => onUnassign(slide)}>
                    Remove from carousel
                  </Button>
                </>
              ) : (
                <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-2">
                  <span className="text-xs text-muted-foreground">Slot {slot + 1}</span>
                  <select
                    className="h-11 w-full rounded-md border border-border bg-background text-sm"
                    aria-label={`Choose a photo for slot ${slot + 1}`}
                    defaultValue=""
                    onChange={(e) => {
                      const asset = galleryAssets.find((a) => a.id === e.target.value);
                      if (asset) void onAssign(slot, asset);
                    }}
                  >
                    <option value="" disabled>
                      Choose from gallery…
                    </option>
                    {galleryAssets
                      .filter((a) => a.review_status === "approved")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.original_filename ?? a.id}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
