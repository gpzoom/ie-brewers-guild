import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { deleteMemberMedia, uploadMemberMedia } from "@/lib/media/media-gallery.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * The plain gallery of originals (spec, "Media model": "Each member has a
 * media gallery holding original files"). Carousel-slot assignment,
 * cover-crop, logo upload, creator-upload links, and the pending-review
 * tray are each a separate section rendered alongside this one on
 * /admin/media (Tasks 15–21) -- kept in separate components/files per
 * section, all sharing this page.
 *
 * Renders straight from the route loader's `assets` (no local copy): the
 * carousel/cover/social-image pickers on the same page read that same
 * list, so after every upload/delete this calls router.invalidate() to
 * re-run the loader and refresh ALL of them at once. A local copy here
 * used to leave those dropdowns stale -- offering a just-deleted photo
 * (which then failed with "That photo isn't in this member's gallery.")
 * and missing a just-uploaded one.
 */

type UploadState = { status: "idle" | "uploading" | "error"; message?: string };
const IDLE_UPLOAD: UploadState = { status: "idle" };

export function MediaGallery({
  memberId,
  assets,
  slides,
}: {
  memberId: string;
  assets: MediaAssetRow[];
  /** Used only to warn when a photo about to be deleted is in the carousel. */
  slides: CarouselSlideRow[];
}) {
  const router = useRouter();
  const [uploadState, setUploadState] = useState<UploadState>(IDLE_UPLOAD);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Optimistic delete: ids hidden from view while their delete (and the
  // follow-up loader refresh) is in flight. A failed delete just un-hides
  // its own id -- unlike restoring a whole pre-delete snapshot, this can
  // never resurrect a DIFFERENT photo whose delete succeeded meanwhile.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [confirmAsset, setConfirmAsset] = useState<MediaAssetRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function unhide(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadState({ status: "uploading" });
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("file", file);
    // Fallback only -- the server reads the size from the stored bytes
    // first (see image-dimensions.ts).
    await appendMeasuredDimensions(formData, file);

    try {
      await uploadMemberMedia({ data: formData });
    } catch (error) {
      // validateUploadedImage's rejection reason and stripImageMetadata's
      // caught-and-reworded failure (media-gallery.server.ts) both throw a
      // clean, user-readable Error -- this is what actually surfaces it,
      // rather than leaving an unhandled rejection with no UI feedback for
      // a real, expected case (a member uploading a HEIC/WebP/Live Photo).
      setUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Couldn't upload this photo — try again.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    // Keep showing "Uploading…" until the refreshed list (and every
    // picker on the page) actually includes the new photo.
    try {
      await router.invalidate();
    } finally {
      setUploadState(IDLE_UPLOAD);
    }
  }

  async function onDelete(asset: MediaAssetRow) {
    setHiddenIds((prev) => new Set(prev).add(asset.id));
    setDeleteError(null);

    try {
      const result = await deleteMemberMedia({ data: { id: asset.id } });
      // The DB row is genuinely gone at this point regardless of
      // `fileRemoved` -- do NOT restore the tile for a partial-cleanup
      // failure, only acknowledge it with a non-blocking notice.
      if (!result.fileRemoved) {
        setDeleteError(
          "The photo was removed, but we couldn't fully clean up the file — no action needed.",
        );
      }
    } catch (error) {
      // A real failure (the delete itself didn't go through) -- bring just
      // this photo back.
      unhide(asset.id);
      setDeleteError(
        error instanceof Error ? error.message : "Couldn't delete this photo — try again.",
      );
      return;
    }

    try {
      await router.invalidate();
    } finally {
      // The refreshed `assets` no longer contains it, so un-hiding is a
      // no-op visually and just keeps the set from growing.
      unhide(asset.id);
    }
  }

  const confirmInCarousel = confirmAsset
    ? slides.some((slide) => slide.asset_id === confirmAsset.id)
    : false;

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Gallery</h2>
      <div className="mt-3">
        <label htmlFor="gallery-upload" className="sr-only">
          Upload a photo
        </label>
        <input
          ref={fileInputRef}
          id="gallery-upload"
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={onFileSelected}
          disabled={uploadState.status === "uploading"}
        />
        <Button
          type="button"
          className="h-11"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState.status === "uploading"}
        >
          {uploadState.status === "uploading" ? "Uploading…" : "Upload a photo"}
        </Button>
        {uploadState.status === "error" && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {uploadState.message}
          </p>
        )}
      </div>
      {deleteError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {deleteError}
        </p>
      )}
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {assets
          .filter((asset) => asset.review_status === "approved" && !hiddenIds.has(asset.id))
          .map((asset) => (
            <li
              key={asset.id}
              className="relative aspect-square overflow-hidden rounded-md bg-canvas-2"
            >
              {/* Served through /api/admin-media, NOT /api/member-media -- that other
                  route only serves an asset once it's approved AND assigned to a
                  published member's logo/cover/carousel slot, which a freshly
                  uploaded, unassigned gallery photo never is. /api/admin-media
                  instead checks OWNERSHIP (does this asset belong to the
                  signed-in member), which is the right rule for the member's own
                  admin panel. See src/routes/api.admin-media.$assetId.ts. */}
              <img
                src={`/api/admin-media/${asset.id}`}
                alt=""
                className="h-full w-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute right-1 top-1 h-9"
                aria-label="Delete this photo"
                onClick={() => setConfirmAsset(asset)}
              >
                Delete
              </Button>
            </li>
          ))}
      </ul>

      <AlertDialog
        open={confirmAsset !== null}
        onOpenChange={(open) => !open && setConfirmAsset(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmInCarousel && (
                <>
                  <strong className="font-semibold text-foreground">
                    This photo is in your carousel and will be removed from it.
                  </strong>{" "}
                </>
              )}
              It will be removed from your gallery for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="h-11 text-white"
              onClick={() => {
                const asset = confirmAsset;
                setConfirmAsset(null);
                if (asset) void onDelete(asset);
              }}
            >
              Delete photo
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
