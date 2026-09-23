import { useRef, useState } from "react";
import { clearSocialImageAsset, updateSocialImageAsset } from "@/lib/media/social-image.server";
import { getOgPlaceholderPath } from "@/lib/media/og-placeholder";
import type { MediaAssetRow, MemberType } from "@/lib/supabase/types";

/**
 * "Social Sharing Image" is this feature's public name throughout the
 * admin UI -- members don't know what OpenGraph is, and the term never
 * appears here (this plan's own design notes).
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
  const [assetId, setAssetId] = useState(ogImageAssetId);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Lets a failed choose reset the <select>'s own DOM value back to "" --
  // same reasoning as CoverEditor.tsx's selectRef.
  const selectRef = useRef<HTMLSelectElement | null>(null);

  function friendlyMessage(err: unknown, fallback: string) {
    return err instanceof Error ? err.message : fallback;
  }

  async function onChooseAsset(asset: MediaAssetRow) {
    setError(undefined);
    setBusy(true);
    try {
      await updateSocialImageAsset({ data: { memberId, assetId: asset.id } });
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
      await clearSocialImageAsset({ data: { memberId } });
      setAssetId(null);
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't remove this image — try again."));
    } finally {
      setBusy(false);
    }
  }

  const asset = galleryAssets.find((a) => a.id === assetId);
  const previewUrl = asset ? `/api/admin-media/${asset.id}` : getOgPlaceholderPath(memberType);

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Social sharing image</h2>
      <p className="text-xs text-muted-foreground">
        The image people see when your profile link is shared on Facebook, Slack, iMessage, and
        similar apps. Works best around 1200×630px. If you don't set one, we show a default Guild
        graphic instead.
      </p>
      <div className="mt-3 max-w-md">
        <img
          src={previewUrl}
          alt=""
          className="aspect-[40/21] w-full rounded-md border border-border object-cover"
        />
        <select
          ref={selectRef}
          className="mt-2 h-11 w-full rounded-md border border-border bg-background text-sm"
          aria-label="Choose a social sharing image"
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
            className="mt-2 h-11 text-sm text-muted-foreground underline"
            disabled={busy}
            onClick={() => void onRemove()}
          >
            Remove — use the default Guild graphic instead
          </button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
