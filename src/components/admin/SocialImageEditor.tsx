import { useEffect, useRef, useState } from "react";
import { hasPendingDraftSaves, useSaveDraftSection } from "@/components/admin/DraftStatusContext";
import { getOgPlaceholderPath } from "@/lib/media/og-placeholder";
import type { MediaAssetRow, MemberType } from "@/lib/supabase/types";

/**
 * "Social Sharing Image" is this feature's public name throughout the
 * admin UI -- members don't know what OpenGraph is, and the term never
 * appears here (this plan's own design notes).
 *
 * Phase 2 (plan Decision 3): it's part of the member's DRAFT
 * (`basics.og_image_asset_id`, owners and full editors only) and goes
 * live when published.
 */
export function SocialImageEditor({
  memberId,
  memberType,
  ogImageAssetId,
  galleryAssets,
}: {
  memberId: string;
  memberType: MemberType;
  ogImageAssetId: string | null;
  galleryAssets: MediaAssetRow[];
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const [assetId, setAssetId] = useState(ogImageAssetId);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Lets a failed choose reset the <select>'s own DOM value back to "" --
  // same reasoning as CoverEditor.tsx's selectRef.
  const selectRef = useRef<HTMLSelectElement | null>(null);

  // Resync from the loader when it re-runs (a publish, discard, or this
  // editor's own choose/remove).
  useEffect(() => {
    // Skipped while a basics save is queued or running: the loader's
    // snapshot is then older than what this editor holds.
    if (hasPendingDraftSaves(memberId, "basics")) return;
    setAssetId(ogImageAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on new loader data only
  }, [ogImageAssetId]);

  function friendlyMessage(err: unknown, fallback: string) {
    return err instanceof Error ? err.message : fallback;
  }

  async function onChooseAsset(asset: MediaAssetRow) {
    setError(undefined);
    setBusy(true);
    try {
      await saveDraft("basics", { og_image_asset_id: asset.id });
      setAssetId(asset.id);
    } catch (err) {
      if (selectRef.current) selectRef.current.value = "";
      setError(friendlyMessage(err, "Couldn't set this image — try again."));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setError(undefined);
    setBusy(true);
    try {
      await saveDraft("basics", { og_image_asset_id: null });
      setAssetId(null);
      if (selectRef.current) selectRef.current.value = "";
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't remove this image — try again."));
    } finally {
      setBusy(false);
    }
  }

  const asset = galleryAssets.find((a) => a.id === assetId);
  const previewUrl = asset ? `/api/admin-media/${asset.id}` : getOgPlaceholderPath(memberType);

  return (
    <section aria-labelledby="social-image-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id="social-image-heading"
          className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted"
        >
          Social sharing image
        </h2>
        <p className="max-w-[640px] text-[12px] leading-[1.5] text-ink-muted">
          The image people see when your profile link is shared on Facebook, Slack, iMessage, and
          similar apps. Works best around 1200×630px. If you don't set one, we show a default Guild
          graphic instead.
        </p>
      </div>
      <div className="flex w-full max-w-[560px] flex-col gap-3">
        <img
          src={previewUrl}
          alt=""
          className="aspect-[40/21] w-full rounded-[13px] border border-canvas-border bg-canvas-2 object-cover"
        />
        <label htmlFor="social-image-choose" className="text-[12px] font-medium text-ink">
          {asset ? "Use a different image" : "Choose a sharing image"}
        </label>
        <select
          id="social-image-choose"
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
        {asset && (
          <button
            type="button"
            className="inline-flex h-11 items-center self-start text-[13px] font-medium text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
            disabled={busy}
            onClick={() => void onRemove()}
          >
            Remove — use the default Guild graphic instead
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
