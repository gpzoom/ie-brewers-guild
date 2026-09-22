import { useRef, useState } from "react";
import { deleteMemberMedia, uploadMemberMedia } from "@/lib/media/media-gallery.server";
import type { MediaAssetRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

/**
 * The plain gallery of originals (spec, "Media model": "Each member has a
 * media gallery holding original files"). Carousel-slot assignment,
 * cover-crop, logo upload, creator-upload links, and the pending-review
 * tray are each a separate section rendered alongside this one on
 * /admin/media (Tasks 15–21) -- kept in separate components/files per
 * section, all sharing this page.
 */

type UploadState = { status: "idle" | "uploading" | "error"; message?: string };
const IDLE_UPLOAD: UploadState = { status: "idle" };

export function MediaGallery({
  memberId,
  initialAssets,
}: {
  memberId: string;
  initialAssets: MediaAssetRow[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [uploadState, setUploadState] = useState<UploadState>(IDLE_UPLOAD);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadState({ status: "uploading" });
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("file", file);

    try {
      const created = await uploadMemberMedia({ data: formData });
      setAssets((prev) => [created, ...prev]);
      setUploadState(IDLE_UPLOAD);
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
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onDelete(asset: MediaAssetRow) {
    const previousAssets = assets;
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setDeleteError(null);

    try {
      await deleteMemberMedia({ data: { id: asset.id, storagePath: asset.storage_path } });
    } catch (error) {
      // Roll the optimistic removal back rather than leaving the asset
      // permanently (and wrongly) hidden while it still exists server-side.
      setAssets(previousAssets);
      setDeleteError(
        error instanceof Error ? error.message : "Couldn't delete this photo — try again.",
      );
    }
  }

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
          .filter((asset) => asset.review_status === "approved")
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
                onClick={() => onDelete(asset)}
              >
                Delete
              </Button>
            </li>
          ))}
      </ul>
    </section>
  );
}
