import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { CAROUSEL_ASPECT } from "@/lib/media/crop-interaction";
import {
  assignCarouselSlide,
  unassignCarouselSlide,
  updateCarouselSlideCrop,
  updateCarouselSlideLink,
} from "@/lib/media/carousel.server";
import { CropEditor, cropActionButtonClass } from "@/components/admin/CropEditor";
import { computeCropStyle } from "@/lib/media/crop";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";

const SLOTS = [0, 1, 2, 3];

const sectionLabelClass =
  "font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted";

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

/** "Portrait" everywhere a member can see it -- "4:5" appears once, as small gray supporting text (spec, "The slot"). */
export function CarouselEditor({
  memberId,
  initialSlides,
  galleryAssets,
}: {
  memberId: string;
  initialSlides: CarouselSlideRow[];
  galleryAssets: MediaAssetRow[];
}) {
  const router = useRouter();
  const [slides, setSlides] = useState(initialSlides);
  // One error slot per carousel position -- assign/unassign/crop/link
  // failures all render into the same spot, since only one of those
  // actions can realistically be in flight for a given slot at a time.
  const [errors, setErrors] = useState<Record<number, string | undefined>>({});
  // Which slot's slide is open in the crop panel (artboard AdminMedia shows
  // one crop editor for the selected tile). Falls back to the first filled
  // slot whenever this one is empty -- see `selected` below.
  const [selectedSlot, setSelectedSlot] = useState(0);

  // Last known PERSISTED crop per slide id. A failed debounced crop save
  // rolls the visual crop back to this rather than leaving it showing a
  // position the server never actually saved -- same reasoning as
  // MediaGallery.tsx's reinsertAsset for a failed delete: the optimistic
  // update must be undone on a real failure, not left to silently diverge
  // from the server until the next reload.
  const savedCropRef = useRef<Record<string, CarouselSlideRow["crop"]>>(
    Object.fromEntries(initialSlides.map((slide) => [slide.id, slide.crop])),
  );
  // The crop a debounced/flushed save should actually send. Deliberately
  // NOT read off `slides` state or captured in a closure at
  // setTimeout-schedule time: onCropChange/saveCropNow/flushCropSave are
  // plain functions redefined every render, so a closure captures
  // whichever render was active when the timer was armed -- which is
  // BEFORE that same event's own setSlides call has taken effect (React
  // batches state updates to the next render). If a member pans/zooms
  // and then holds the pointer down, motionless, for the full debounce
  // window without releasing, a closure-based read would fire the save
  // using the crop from one render-tick before the hold, not the
  // position actually being held -- and if that stale write's response
  // resolves AFTER the correct release-triggered flush's response
  // (ordinary network reordering), the server and `savedCropRef` (the
  // rollback snapshot) both end up holding the stale value. This ref is
  // written SYNCHRONOUSLY inside onCropChange, on every call, before the
  // timer is (re)armed -- so whatever the timer callback or the
  // pointerup/pointercancel flush reads at FIRE time is always the
  // latest actual crop, with no render lag and no closure to go stale.
  const latestCropRef = useRef<Record<string, CarouselSlideRow["crop"]>>(
    Object.fromEntries(initialSlides.map((slide) => [slide.id, slide.crop])),
  );
  const cropDebounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Number of crop save requests currently on the wire, per slide id. The
  // loader resync below leaves a slide's local crop alone while this is
  // non-zero, the same as while its debounce timer is pending -- a refresh
  // that started before the save landed would otherwise carry the old crop.
  const cropSavesInFlight = useRef<Record<string, number>>({});
  // Lets a failed assign clear the <select>'s own DOM value back to "" --
  // see onAssign's catch block for why: it's an uncontrolled element, so
  // resetting React state alone wouldn't touch what the browser is
  // actually showing, and a browser <select> never fires `change` for
  // re-picking the option that's already selected.
  const selectRefs = useRef<Record<number, HTMLSelectElement | null>>({});

  useEffect(() => {
    const timers = cropDebounceTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  // Resync from the loader whenever it re-runs (router.invalidate() after a
  // gallery upload/delete or after an assign/unassign here) -- otherwise
  // this local copy stays frozen at first render, e.g. still showing a
  // slide whose photo was just deleted from the gallery (which now removes
  // it from the carousel server-side). A slide the member is mid-way
  // through re-cropping (debounce timer pending, or its save request still
  // in flight) keeps its local crop.
  useEffect(() => {
    const isPending = (id: string) =>
      Boolean(cropDebounceTimers.current[id]) || (cropSavesInFlight.current[id] ?? 0) > 0;
    const next = initialSlides.map((slide) =>
      isPending(slide.id) && latestCropRef.current[slide.id]
        ? { ...slide, crop: latestCropRef.current[slide.id] }
        : slide,
    );
    for (const slide of initialSlides) {
      if (!isPending(slide.id)) {
        savedCropRef.current[slide.id] = slide.crop;
        latestCropRef.current[slide.id] = slide.crop;
      }
    }
    setSlides(next);
  }, [initialSlides]);

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
      latestCropRef.current[id] = crop;
      setSlides((prev) => [
        ...prev.filter((slide) => slide.sort_order !== slot),
        { id, member_id: memberId, asset_id: asset.id, crop, outbound_url: null, sort_order: slot },
      ]);
      setSelectedSlot(slot);
      // Keeps the loader's `slides` current for MediaGallery's "this photo
      // is in your carousel" delete warning. Not awaited: the assign itself
      // already succeeded, so a refresh hiccup mustn't hit the catch below.
      void router.invalidate();
    } catch (error) {
      // Reset the uncontrolled <select>'s own DOM value -- otherwise the
      // browser keeps showing the just-picked (but never actually saved)
      // option, and re-picking that SAME option again to retry does
      // nothing (no `change` event fires for re-selecting an
      // already-selected value), forcing the member to pick a different
      // photo first or reload the page just to retry.
      const select = selectRefs.current[slot];
      if (select) select.value = "";
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
      delete latestCropRef.current[slide.id];
      void router.invalidate();
    } catch (error) {
      setSlides((prev) => (prev.some((s) => s.id === slide.id) ? prev : [...prev, slide]));
      setSlotError(slide.sort_order, friendlyMessage(error, "Couldn't remove this slide — try again."));
    }
  }

  /**
   * Sends whatever crop is CURRENTLY in `latestCropRef` for this slide id
   * -- read at CALL time, not captured in a closure at schedule time. See
   * latestCropRef's own doc comment above for why that distinction is
   * exactly the fix for the hold-and-pause race.
   */
  function saveCropNow(slideId: string, slot: number) {
    const cropToSave = latestCropRef.current[slideId];
    if (!cropToSave) return;

    cropSavesInFlight.current[slideId] = (cropSavesInFlight.current[slideId] ?? 0) + 1;
    updateCarouselSlideCrop({ data: { id: slideId, crop: cropToSave } })
      .then(() => {
        savedCropRef.current[slideId] = cropToSave;
        setSlotError(slot, undefined);
      })
      .catch((error: unknown) => {
        const rollback = savedCropRef.current[slideId];
        if (rollback) {
          // Keep the ref in sync with what's now actually displayed --
          // otherwise a later flush (e.g. a stray pointerup) would read
          // this ref and re-send the crop that just failed instead of
          // the rolled-back one the member is now looking at.
          latestCropRef.current[slideId] = rollback;
          setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, crop: rollback } : s)));
        }
        setSlotError(slot, friendlyMessage(error, "Couldn't save this crop — try again."));
      })
      .finally(() => {
        const remaining = (cropSavesInFlight.current[slideId] ?? 1) - 1;
        if (remaining > 0) cropSavesInFlight.current[slideId] = remaining;
        else delete cropSavesInFlight.current[slideId];
      });
  }

  /**
   * If a slide has a pending debounced crop save, cancels it and sends the
   * current crop immediately. A no-op when nothing is pending -- a plain
   * tap on the frame (or on the zoom/Reset buttons, whose pointerup
   * bubbles here before their click) changed nothing and shouldn't write.
   */
  function flushCropSave(slideId: string, slot: number) {
    const timer = cropDebounceTimers.current[slideId];
    if (!timer) return;
    clearTimeout(timer);
    delete cropDebounceTimers.current[slideId];
    saveCropNow(slideId, slot);
  }

  function onCropChange(slide: CarouselSlideRow, crop: CarouselSlideRow["crop"]) {
    // Written SYNCHRONOUSLY, before anything else below -- this is what
    // makes latestCropRef always current regardless of React's render
    // timing. See its doc comment above.
    latestCropRef.current[slide.id] = crop;

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
   *
   * On success the local slide copy picks up the new link too: there's one
   * link field for whichever slide is selected, keyed by slide id, so
   * switching away and back remounts it from `slides` -- which would
   * otherwise still hold the pre-save value.
   */
  async function onLinkBlur(slide: CarouselSlideRow, outboundUrl: string | null) {
    setSlotError(slide.sort_order, undefined);
    try {
      await updateCarouselSlideLink({ data: { id: slide.id, outboundUrl } });
      setSlides((prev) =>
        prev.map((s) => (s.id === slide.id ? { ...s, outbound_url: outboundUrl } : s)),
      );
    } catch (error) {
      setSlotError(slide.sort_order, friendlyMessage(error, "Couldn't save this link — try again."));
    }
  }

  const approvedAssets = galleryAssets.filter((a) => a.review_status === "approved");
  const filledSlots = SLOTS.filter((slot) => {
    const slide = slideForSlot(slot);
    return slide !== undefined && galleryAssets.some((a) => a.id === slide.asset_id);
  });
  const activeSlot: number | undefined = filledSlots.includes(selectedSlot)
    ? selectedSlot
    : filledSlots[0];
  const selected = activeSlot === undefined ? undefined : slideForSlot(activeSlot);
  const selectedAsset = selected
    ? galleryAssets.find((a) => a.id === selected.asset_id)
    : undefined;

  return (
    <section
      aria-labelledby="carousel-heading"
      className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-x-[30px]"
    >
      {/* Slides grid -- right column on desktop, first on a phone. */}
      <div className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-start-1">
        <div className="flex items-baseline gap-2">
          <h2 id="carousel-heading" className={sectionLabelClass}>
            Your slides
          </h2>
          <span className="text-[10px] text-[#A89D8E]">Portrait · 4:5</span>
        </div>
        <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          {SLOTS.map((slot) => {
            const slide = slideForSlot(slot);
            const asset = slide ? galleryAssets.find((a) => a.id === slide.asset_id) : undefined;
            const isEditing = slide !== undefined && slot === activeSlot;
            const credited = asset?.source === "creator_upload" && asset.creator_credit;
            return (
              <li key={slot} className="flex min-w-0 flex-col gap-[7px]">
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
                    <button
                      type="button"
                      aria-pressed={isEditing}
                      aria-label={`Slide ${slot + 1}${isEditing ? ", open in the cropper" : " — crop this slide"}`}
                      onClick={() => setSelectedSlot(slot)}
                      className={`relative aspect-[4/5] w-full overflow-hidden rounded-[11px] bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        isEditing ? "border-2 border-ink" : "border border-canvas-border"
                      }`}
                    >
                      <img
                        src={`/api/admin-media/${asset.id}`}
                        alt=""
                        draggable={false}
                        style={computeCropStyle(slide.crop)}
                        className="pointer-events-none select-none"
                      />
                      {isEditing && (
                        <span className="absolute bottom-[9px] left-[9px] rounded-full bg-ink px-2 py-[3px] text-[9px] tracking-[0.08em] text-[#F9F6F0]">
                          EDITING
                        </span>
                      )}
                      {credited && (
                        <span className="absolute right-[9px] top-[9px] rounded-full border border-[#D3CBBD] bg-[#F9F6F0] px-2 py-[3px] text-[9px] tracking-[0.08em] text-[#3A332C]">
                          CREDITED
                        </span>
                      )}
                    </button>
                    <span className="truncate text-[11px] text-ink-muted">
                      {asset.source === "creator_upload"
                        ? `From ${asset.creator_name ?? "a creator"}`
                        : "Uploaded photo"}
                    </span>
                  </>
                ) : (
                  <>
                    {/* The "Add slide" tile IS the gallery picker: a native
                        <select> stretched invisibly over the dashed tile, so
                        a tap opens the platform's own picker. */}
                    <div className="relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-[9px] rounded-[11px] border-2 border-dashed border-[#D3CBBD] p-2 text-center focus-within:border-brand hover:bg-canvas-2">
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                        <path
                          d="M11 4.5v13M4.5 11h13"
                          stroke="#8C8275"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-[12px] font-medium text-ink-muted">Add slide</span>
                      {approvedAssets.length === 0 && (
                        <span className="text-[11px] leading-[1.4] text-ink-subtle">
                          Upload a photo below first
                        </span>
                      )}
                      <select
                        ref={(el) => {
                          selectRefs.current[slot] = el;
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                        aria-label={`Add a slide in position ${slot + 1}: choose a photo from your gallery`}
                        defaultValue=""
                        disabled={approvedAssets.length === 0}
                        onChange={(e) => {
                          const picked = galleryAssets.find((a) => a.id === e.target.value);
                          if (picked) void onAssign(slot, picked);
                        }}
                      >
                        <option value="" disabled>
                          Choose from gallery…
                        </option>
                        {approvedAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.original_filename ?? a.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[11px] text-ink-subtle">Position {slot + 1}</span>
                  </>
                )}
                {errors[slot] && (
                  <p role="alert" className="text-[11px] text-danger">
                    {errors[slot]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Crop panel for the selected slide -- left column on desktop. */}
      <div className="flex flex-col gap-[13px] lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div className="flex items-baseline gap-2">
          <h3 className={sectionLabelClass}>Crop to portrait</h3>
          <span className="text-[10px] text-[#A89D8E]">4:5</span>
        </div>
        {selected && selectedAsset && activeSlot !== undefined ? (
          // onPointerUp/onPointerCancel here catch the same pointer events
          // CropEditor's own internal handlers respond to (it doesn't stop
          // their propagation) -- this is how the debounced crop save gets
          // flushed the moment a drag (or a zoom-slider drag) ends, without
          // CropEditor itself needing to know anything about debouncing.
          <div
            className="w-full max-w-[300px]"
            onPointerUp={() => flushCropSave(selected.id, activeSlot)}
            onPointerCancel={() => flushCropSave(selected.id, activeSlot)}
          >
            <CropEditor
              imageUrl={`/api/admin-media/${selectedAsset.id}`}
              crop={selected.crop}
              aspect={CAROUSEL_ASPECT}
              aspectClassName="aspect-[4/5]"
              onChange={(crop) => onCropChange(selected, crop)}
              actions={
                <button
                  type="button"
                  className={cropActionButtonClass}
                  // Not a crop edit: keep this tap from flushing a pending
                  // crop save for a slide that's about to be removed.
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={() => onUnassign(selected)}
                >
                  Remove slide
                </button>
              }
            />
          </div>
        ) : (
          <div className="flex aspect-[4/5] w-full max-w-[300px] items-center justify-center rounded-[13px] bg-canvas-2 p-6 text-center text-[12px] leading-[1.5] text-ink-muted">
            Add a slide and you'll crop it here.
          </div>
        )}
      </div>

      {/* Tap-through link for the selected slide. */}
      {selected && (
        <div className="flex flex-col gap-2 self-start rounded-[13px] border border-canvas-border px-5 py-[18px] lg:col-start-2 lg:row-start-2">
          <label
            htmlFor={`slide-link-${selected.id}`}
            className="text-[13px] font-semibold text-ink"
          >
            Where this slide goes when tapped
          </label>
          <input
            key={selected.id}
            id={`slide-link-${selected.id}`}
            type="url"
            inputMode="url"
            placeholder="Paste your post link (optional)"
            defaultValue={selected.outbound_url ?? ""}
            onBlur={(e) => void onLinkBlur(selected, e.target.value || null)}
            className="h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-[13px] text-[13px] text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <p className="text-[11px] text-ink-subtle">
            Leave it blank and the slide just sits in the carousel.
          </p>
        </div>
      )}
    </section>
  );
}

