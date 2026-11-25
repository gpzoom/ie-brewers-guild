import type { BarState } from "@/lib/tap-card/bar-core";
import type { BarReward, OfferSlot } from "@/lib/tap-card/loyalty";
import type { PlateChoice } from "@/lib/tap-card/plate.server";
import { labelClass } from "@/components/public-forms/PublicFormParts";
import { useByDate } from "@/components/tap-card/CheckInScreen";

export function rewardLine(r: BarReward): string {
  if (r.kind === "trail") return `Use my Beer Trail offer: ${r.reward}`;
  if (r.kind === "earn") return `Use my reward: ${r.reward} (earned with this visit)`;
  return `Use my reward: ${r.reward} (use by ${useByDate(r.expiresAt)})`;
}

export const keyOf = (r: BarReward) => (r.kind === "trail" ? "trail" : r.kind === "earn" ? `earn:${r.slot}` : r.id);

export const choiceOf = (key: string): PlateChoice =>
  key === "none"
    ? { kind: "none" }
    : key === "trail"
      ? { kind: "trail" }
      : key.startsWith("earn:")
        ? { kind: "earn", slot: key.slice(5) as OfferSlot }
        : { kind: "member", id: key };

/** Rewards the customer can use on this visit; none once one was used today. */
export function waitingRewards(state: BarState): BarReward[] {
  return state.used ? [] : [state.featured, ...state.others].filter((r): r is BarReward => r !== null);
}

export function RewardChoices({ waiting, choice, onChange }: { waiting: BarReward[]; choice: string; onChange: (key: string) => void }) {
  if (waiting.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${labelClass} mb-1`}>Choose one:</legend>
      {[...waiting.map((r) => ({ key: keyOf(r), label: rewardLine(r) })), { key: "none", label: "Just check in" }].map((o) => (
        <label key={o.key} className="flex min-h-11 items-center gap-3 rounded-xl border border-canvas-border bg-white px-4 py-2 text-[15px] text-ink">
          <input type="radio" name="choice" value={o.key} checked={choice === o.key} onChange={() => onChange(o.key)} className="size-5" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
