import { useEffect, useRef, useState } from "react";
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

// Same ~400ms debounce as BasicsForm/HoursEditor's own autosave (this
// plan's established convention, see BasicsForm.tsx's SAVE_DEBOUNCE_MS).
// CropEditor's onPointerMove fires onChange on every pointer-move sample,
// so a single drag gesture would otherwise turn into dozens of immediate,
// unawaited POSTs -- and under out-of-order network delivery, an older
// crop landing after a newer one would visibly "undo" part of the
// member's own edit. The LOCAL/visual crop below still updates instantly
// on every onChange (dragging must stay responsive); only the network
// write is debounced, and it's flushed immediately on pointer-up/
// pointer-cancel (see the wrapping div's handlers below) so the final
// dragged position is always what gets persisted, never whatever the
// debounce timer's last snapshot happened to be mid-drag.
const CROP_SAVE_DEBOUNCE_MS = 400;

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
  // One error slot per carousel position -- assign/unassign/crop/link
  // failures all render into the same spot, since only one of those
  // actions can realistically be in flight for a given slot at a time.
  const [errors, setErrors] = useState<Record<number, string | undefined>>({});

  // Last known PERSISTED crop per slide id. A failed debounced crop save
  // rolls the visual crop back to this rather than leaving it showing a
  // position the server never actually saved -- same reasoning as
  // MediaGallery.tsx's reinsertAsset for a failed delete: the optimistic
  // update must be undone on a real failure, not left to silently diverge
  // from the server until the next reload.
  const savedCropRef = useRef<Record<string, CarouselSlideRow["crop"]>>(
    Object.fromEntries(initialSlides.map((slide) => [slide.id, slide.crop])),
  );
  const cropDebounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = cropDebounceTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  function slideForSlot(slot: number) {
    return slides.find((slide) => slide.sort_order === slot);
  }

  function setSlotError(slot: number, message: string | undefined) {
    setErrors((prev) => ({ ...prev, [slot]: message }));
  }

  function friendlyMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  /**
   * Fire-and-forget with no error handling was the brief's given shape --
   * if assignCarouselSlide throws (ownership-check failure, an RLS
   * denial, a unique-slot race, ...) that became an unhandled promise
   * rejection with the <select> left showing the just-picked photo while
   * nothing was actually saved and no error was ever shown. There's no
   * optimistic slide to roll back here (the given code only mutates
   * `slides` AFTER a successful response), so this just needs the
   * try/catch to surface a real message -- same shape as HoursEditor's
   * addRowForWeekday.
   */
  async function onAssign(slot: number, asset: MediaAssetRow) {
    setSlotError(slot, undefined);
    try {
      const { id, crop } = await assignCarouselSlide({
        data: { memberId, sortOrder: slot, assetId: asset.id, asset: { width: asset.width, height: asset.height } },
      });
      savedCropRef.current[id] = crop;
      setSlides((prev) => [
        ...prev.filter((slide) => slide.sort_order !== slot),
        { id, member_id: memberId, asset_id: asset.id, crop, outbound_url: null, sort_order: slot },
      ]);
    } catch (error) {
      setSlotError(slot, friendlyMessage(error, "Couldn't assign this photo — try again."));
    }
  }

  /**
   * Optimistically removes the slide, same as the brief's given code --
   * but now rolls it back into view on a real failure (an RLS-denied
   * delete, a network error) instead of leaving the member's carousel
   * silently missing a slide the server never actually cleared. Same
   * shape as MediaGallery.tsx's onDelete/reinsertAsset.
   */
  async function onUnassign(slide: CarouselSlideRow) {
    setSlides((prev) => prev.filter((s) => s.id !== slide.id));
    setSlotError(slide.sort_order, undefined);

    const timer = cropDebounceTimers.current[slide.id];
    if (timer) {
      clearTimeout(timer);
      delete cropDebounceTimers.current[slide.id];
    }

    try {
      await unassignCarouselSlide({ data: { id: slide.id } });
      delete savedCropRef.current[slide.id];
    } catch (error) {
      setSlides((prev) => (prev.some((s) => s.id === slide.id) ? prev : [...prev, slide]));
      setSlotError(slide.sort_order, friendlyMessage(error, "Couldn't remove this slide — try again."));
    }
  }

  /** Sends whatever crop is CURRENTLY in `slides` for this slide id -- not a value captured in an earlier closure. */
  function saveCropNow(slideId: string, slot: number) {
    const current = slides.find((s) => s.id === slideId);
    if (!current) return;
    const cropToSave = current.crop;

    updateCarouselSlideCrop({ data: { id: slideId, crop: cropToSave } })
      .then(() => {
        savedCropRef.current[slideId] = cropToSave;
        setSlotError(slot, undefined);
      })
      .catch((error: unknown) => {
        const rollback = savedCropRef.current[slideId];
        if (rollback) {
          setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, crop: rollback } : s)));
        }
        setSlotError(slot, friendlyMessage(error, "Couldn't save this crop — try again."));
      });
  }

  /** Cancels a slide's pending debounced crop save and sends the current crop immediately. */
  function flushCropSave(slideId: string, slot: number) {
    const timer = cropDebounceTimers.current[slideId];
    if (timer) {
      clearTimeout(timer);
      delete cropDebounceTimers.current[slideId];
    }
    saveCropNow(slideId, slot);
  }

  function onCropChange(slide: CarouselSlideRow, crop: CarouselSlideRow["crop"]) {
    // Local/visual update is instant on every call -- dragging must stay
    // responsive regardless of the network debounce below.
    setSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, crop } : s)));

    if (cropDebounceTimers.current[slide.id]) clearTimeout(cropDebounceTimers.current[slide.id]);
    cropDebounceTimers.current[slide.id] = setTimeout(() => {
      delete cropDebounceTimers.current[slide.id];
      saveCropNow(slide.id, slide.sort_order);
    }, CROP_SAVE_DEBOUNCE_MS);
  }

  /**
   * Same "await + catch, show a real error" shape as the other three
   * actions -- the brief's given code called this from onBlur with no
   * error handling at all. The onBlur-only save trigger itself (no
   * beforeunload guard) is unchanged/out of scope here, matching this
   * app's existing autosave convention elsewhere (BasicsForm, HoursEditor).
   */
  async function onLinkBlur(slide: CarouselSlideRow, outboundUrl: string | null) {
    setSlotError(slide.sort_order, undefined);
    try {
      await updateCarouselSlideLink({ data: { id: slide.id, outboundUrl } });
    } catch (error) {
      setSlotError(slide.sort_order, friendlyMessage(error, "Couldn't save this link — try again."));
    }
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
                  {/* onPointerUp/onPointerCancel here catch the same
                      pointer events CropEditor's own internal handlers
                      respond to (it doesn't stop their propagation) --
                      this is how the debounced crop save gets flushed the
                      moment a drag ends, without CropEditor itself needing
                      to know anything about debouncing. */}
                  <div
                    onPointerUp={() => flushCropSave(slide.id, slot)}
                    onPointerCancel={() => flushCropSave(slide.id, slot)}
                  >
                    <CropEditor
                      imageUrl={`/api/admin-media/${asset.id}`}
                      crop={slide.crop}
                      aspectClassName="aspect-[4/5]"
                      onChange={(crop) => onCropChange(slide, crop)}
                    />
                  </div>
                  <Label htmlFor={`slide-link-${slide.id}`}>Tap-through link (optional)</Label>
                  <Input
                    id={`slide-link-${slide.id}`}
                    defaultValue={slide.outbound_url ?? ""}
                    className="h-11"
                    onBlur={(e) => void onLinkBlur(slide, e.target.value || null)}
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
              {errors[slot] && (
                <p role="alert" className="text-xs text-danger">
                  {errors[slot]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
