import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { reviewOffer, type PendingOffer } from "@/lib/tap-card/offers.server";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";
import { StatusMessage, darkButtonClass, errorText, outlineButtonClass, type Message } from "@/components/guild/settings-ui";

/** Guild > Tap Card > Offers: brewers' own offers waiting for an OK. */
export function OfferApprovalsPanel({ pending }: { pending: PendingOffer[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);

  async function review(offer: PendingOffer, approve: boolean) {
    setMessage(null);
    try {
      await reviewOffer({ data: { memberId: offer.memberId, approve } });
      setMessage({ kind: "ok", text: `${offer.memberName}: ${approve ? "approved" : "not approved"}.` });
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <p className="text-[13px] text-ink-muted">
        A brewer&rsquo;s own offer shows only after you approve it; until then their stop shows &ldquo;{STANDARD_OFFER}.&rdquo;
        Check each one against the alcohol rules the Guild follows.
      </p>
      {pending.length === 0 ? (
        <p className="rounded-[14px] border border-canvas-border bg-white px-5 py-6 text-[13px] text-ink-muted">
          No offers waiting.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((o) => (
            <li key={o.memberId} className="flex flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-5 py-4">
              <div>
                <div className="text-[12px] text-ink-muted">
                  {o.memberName} · sent {new Date(o.submittedAt).toLocaleDateString("en-US")}
                </div>
                <div className="text-[16px] font-semibold text-ink">{o.offerText}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className={darkButtonClass} onClick={() => review(o, true)}>
                  Approve
                </button>
                <button type="button" className={outlineButtonClass} onClick={() => review(o, false)}>
                  Don&rsquo;t approve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <StatusMessage message={message} />
    </div>
  );
}
