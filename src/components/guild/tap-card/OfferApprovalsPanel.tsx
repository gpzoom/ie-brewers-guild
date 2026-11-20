import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { reviewMemberOffer, type PendingMemberOffer } from "@/lib/tap-card/member-offers.server";
import { offerLabel } from "@/lib/tap-card/loyalty";
import { StatusMessage, darkButtonClass, errorText, fieldClass, outlineButtonClass, type Message } from "@/components/guild/settings-ui";

/** Guild > Scan Pass > Offers: breweries' loyalty rewards (and changes) waiting for an OK. */
export function OfferApprovalsPanel({ pending }: { pending: PendingMemberOffer[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function review(offer: PendingMemberOffer, approve: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await reviewMemberOffer({ data: { id: offer.id, approve, note: approve ? "" : note, seen: { ...offer.draft, submittedAt: offer.submittedAt } } });
      setMessage({ kind: "ok", text: `${offer.memberName}: ${approve ? "approved" : "declined"}.` });
      setDeclining(null);
      setNote("");
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <p className="text-[13px] text-ink-muted">
        Breweries&rsquo; loyalty rewards wait here for your OK. Check each one against the alcohol rules the Guild follows. A
        brewery&rsquo;s approved version stays live while a change waits.
      </p>
      {pending.length === 0 ? (
        <p className="rounded-[14px] border border-canvas-border bg-white px-5 py-6 text-[13px] text-ink-muted">No offers waiting.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-5 py-4">
              <div>
                <div className="text-[12px] text-ink-muted">
                  {o.memberName} · {offerLabel(o.slot, o.draft.visitNumber)} · sent {new Date(o.submittedAt).toLocaleDateString("en-US")}
                </div>
                <div className="text-[16px] font-semibold text-ink">{o.draft.reward}</div>
                {o.draft.terms && <div className="text-[13px] text-ink-muted">{o.draft.terms}</div>}
                {o.live && (
                  <div className="mt-1 text-[13px] text-ink-muted">
                    Now live: {offerLabel(o.slot, o.live.visitNumber)} — {o.live.reward}
                  </div>
                )}
              </div>
              {declining === o.id ? (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
                    Note to the brewery (optional)
                    <input className={fieldClass} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className={darkButtonClass} disabled={busy} onClick={() => review(o, false)}>
                      Send decline
                    </button>
                    <button type="button" className={outlineButtonClass} onClick={() => setDeclining(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className={darkButtonClass} disabled={busy} onClick={() => review(o, true)}>
                    Approve
                  </button>
                  <button
                    type="button"
                    className={outlineButtonClass}
                    disabled={busy}
                    onClick={() => {
                      setDeclining(o.id);
                      setNote("");
                    }}
                  >
                    Decline
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <StatusMessage message={message} />
    </div>
  );
}
