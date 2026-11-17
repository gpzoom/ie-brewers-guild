import { useEffect, useState, type FormEvent } from "react";
import { getMemberOffer, submitOffer, type MemberOffer } from "@/lib/tap-card/offers.server";
import { OFFER_MAX } from "@/lib/tap-card/offers";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const buttonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas hover:bg-ink/85 disabled:opacity-60";
const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";

const STATUS: Record<"pending" | "approved" | "declined", string> = {
  pending: "Waiting for Guild approval. The standard offer shows until then.",
  approved: "Approved. This is the offer customers see.",
  declined: "Not approved — the standard offer is showing. Change it and send it again, or contact the Guild.",
};

/** The brewery's offer: the standard nickel offer, or its own once the Guild approves it. */
export function TapCardOfferCard({ memberId }: { memberId: string }) {
  const [offer, setOffer] = useState<MemberOffer | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const next = await getMemberOffer({ data: { memberId } });
      setOffer(next);
      setText(next.own?.offerText ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the offer.");
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function save(offerText: string | null, event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitOffer({ data: { memberId, offerText } });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="tap-card-offer">
      <h2 id="tap-card-offer" className="font-display text-[18px] font-bold text-ink">
        Your offer
      </h2>
      <p className="text-[13px] text-ink-muted">
        Each card holder gets your offer once a year. The standard offer is &ldquo;{STANDARD_OFFER}.&rdquo; You can write your
        own instead; the Guild approves it before it shows.
      </p>
      {offer && (
        <div className="rounded-xl border border-canvas-border bg-canvas px-4 py-3">
          <div className="text-[12px] text-ink-muted">Customers see</div>
          <div className="text-[16px] font-semibold text-ink">{offer.showing}</div>
          {offer.own && <div className="mt-1 text-[13px] text-ink-muted">{STATUS[offer.own.status]}</div>}
        </div>
      )}
      <form onSubmit={(e) => save(text, e)} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          Your own offer (optional)
          <input
            className={fieldClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={OFFER_MAX}
            placeholder="First pint half off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            Send to the Guild for approval
          </button>
          {offer?.own && (
            <button type="button" className={outlineClass} disabled={busy} onClick={() => save(null)}>
              Use the standard offer
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
