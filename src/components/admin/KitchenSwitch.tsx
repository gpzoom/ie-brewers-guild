import { useState } from "react";
import { setMemberHasKitchen } from "@/lib/events/calendar-connection.server";

/**
 * "We have our own kitchen" (owner, 2026-10-02; artboard W06): on, an open
 * day with nothing tagged #food reads "Kitchen open" on the profile instead
 * of "Bring your own food". Saves straight away (not drafted); on failure it
 * flips back and says why. `onChanged` lets the page reload its 7-day preview.
 */
export function KitchenSwitch({
  memberId,
  initialHasKitchen,
  onChanged,
}: {
  memberId: string;
  initialHasKitchen: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [on, setOn] = useState(initialHasKitchen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      await setMemberHasKitchen({ data: { memberId, hasKitchen: next } });
      await onChanged();
    } catch (err) {
      setOn(!next);
      setError(err instanceof Error ? err.message : "Couldn't save this — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="kitchen-switch-label"
        aria-describedby="kitchen-switch-hint"
        disabled={busy}
        onClick={() => void toggle()}
        className="flex w-full items-start gap-3.5 rounded-[12px] border border-canvas-border bg-white px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-70"
      >
        <span
          aria-hidden="true"
          className={`relative mt-px h-6 w-[42px] shrink-0 rounded-full transition-colors ${on ? "bg-ink" : "bg-canvas-border"}`}
        >
          <span
            className={`absolute top-[3px] size-[18px] rounded-full bg-white transition-[left] ${on ? "left-[21px]" : "left-[3px]"}`}
          />
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span id="kitchen-switch-label" className="text-[14px] font-semibold text-ink">
            We have our own kitchen
          </span>
          <span id="kitchen-switch-hint" className="text-[12px] leading-[1.45] text-ink-muted">
            On an open day with nothing tagged #food, your profile says "Kitchen open" instead of
            "Bring your own food".
          </span>
        </span>
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
