import { useState, type FormEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { addReplacementCard, getHolderCard, signOutHolder, turnOffCard } from "@/lib/tap-card/holder.server";
import type { HolderCardView } from "@/lib/tap-card/holder-view";
import {
  CanvasHeading,
  cardLinkClass,
  fieldErrorClass,
  hintClass,
  inputClass,
  labelClass,
  leadClass,
  secondaryButtonClass,
} from "@/components/public-forms/PublicFormParts";
import { Eyebrow, TapCardShell } from "@/components/tap-card/TapCardShell";

/** /card: a card holder's progress this year. Signed out → the email sign-in. */
export const Route = createFileRoute("/card")({
  staleTime: 0,
  loader: async () => {
    const view = await getHolderCard();
    if (!view) throw redirect({ to: "/card/signin" });
    return view;
  },
  head: () => ({ meta: [{ title: "My Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CardPage,
});

function CardPage() {
  const view = Route.useLoaderData();
  return (
    <TapCardShell>
      <Eyebrow>Inland Tap Card · {view.year}</Eyebrow>
      <CanvasHeading size="md">{view.firstName}&rsquo;s Inland Tap Card</CanvasHeading>
      <Progress view={view} />
      <Milestones view={view} />
      <StopList view={view} />
      <MyCards cards={view.cards} />
      <AddCard />
      <SignOut />
    </TapCardShell>
  );
}

function Progress({ view }: { view: HolderCardView }) {
  const pct = view.totalStops === 0 ? 0 : Math.min(100, Math.round((view.visitedCount / view.totalStops) * 100));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[17px] font-semibold text-ink">
        {view.visitedCount} of {view.totalStops} stops in {view.year}
      </p>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-canvas-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={view.totalStops}
        aria-valuenow={view.visitedCount}
        aria-label="Stops visited this year"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Milestones({ view }: { view: HolderCardView }) {
  if (view.milestones.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Rewards">
      <h2 className="text-[15px] font-semibold text-ink">Guild rewards</h2>
      <ul className="flex flex-col gap-1.5">
        {view.milestones.map((m) => (
          <li key={m.stopsRequired} className="flex items-baseline justify-between gap-3 text-[14px] text-ink">
            <span>
              {m.stopsRequired} {m.stopsRequired === 1 ? "stop" : "stops"}: {m.rewardText}
            </span>
            <span className={m.earned ? "font-semibold text-[#1F5E2A]" : "text-ink-muted"}>
              {m.handedOut ? "Received" : m.earned ? "Earned!" : "Not yet"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StopList({ view }: { view: HolderCardView }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Stops">
      <h2 className="text-[15px] font-semibold text-ink">The stops</h2>
      <ul className="flex flex-col divide-y divide-canvas-border rounded-xl border border-canvas-border bg-white">
        {view.stops.map((s) => (
          <li key={s.memberId} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <a href={`/members/${s.slug}`} className="text-[15px] font-medium text-ink underline-offset-2 hover:underline">
                {s.name}
              </a>
              <div className="text-[13px] text-ink-muted">
                {s.city ? `${s.city} · ` : ""}
                {s.offer}
              </div>
            </div>
            <span className={`shrink-0 text-[13px] ${s.visited ? "font-semibold text-[#1F5E2A]" : "text-ink-muted"}`}>
              {s.visited ? "Visited" : "Not yet"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Your cards, each with "Turn off" for a lost one (it then stops working everywhere). */
function MyCards({ cards }: { cards: string[] }) {
  const [error, setError] = useState<string | null>(null);
  async function turnOff(code: string) {
    if (!window.confirm(`Turn off card ${code}? It will stop working at every stop. This can't be undone.`)) return;
    setError(null);
    try {
      const result = await turnOffCard({ data: { code } });
      if (result.kind === "signed-out") window.location.assign("/card/signin");
      else if (result.kind === "turned-off") window.location.reload();
      else setError("That card isn't on your account.");
    } catch {
      setError("Something went wrong. Try again in a moment.");
    }
  }
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Your cards">
      <h2 className="text-[15px] font-semibold text-ink">Your {cards.length === 1 ? "card" : "cards"}</h2>
      <ul className="flex flex-col gap-1.5">
        {cards.map((code) => (
          <li key={code} className="flex items-center justify-between gap-3 text-[14px] text-ink">
            <span className="font-mono">{code}</span>
            <button type="button" className={cardLinkClass} onClick={() => turnOff(code)}>
              Lost it? Turn off
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </section>
  );
}

function AddCard() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await addReplacementCard({ data: { code } });
      if (result.kind === "added") window.location.reload();
      else if (result.kind === "already-active") setMessage("That card is already in use.");
      else if (result.kind === "signed-out") window.location.assign("/card/signin");
      else setMessage("We don't recognize that code. Check the code printed on the card.");
    } catch {
      setMessage("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={`${cardLinkClass} text-left`} onClick={() => setOpen(true)}>
        Lost your card? Add a new one
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Code printed on your new card</span>
        <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" autoCapitalize="characters" />
      </label>
      <p className={hintClass}>Your visits and rewards stay with you.</p>
      <button type="submit" className={secondaryButtonClass} disabled={busy}>
        Add this card
      </button>
      {message && (
        <p role="alert" className={fieldErrorClass}>
          {message}
        </p>
      )}
    </form>
  );
}

function SignOut() {
  return (
    <p className={leadClass}>
      <button
        type="button"
        className={cardLinkClass}
        onClick={async () => {
          await signOutHolder();
          window.location.assign("/trail");
        }}
      >
        Sign out
      </button>
    </p>
  );
}
