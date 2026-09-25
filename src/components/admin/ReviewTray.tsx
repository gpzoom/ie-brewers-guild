import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { approvePendingMedia, rejectPendingMedia } from "@/lib/media/review-tray.server";
import type { MediaAssetRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

/**
 * Re-inserts a single asset back into whatever the CURRENT pending list
 * is, rather than restoring a whole-array snapshot taken before the
 * approve/reject started. A snapshot would resurrect any OTHER asset
 * that was approved/rejected (and succeeded) while this one's request
 * was still in flight -- e.g. approve photo A, then reject photo B
 * before A's request returns; B succeeds, A then fails -- restoring a
 * stale "previousPending" array would incorrectly bring B back too.
 * Same stale-whole-array-snapshot bug already found and fixed twice
 * before (CarouselEditor.tsx's crop-autosave, commit 0bd8398;
 * CreatorLinkPanel.tsx's onRevoke, commit 77852df).
 */
function reinsertAsset(prev: MediaAssetRow[], asset: MediaAssetRow): MediaAssetRow[] {
  if (prev.some((a) => a.id === asset.id)) return prev;
  return [...prev, asset].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}

export function ReviewTray({ initialPending }: { initialPending: MediaAssetRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);
  const [error, setError] = useState<string | null>(null);
  // Ids an approve/reject has been started for. The loader resync below
  // drops them, so a refresh that started before the action landed can't
  // bring the photo back mid-action (same idea as MediaGallery's
  // hiddenIds). Only a FAILED action removes its id again; a successful
  // one stays hidden, since the server no longer lists it as pending.
  const actedOnIds = useRef<Set<string>>(new Set());

  // Resync when the loader re-runs (see the invalidate below and
  // MediaGallery's upload/delete).
  useEffect(() => {
    setPending(initialPending.filter((a) => !actedOnIds.current.has(a.id)));
  }, [initialPending]);

  async function onApprove(asset: MediaAssetRow) {
    setError(null);
    actedOnIds.current.add(asset.id);
    setPending((prev) => prev.filter((a) => a.id !== asset.id));
    try {
      await approvePendingMedia({ data: { id: asset.id } });
      // An approved photo joins the gallery -- re-run the loader so the
      // gallery and every photo picker on the page include it.
      void router.invalidate();
    } catch (err) {
      // Roll back the optimistic removal above -- otherwise a failed
      // approve (including an RLS-denied one that throws via
      // approvePendingMedia's row-count check) would leave this photo
      // silently vanished from the tray with no visible error and no way
      // to know the approve didn't actually happen server-side.
      actedOnIds.current.delete(asset.id);
      setPending((prev) => reinsertAsset(prev, asset));
      setError(err instanceof Error ? err.message : "Couldn't approve this photo — try again.");
    }
  }

  async function onReject(asset: MediaAssetRow) {
    setError(null);
    actedOnIds.current.add(asset.id);
    setPending((prev) => prev.filter((a) => a.id !== asset.id));
    try {
      await rejectPendingMedia({ data: { id: asset.id } });
    } catch (err) {
      // Same rollback rationale as onApprove above.
      actedOnIds.current.delete(asset.id);
      setPending((prev) => reinsertAsset(prev, asset));
      setError(err instanceof Error ? err.message : "Couldn't reject this photo — try again.");
    }
  }

  if (pending.length === 0) return null;

  return (
    <section aria-label="Pending review">
      <h2 className="text-lg font-medium text-foreground">Waiting for your review ({pending.length})</h2>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {pending.map((asset) => (
          <li key={asset.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            {/* Served through /api/admin-media, NOT /api/member-media -- that
                other route only serves an asset once it's `review_status:
                'approved'` AND assigned to a published member's logo/cover/
                carousel slot, which a PENDING asset (by definition, not yet
                approved) never is -- it would 404 for every single item in
                this tray. /api/admin-media instead checks OWNERSHIP (does
                this asset belong to the signed-in member), which is the
                right rule here. See src/routes/api.admin-media.$assetId.ts. */}
            <img
              src={`/api/admin-media/${asset.id}`}
              alt=""
              className="h-16 w-16 rounded-md object-cover"
            />
            <div className="flex-1 text-sm">
              <p>From {asset.creator_name ?? "someone with your upload link"}</p>
              <p className="text-xs text-muted-foreground">{asset.creator_credit ? "Wants credit on the profile" : "No credit requested"}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" size="sm" className="h-9" onClick={() => onApprove(asset)}>
                Approve
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => onReject(asset)}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
