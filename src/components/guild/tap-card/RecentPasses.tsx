import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { movePassToCard, type PassListRow } from "@/lib/tap-card/trail-pass-admin.server";
import { StatusMessage, cardClass, errorText, fieldClass, outlineButtonClass, type Message } from "@/components/guild/settings-ui";
import { money } from "@/components/guild/tap-card/PassesPanel";

/** Guild > Tap Card > Passes: the latest passes, and Move to another card for one that landed on the wrong card. */
export function RecentPasses({ passes }: { passes: PassListRow[] }) {
  const router = useRouter();
  const [moving, setMoving] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function onMove(passId: string) {
    setMessage(null);
    try {
      const result = await movePassToCard({ data: { passId, email } });
      setMessage({ kind: "ok", text: result.removedOldCard ? "Moved. The empty card it was on was removed." : "Moved." });
      setMoving(null);
      setEmail("");
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <section className={cardClass}>
      <h2 className="font-display text-[16px] font-bold text-ink">Recent passes</h2>
      <p className="text-[13px] text-ink-muted">
        If someone paid with a different email than their Tap Card&rsquo;s, their pass landed on a new card. Move it to the card they
        already have.
      </p>
      {passes.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No passes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {passes.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 border-t border-[#EFEAE1] pt-3 text-[13px] text-ink">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {p.holderName} ({p.holderEmail}) · {new Date(p.paidAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })} ·{" "}
                  {money(p.amountCents)} · {p.memberName ?? "no brewery"}
                  {p.refunded && " · refunded"}
                </span>
                {moving !== p.id && (
                  <button
                    type="button"
                    className={`${outlineButtonClass} w-fit`}
                    onClick={() => {
                      setMoving(p.id);
                      setEmail("");
                    }}
                  >
                    Move to another card
                  </button>
                )}
              </div>
              {moving === p.id && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex flex-col gap-1.5 font-medium">
                    Email of the right Tap Card
                    <input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <button type="button" className={outlineButtonClass} disabled={!email.trim()} onClick={() => onMove(p.id)}>
                    Move
                  </button>
                  <button type="button" className={outlineButtonClass} onClick={() => setMoving(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <StatusMessage message={message} />
    </section>
  );
}
