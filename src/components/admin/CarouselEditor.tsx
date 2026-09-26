import { useEffect, useMemo, useRef, useState } from "react";
import { CAROUSEL_ASPECT, initialCropForAspect } from "@/lib/media/crop-interaction";
import { CropEditor, cropActionButtonClass } from "@/components/admin/CropEditor";
import { hasPendingDraftSaves, useSaveDraftSection } from "@/components/admin/DraftStatusContext";
import { computeCropStyle } from "@/lib/media/crop";
import { validateLinkUrl } from "@/lib/links/url-safety";
import type { DraftSlide } from "@/lib/drafts/sections";
import type { MediaAssetRow } from "@/lib/supabase/types";

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

/**
 * A draft slide plus a client-only key. Draft slides have no ids; the key
 * is position + photo, so the same slide keeps the same key across a
 * loader refresh (the resync below relies on that), and assigning a new
 * photo to a slot gives it a fresh one.
 */
type CarouselSlideRow = DraftSlide & { id: string };

function slideKey(slide: Pick<DraftSlide, "sort_order" | "asset_id">) {
  return `${slide.sort_order}:${slide.asset_id}`;
}

function toRows(slides: DraftSlide[]): CarouselSlideRow[] {
  return slides.map((slide) => ({ ...slide, id: slideKey(slide) }));
}

function toDraftSlides(rows: CarouselSlideRow[]): DraftSlide[] {
  return rows.map(({ asset_id, crop, outbound_url, sort_order }) => ({ asset_id, crop, outbound_url, sort_order }));
}

/**
 * "Portrait" everywhere a member can see it -- "4:5" appears once, as small
 * gray supporting text (spec, "The slot").
 *
 * Phase 2: the slides are the member's DRAFT `media` section. Every change
 * (assign, remove, crop, tap-through link) saves the whole slide list
 * (saves are queued in order), and goes live when published -- by an owner
 * or full editor with Publish changes, or a Photos & events editor with
 * Publish photos.
 */
