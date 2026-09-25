import { useEffect, useRef, useState } from "react";
import { CropEditor } from "@/components/admin/CropEditor";
import { hasPendingDraftSaves, useSaveDraftSection } from "@/components/admin/DraftStatusContext";
import { COVER_ASPECT, DESKTOP_COVER_ASPECT, initialCropForAspect } from "@/lib/media/crop-interaction";
import type { CropRect } from "@/lib/media/crop";
import type { MediaAssetRow } from "@/lib/supabase/types";

// Placeholder crop when none is stored; CropEditor corrects it to the
// frame's real aspect as soon as the image's natural size is known.
const FULL_IMAGE_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

// Same ~400ms debounce as CarouselEditor's own crop autosave (see that
// file's CROP_SAVE_DEBOUNCE_MS doc comment for the full rationale --
// CropEditor's onPointerMove fires onChange on every pointer-move
// sample, so a single drag gesture would otherwise turn into dozens of
// immediate, unawaited POSTs, and under out-of-order network delivery an
// older crop landing after a newer one would visibly "undo" part of the
// member's own edit). The local/visual crop below still updates
// instantly on every onChange; only the network write is debounced, and
// it's flushed immediately on pointer-up/pointer-cancel so the final
// dragged position is always what gets persisted.
const CROP_SAVE_DEBOUNCE_MS = 400;

/**
 * "Theme color fills the band" is the empty state everywhere a member has
 * no cover photo set (spec, "Profile hero and theme").
 *
 * Phase 2: the cover photo and its crop are part of the member's DRAFT
 * (`basics`: cover_asset_id, cover_crop) and go live when published. The
 * database checks the photo is in this member's gallery.
 */
