import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { deleteMemberMedia, uploadMemberMedia } from "@/lib/media/media-gallery.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import type { MediaAssetRow } from "@/lib/supabase/types";
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
 *
 * The gallery isn't drafted: uploads and deletes happen straight away.
 * Deleting a photo that the live page or the draft uses (logo, cover,
 * social sharing image, a slide) is refused on the server with a message
 * saying where it's used (plan Decision 5; src/lib/media/asset-usage.ts),
 * which shows here in place of the delete.
 */

type UploadState = { status: "idle" | "uploading" | "error"; message?: string };
const IDLE_UPLOAD: UploadState = { status: "idle" };

export function MediaGallery({ memberId, assets }: { memberId: string; assets: MediaAssetRow[] }) {
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
  const [dragOver, setDragOver] = useState(false);

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
    await uploadFile(file);
  }

  /** Drop target for the dashed upload box -- same upload path as "Choose a file". */
  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (uploadState.status === "uploading") return;
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  async function uploadFile(file: File) {
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
      // A real failure (the delete itself didn't go through, e.g. the photo
      // is still in use) -- bring just this photo back and say why.
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

  return (
    <section aria-labelledby="gallery-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id="gallery-heading"
          className="font-sans text-[14px] font-bold uppercase tracking-[0.12em] text-ink"
        >
          Your gallery
        </h2>
        <p className="max-w-[640px] text-[12px] leading-[1.5] text-ink-muted">
          Everything you upload lands here first. Pick from it for your slides, your cover and your
          sharing image.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col gap-[11px] rounded-[13px] border-2 border-dashed p-5 transition-colors ${
          dragOver ? "border-brand bg-[#FCF3EA]" : "border-[#D3CBBD]"
        }`}
      >
        <p className="text-[14px] font-semibold text-ink">Drop a photo here</p>
        <p className="text-[12px] leading-[1.5] text-ink-muted">
          JPG or PNG, up to 25 MB. Once it's in your gallery, add it as a slide and choose what
          stays in the portrait frame.
        </p>
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
        <button
          type="button"
          className="inline-flex h-11 items-center self-start rounded-[9px] border border-[#D3CBBD] bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState.status === "uploading"}
        >
          {uploadState.status === "uploading" ? "Uploading…" : "Choose a file"}
        </button>
        {uploadState.status === "error" && (
          <p role="alert" className="text-[12px] text-danger">
            {uploadState.message}
          </p>
        )}
      </div>
      {deleteError && (
        <p role="alert" className="text-[12px] text-danger">
          {deleteError}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-5">
        {assets
          .filter((asset) => asset.review_status === "approved" && !hiddenIds.has(asset.id))
          .map((asset) => (
            <li
              key={asset.id}
              className="relative aspect-square overflow-hidden rounded-[11px] border border-canvas-border bg-canvas-2"
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
              <button
                type="button"
                className="absolute right-1.5 top-1.5 inline-flex h-11 items-center rounded-[9px] border border-[#D3CBBD] bg-[#F9F6F0]/95 px-3 text-[12px] font-medium text-ink transition-colors hover:border-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={`Delete ${asset.original_filename ?? "this photo"}`}
                onClick={() => setConfirmAsset(asset)}
              >
                Delete
              </button>
            </li>
          ))}
      </ul>

      <AlertDialog
        open={confirmAsset !== null}
        onOpenChange={(open) => !open && setConfirmAsset(null)}
      >
        <AlertDialogContent className="rounded-[18px] border-0 bg-canvas p-[30px] sm:rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              Delete this photo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
              It will be removed from your gallery for good. A photo your profile is using (as a
              slide, your cover, logo or sharing image) can't be deleted until you choose a
              different one there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-[46px] rounded-[9px] border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink hover:bg-canvas-2">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="h-[46px] rounded-[9px] px-6 text-[14px] font-semibold text-white"
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