export function CarouselEditor({
  memberId,
  initialSlides: initialDraftSlides,
  galleryAssets,
}: {
  memberId: string;
  initialSlides: DraftSlide[];
  galleryAssets: MediaAssetRow[];
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const initialSlides = useMemo(() => toRows(initialDraftSlides), [initialDraftSlides]);
  const [slides, setSlides] = useState(initialSlides);
  // The same list, updated SYNCHRONOUSLY with every change (optimistically,
  // before its save), and read by each save WHEN IT RUNS (the patch is a
  // function) -- so a save queued before another change still sends the
  // latest slides, and nothing removed is ever sent again.
  const slidesRef = useRef<CarouselSlideRow[]>(initialSlides);
  function updateSlides(update: (prev: CarouselSlideRow[]) => CarouselSlideRow[]) {
    slidesRef.current = update(slidesRef.current);
    setSlides(slidesRef.current);
  }
  function saveSlides() {
    return saveDraft("media", () => ({ slides: toDraftSlides(slidesRef.current) }));
  }
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

  // On unmount (leaving the page or a wizard step mid-drag), every crop
  // still waiting out its debounce is SENT, not dropped. Through a ref so
  // the cleanup calls this render's flushCropSave (it reads only refs).
  const flushOnUnmountRef = useRef<() => void>(() => {});
  useEffect(() => {
    return () => flushOnUnmountRef.current();
  }, []);

  // Resync from the loader whenever it re-runs (router.invalidate() after a
  // gallery upload/delete or a publish) -- otherwise this local copy stays
  // frozen at first render. Skipped entirely while any media save is queued
  // or running: the loader's snapshot is then older than what's here. A
  // slide the member is mid-way through re-cropping (debounce timer
  // pending, or its save request still in flight) keeps its local crop.
  useEffect(() => {
    if (hasPendingDraftSaves(memberId, "media")) return;
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
    updateSlides(() => next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on new loader data only
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
   * if the save throws (ownership-check failure, an RLS
   * denial, a unique-slot race, ...) that became an unhandled promise
   * rejection with the <select> left showing the just-picked photo while
   * nothing was actually saved and no error was ever shown. The slide is
   * put in place straight away (so any save from now on includes it) and
   * taken back out -- restoring whatever was in the slot -- if its save
   * fails.
   */
  async function onAssign(slot: number, asset: MediaAssetRow) {
    setSlotError(slot, undefined);
    // A centered portrait crop from the photo's stored size.
    const crop =
      asset.width && asset.height
        ? initialCropForAspect(asset.width, asset.height, CAROUSEL_ASPECT)
        : { x: 0, y: 0, w: 1, h: 1 };
    const slide: CarouselSlideRow = {
      id: slideKey({ sort_order: slot, asset_id: asset.id }),
      asset_id: asset.id,
      crop,
      outbound_url: null,
      sort_order: slot,
    };
    const previous = slidesRef.current.find((s) => s.sort_order === slot);
    savedCropRef.current[slide.id] = crop;
    latestCropRef.current[slide.id] = crop;
    updateSlides((prev) => [...prev.filter((s) => s.sort_order !== slot), slide]);
    setSelectedSlot(slot);
    try {
      await saveSlides();
    } catch (error) {
      updateSlides((prev) => {
        if (!prev.some((s) => s.id === slide.id)) return prev;
        const without = prev.filter((s) => s.id !== slide.id);
        return previous ? [...without, previous] : without;
      });
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
    updateSlides((prev) => prev.filter((s) => s.id !== slide.id));
    setSlotError(slide.sort_order, undefined);

    const timer = cropDebounceTimers.current[slide.id];
    if (timer) {
      clearTimeout(timer);
      delete cropDebounceTimers.current[slide.id];
    }

    try {
      await saveSlides();
      delete savedCropRef.current[slide.id];
      delete latestCropRef.current[slide.id];
    } catch (error) {
      updateSlides((prev) => (prev.some((s) => s.id === slide.id) ? prev : [...prev, slide]));
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
    // The slide list already carries this crop (onCropChange updates it
    // synchronously), so the save just sends the list as it stands.
    saveSlides()
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
          updateSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, crop: rollback } : s)));
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

  flushOnUnmountRef.current = () => {
    for (const slideId of Object.keys(cropDebounceTimers.current)) {
      const slot = slidesRef.current.find((s) => s.id === slideId)?.sort_order ?? 0;
      flushCropSave(slideId, slot);
    }
  };

  function onCropChange(slide: CarouselSlideRow, crop: CarouselSlideRow["crop"]) {
    // Written SYNCHRONOUSLY, before anything else below -- this is what
    // makes latestCropRef always current regardless of React's render
    // timing. See its doc comment above.
    latestCropRef.current[slide.id] = crop;

    // Local/visual update is instant on every call -- dragging must stay
    // responsive regardless of the network debounce below.
    updateSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, crop } : s)));

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
      if (outboundUrl !== null) {
        const check = validateLinkUrl(outboundUrl);
        if (!check.valid) throw new Error(check.reason);
      }
    } catch (error) {
      setSlotError(slide.sort_order, friendlyMessage(error, "Couldn't save this link — try again."));
      return;
    }
    const current = slidesRef.current.find((s) => s.id === slide.id);
    if (!current || current.outbound_url === outboundUrl) return;
    const previousUrl = current.outbound_url;
    // Applied straight away, rolled back (on this slide, this field) if the save fails.
    updateSlides((prev) =>
      prev.map((s) => (s.id === slide.id ? { ...s, outbound_url: outboundUrl } : s)),
    );
    try {
      await saveSlides();
    } catch (error) {
      updateSlides((prev) =>
        prev.map((s) => (s.id === slide.id ? { ...s, outbound_url: previousUrl } : s)),
      );
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
                        /api/admin-media instead checks OWNERSHIP
                        (canViewAdminMedia), which is the right rule here.
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

        {/* Tap-through link for the selected slide, under its crop controls
            (owner's request, 2026-09-26). */}
        {selected && (
        <div className="mt-2 flex w-full max-w-[300px] flex-col gap-2 rounded-[13px] border border-canvas-border px-4 py-4">

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
      </div>
    </section>
  );
}

