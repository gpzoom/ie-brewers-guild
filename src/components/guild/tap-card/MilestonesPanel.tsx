import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { deleteMilestone, saveMilestone, type MilestoneSummary } from "@/lib/tap-card/milestones.server";
import {
  StatusMessage,
  cardClass,
  darkButtonClass,
  errorText,
  fieldClass,
  outlineButtonClass,
  type Message,
} from "@/components/guild/settings-ui";

/** Guild > Tap Card > Milestones: rewards for visiting a number of different stops in a calendar year. */
export function MilestonesPanel({ milestones }: { milestones: MilestoneSummary[] }) {
  const router = useRouter();
  const [stops, setStops] = useState("5");
  const [reward, setReward] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function run(action: () => Promise<unknown>, ok: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "ok", text: ok });
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    await run(() => saveMilestone({ data: { stopsRequired: Number(stops), rewardText: reward, active: true } }), "Milestone added.");
    setReward("");
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <p className="max-w-[640px] text-[13px] text-ink-muted">
        Card holders earn a milestone by visiting that many different stops in one calendar year. Visits count; beers
        bought don&rsquo;t. Earned rewards show on the Rewards tab for you to hand out.
      </p>
      <div className="overflow-x-auto rounded-[14px] border border-canvas-border bg-white">
        <table className="w-full min-w-[520px] text-left text-[13px] text-ink">
          <thead className="border-b border-[#E6E0D6] bg-[#FCFAF6] text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Stops</th>
              <th className="px-3 py-3 font-semibold">Reward</th>
              <th className="px-3 py-3 font-semibold">Earned</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {milestones.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-ink-muted">
                  No milestones yet.
                </td>
              </tr>
            )}
            {milestones.map((m) => (
              <tr key={m.id} className={`border-b border-[#EFEAE1] last:border-0 ${m.active ? "" : "text-ink-muted"}`}>
                <td className="px-5 py-3 font-medium">{m.stopsRequired}</td>
                <td className="px-3 py-3">
                  {m.rewardText}
                  {!m.active && <span className="ml-2 text-[11px]">(off)</span>}
                </td>
                <td className="px-3 py-3">{m.earnedCount}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={outlineButtonClass}
                      onClick={() =>
                        run(
                          () => saveMilestone({ data: { id: m.id, stopsRequired: m.stopsRequired, rewardText: m.rewardText, active: !m.active } }),
                          m.active ? "Turned off." : "Turned on.",
                        )
                      }
                    >
                      {m.active ? "Turn off" : "Turn on"}
                    </button>
                    {m.earnedCount === 0 && (
                      <button type="button" className={outlineButtonClass} onClick={() => run(() => deleteMilestone({ data: { id: m.id } }), "Deleted.")}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={onAdd} className={cardClass}>
        <h2 className="font-display text-[18px] font-bold text-ink">Add a milestone</h2>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          Different stops visited
          <input className={fieldClass} type="number" min={1} max={100} value={stops} onChange={(e) => setStops(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          Reward
          <input className={fieldClass} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Guild sticker" maxLength={140} required />
        </label>
        <div>
          <button type="submit" className={darkButtonClass}>
            Add milestone
          </button>
        </div>
      </form>
      <StatusMessage message={message} />
    </div>
  );
}