export function CoverEditor({
  memberId,
  coverAssetId,
  coverCrop,
  galleryAssets,
}: {
  memberId: string;
  coverAssetId: string | null;
  coverCrop: CropRect | null;
  galleryAssets: MediaAssetRow[];
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const [assetId, setAssetId] = useState(coverAssetId);
  const [crop, setCrop] = useState<CropRect>(coverCrop ?? FULL_IMAGE_CROP);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // Last known PERSISTED crop. A failed debounced crop save rolls the
  // visual crop back to this rather than leaving it showing a position
  // the server never actually saved -- same reasoning as
  // CarouselEditor.tsx's savedCropRef / MediaGallery.tsx's reinsertAsset.
  const savedCropRef = useRef<CropRect>(coverCrop ?? FULL_IMAGE_CROP);
  // The crop a debounced/flushed save should actually send. Deliberately
  // NOT read off `crop` state or captured in a closure at
  // setTimeout-schedule time -- see CarouselEditor.tsx's latestCropRef
  // doc comment for the full stale-closure race this avoids (a member
  // panning/zooming, then holding the pointer down motionless for the
  // full debounce window without releasing, could otherwise cause the
  // timer to send a crop from one render-tick before the hold, not the
  // position actually being held). Written SYNCHRONOUSLY inside
  // onCropChange, on every call, before the timer is (re)armed -- so
  // whatever the timer callback or the pointerup/pointercancel flush
  // reads at FIRE time is always the latest actual crop, with no render
  // lag and no closure to go stale. Only one cover crop exists (no
  // per-slide keying needed, unlike CarouselEditor's Record<string, ...>).
  const latestCropRef = useRef<CropRect>(coverCrop ?? FULL_IMAGE_CROP);
  const cropDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Crop save requests currently on the wire. Used both to skip a loader
  // resync that could carry the pre-save crop (see below) and to let
  // onChooseAsset wait for them, so an old photo's crop can't land after
  // the new cover is chosen and be applied to it.
  const cropSavesInFlight = useRef<Set<Promise<void>>>(new Set());

  // Resync from the loader whenever it re-runs (router.invalidate() after a
  // gallery upload/delete, a publish, or this editor's own choose/remove) --
  // otherwise this local copy stays frozen at first render. A crop the
  // member is mid-way through editing (debounce timer pending, or its save
  // request still in flight) is kept -- a refresh that started before that
  // save landed would otherwise snap the photo back to the old position.
  // Both skip while a basics save is queued or running: the loader's
  // snapshot is then older than what this editor holds.
  useEffect(() => {
    if (hasPendingDraftSaves(memberId, "basics")) return;
    setAssetId(coverAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on new loader data only
  }, [coverAssetId]);
  useEffect(() => {
    if (hasPendingDraftSaves(memberId, "basics")) return;
    if (cropDebounceTimer.current || cropSavesInFlight.current.size > 0) return;
    const next = coverCrop ?? FULL_IMAGE_CROP;
    savedCropRef.current = next;
    latestCropRef.current = next;
    setCrop(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on new loader data only
  }, [coverCrop]);
  // Lets a failed choose reset the <select>'s own DOM value back to ""
  // -- see onChooseAsset's catch block for why: it's an uncontrolled
  // element, so resetting React state alone wouldn't touch what the
  // browser is actually showing, and a browser <select> never fires
  // `change` for re-picking the option that's already selected. Same
  // shape as CarouselEditor.tsx's selectRefs.
  const selectRef = useRef<HTMLSelectElement | null>(null);

  // On unmount (leaving the page or a wizard step mid-drag), a crop still
  // waiting out its debounce is SENT, not dropped. Through a ref so the
  // cleanup calls this render's flushCropSave (it reads only refs anyway).
  const flushOnUnmountRef = useRef<() => void>(() => {});
  useEffect(() => {
    return () => flushOnUnmountRef.current();
  }, []);

  function friendlyMessage(err: unknown, fallback: string) {
    return err instanceof Error ? err.message : fallback;
  }

  /**
   * Awaits the save and shows a real error on failure instead of the
   * brief's given fire-and-forget shape -- if the save throws
   * (ownership-check failure, an RLS denial, ...) that would otherwise be
   * an unhandled promise rejection with the <select> left showing the
   * just-picked photo while nothing was actually saved and no error ever
   * shown. There's no optimistic asset/crop to roll back here (state is
   * only set AFTER a successful response), so this just needs the
   * try/catch to surface a message and reset the uncontrolled <select>.
   * Same shape as CarouselEditor.tsx's onAssign.
   */
  async function onChooseAsset(asset: MediaAssetRow) {
    setError(undefined);
    cancelPendingCropSave();
    setBusy(true);
    try {
      // A crop save already on the wire targets the OLD photo; let it land
      // (or fail and roll back) before the new cover and its crop are set.
      // (Saves for the section are also queued in order.)
      // saveCropNow's promises never reject, so this can't throw.
      await Promise.all([...cropSavesInFlight.current]);
      // A centered crop at the band's shape, from the photo's stored size.
      const initialCrop: CropRect =
        asset.width && asset.height
          ? initialCropForAspect(asset.width, asset.height, COVER_ASPECT)
          : FULL_IMAGE_CROP;
      await saveDraft("basics", { cover_asset_id: asset.id, cover_crop: initialCrop });
      savedCropRef.current = initialCrop;
      latestCropRef.current = initialCrop;
      setAssetId(asset.id);
      setCrop(initialCrop);
    } catch (err) {
      if (selectRef.current) selectRef.current.value = "";
      setError(friendlyMessage(err, "Couldn't set this cover photo — try again."));
    } finally {
      setBusy(false);
    }
  }

  /** Back to the theme-color band -- same shape as SocialImageEditor's onRemove. */
  async function onRemove() {
    setError(undefined);
    cancelPendingCropSave();
    setBusy(true);
    try {
      // Same as onChooseAsset: don't let an in-flight crop save land after the clear.
      await Promise.all([...cropSavesInFlight.current]);
      await saveDraft("basics", { cover_asset_id: null, cover_crop: null });
      setAssetId(null);
      savedCropRef.current = FULL_IMAGE_CROP;
      latestCropRef.current = FULL_IMAGE_CROP;
      setCrop(FULL_IMAGE_CROP);
      if (selectRef.current) selectRef.current.value = "";
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't remove the cover photo — try again."));
    } finally {
      setBusy(false);
    }
  }

  /** Drops a queued crop save -- it would otherwise land after a choose/remove and overwrite its crop. */
  function cancelPendingCropSave() {
    if (cropDebounceTimer.current) {
      clearTimeout(cropDebounceTimer.current);
      cropDebounceTimer.current = null;
    }
  }

  /**
   * Sends whatever crop is CURRENTLY in `latestCropRef` -- read at CALL
   * time, not captured in a closure at schedule time. See latestCropRef's
   * own doc comment above for why that distinction matters.
   */
  function saveCropNow() {
    const cropToSave = latestCropRef.current;
    const request: Promise<void> = saveDraft("basics", { cover_crop: cropToSave })
      .then(() => {
        savedCropRef.current = cropToSave;
        setError(undefined);
      })
      .catch((err: unknown) => {
        const rollback = savedCropRef.current;
        // Keep the ref in sync with what's now actually displayed --
        // otherwise a later flush (e.g. a stray pointerup) would read
        // this ref and re-send the crop that just failed instead of the
        // rolled-back one the member is now looking at.
        latestCropRef.current = rollback;
        setCrop(rollback);
        setError(friendlyMessage(err, "Couldn't save this crop — try again."));
      })
      .finally(() => {
        cropSavesInFlight.current.delete(request);
      });
    cropSavesInFlight.current.add(request);
  }

  /**
   * If a debounced crop save is pending, cancels it and sends the current
   * crop immediately. A no-op when nothing is pending -- a plain tap on the
   * frame (or on the zoom/Reset buttons, whose pointerup bubbles here
   * before their click) changed nothing and shouldn't write.
   */
  function flushCropSave() {
    if (!cropDebounceTimer.current) return;
    clearTimeout(cropDebounceTimer.current);
    cropDebounceTimer.current = null;
    saveCropNow();
  }

  flushOnUnmountRef.current = flushCropSave;

  function onCropChange(next: CropRect) {
    // Written SYNCHRONOUSLY, before anything else below -- this is what
    // makes latestCropRef always current regardless of React's render
    // timing. See its doc comment above.
    latestCropRef.current = next;

    // Local/visual update is instant on every call -- dragging must stay
    // responsive regardless of the network debounce below.
    setCrop(next);

    if (cropDebounceTimer.current) clearTimeout(cropDebounceTimer.current);
    cropDebounceTimer.current = setTimeout(() => {
      cropDebounceTimer.current = null;
      saveCropNow();
    }, CROP_SAVE_DEBOUNCE_MS);
  }

  const asset = galleryAssets.find((a) => a.id === assetId);

  return (
    <section aria-labelledby="cover-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h2
            id="cover-heading"
            className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted"
          >
            Cover photo
          </h2>
          <span className="text-[10px] text-[#A89D8E]">Wide band · 5:2</span>
        </div>
        <p className="text-[12px] leading-[1.5] text-ink-muted">
          The wide band across the top of your profile. No cover photo? Your theme color fills the
          band instead.
        </p>
      </div>
      <div className="flex w-full max-w-[560px] flex-col gap-3">
        {asset ? (
          // Served through /api/admin-media, NOT /api/member-media -- that
          // other route only serves an asset once it's already referenced
          // by a PUBLISHED member's own logo/cover/carousel slide, which
          // this member's own admin panel can't rely on while they're
          // still choosing/editing their cover (and possibly still
          // draft/pending themselves). /api/admin-media instead checks
          // OWNERSHIP (canViewAdminMedia), which is the right rule
          // here. See src/routes/api.admin-media.$assetId.ts and
          // CarouselEditor.tsx's identical choice.
          //
          // onPointerUp/onPointerCancel here catch the same pointer events
          // CropEditor's own internal handlers respond to (it doesn't stop
          // their propagation) -- this is how the debounced crop save gets
          // flushed the moment a drag ends, without CropEditor itself
          // needing to know anything about debouncing.
          <div onPointerUp={flushCropSave} onPointerCancel={flushCropSave}>
            <CropEditor
              imageUrl={`/api/admin-media/${asset.id}`}
              crop={crop}
              aspect={COVER_ASPECT}
              aspectClassName="aspect-[5/2]"
              onChange={onCropChange}
              wideGuideAspect={DESKTOP_COVER_ASPECT}
            />
          </div>
        ) : (
          <div className="flex aspect-[5/2] w-full items-center justify-center rounded-[13px] border-2 border-dashed border-[#D3CBBD] p-4 text-center text-[12px] text-ink-muted">
            No cover photo set — your theme color fills the band.
          </div>
        )}
        <label htmlFor="cover-choose" className="text-[12px] font-medium text-ink">
          {asset ? "Use a different photo" : "Choose a cover photo"}
        </label>
        <select
          id="cover-choose"
          ref={selectRef}
          className="h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-[13px] text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          defaultValue=""
          disabled={busy}
          onChange={(e) => {
            const chosen = galleryAssets.find((a) => a.id === e.target.value);
            if (chosen) void onChooseAsset(chosen);
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
        {assetId && (
          <button
            type="button"
            className="inline-flex h-11 items-center self-start text-[13px] font-medium text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
            disabled={busy}
            onClick={() => void onRemove()}
          >
            Remove cover — use your theme color instead
          </button>
        )}
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
