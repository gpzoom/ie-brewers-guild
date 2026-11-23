import { useEffect, useState } from "react";
import { getTrailOptIn, joinTrail } from "@/lib/tap-card/trail-opt-in.server";
import type { TrailOptInStatus } from "@/lib/tap-card/trail-opt-in";

/**
 * Portal/Admin > Scan Pass, top: a taproom puts itself on the Beer Trail
 * (owner, 2026-11-23). Other member types can't be stops, so it's hidden for
 * them. Once on, only the Guild can take the stop off.
 */
export function TrailOptInCard({ memberId, onJoined }: { memberId: string; onJoined: () => void }) {
  const [status, setStatus] = useState<TrailOptInStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setStatus(null);
    setError(null);
    getTrailOptIn({ data: { memberId } })
      .then((s) => current && setStatus(s))
      .catch((err) => current && setError(err instanceof Error ? err.message : "That didn't load. Refresh the page."));
    return () => {
      current = false;
    };
  }, [memberId]);

  async function onCheck() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await joinTrail({ data: { memberId } }));
      onJoined();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!status && !error) return null;
  if (status && !status.producer) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="beer-trail-stop">
      <h2 id="beer-trail-stop" className="font-display text-[18px] font-bold text-ink">
        Beer Trail
      </h2>
      {status && (
        <>
          <label className="flex min-h-11 items-center gap-3 text-[14px] font-medium text-ink">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={status.onTrail || busy}
              disabled={status.onTrail || busy}
              onChange={() => void onCheck()}
            />
            Beer Trail stop
          </label>
          <p className="text-[13px] text-ink-muted" aria-live="polite">
            {busy
              ? "Adding you to the Beer Trail…"
              : !status.onTrail
                ? "Check the box to become a Beer Trail stop. You'll go on the Beer Trail map, and you agree to give Beer Trail Pass holders the Guild's Beer Trail offer. We'll let the Guild know."
                : status.published
                  ? "You're on the Beer Trail and the Beer Trail map. To come off the trail, contact the Guild."
                  : "You're on the Beer Trail. You'll show on the Beer Trail map once your profile is published. To come off the trail, contact the Guild."}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {error}
        </p>
      )}
    </section>
  );
}
