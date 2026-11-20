import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { markRewardHandedOut, type EarnedReward } from "@/lib/tap-card/milestones.server";
import { StatusMessage, errorText, outlineButtonClass, type Message } from "@/components/guild/settings-ui";

/** Guild > Scan Pass > Rewards: who earned a milestone this year, and whether they've received it. */
export function RewardsPanel({
  rewards,
  year,
  show,
  onShowChange,
}: {
  rewards: EarnedReward[];
  year: number;
  show: "waiting" | "all";
  onShowChange: (show: "waiting" | "all") => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);

  async function toggle(r: EarnedReward) {
    setMessage(null);
    try {
      await markRewardHandedOut({ data: { rewardId: r.rewardId, handedOut: !r.handedOutAt } });
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-ink-muted">Rewards earned in {year}. Contact each person to get their reward to them.</p>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" className="size-4" checked={show === "all"} onChange={(e) => onShowChange(e.target.checked ? "all" : "waiting")} />
          Include rewards already handed out
        </label>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-canvas-border bg-white">
        <table className="w-full min-w-[640px] text-left text-[13px] text-ink">
          <thead className="border-b border-[#E6E0D6] bg-[#FCFAF6] text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Pass holder</th>
              <th className="px-3 py-3 font-semibold">Reward</th>
              <th className="px-3 py-3 font-semibold">Earned</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rewards.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-ink-muted">
                  {show === "waiting" ? "No rewards waiting to be handed out." : "No rewards earned yet."}
                </td>
              </tr>
            )}
            {rewards.map((r) => (
              <tr key={r.rewardId} className="border-b border-[#EFEAE1] last:border-0">
                <td className="px-5 py-3">
                  <div className="font-medium">{r.holderName}</div>
                  <a href={`mailto:${r.holderEmail}`} className="text-[12px] text-ink-muted underline-offset-2 hover:underline">
                    {r.holderEmail}
                  </a>
                </td>
                <td className="px-3 py-3">
                  {r.rewardText} <span className="text-ink-muted">({r.stopsRequired} stops)</span>
                </td>
                <td className="px-3 py-3">{new Date(r.earnedAt).toLocaleDateString("en-US")}</td>
                <td className="px-5 py-3 text-right">
                  <button type="button" className={outlineButtonClass} onClick={() => toggle(r)}>
                    {r.handedOutAt ? "Mark not handed out" : "Mark handed out"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StatusMessage message={message} />
    </div>
  );
}
