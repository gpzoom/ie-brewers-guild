import { useEffect, useState } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { cancelPendingCheckIn, getPendingCheckIn, type PendingCheckIn } from "@/lib/tap-card/plate.server";
import { getHolderCard, signOutHolder } from "@/lib/tap-card/holder.server";
import type { HolderCardView } from "@/lib/tap-card/holder-view";
import { CanvasHeading, cardLinkClass, hintClass, leadClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow, TapCardShell } from "@/components/tap-card/TapCardShell";
import { useByDate } from "@/components/tap-card/CheckInScreen";
import { CardScanner } from "@/components/tap-card/CardScanner";
import { CheckInModal } from "@/components/tap-card/CheckInModal";
import { PlateSuccess, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { SaveToHomeScreen } from "@/components/tap-card/SaveToHomeScreen";
import { CARD_APP_HEAD_LINKS, CARD_APP_HEAD_META } from "@/lib/tap-card/card-app";

/** /card: a card holder's progress this year. Signed out → the email sign-in. */
export const Route = createFileRoute("/card")({
  staleTime: 0,
  loader: async () => {
    const [view, pending] = await Promise.all([getHolderCard(), getPendingCheckIn()]);
    if (!view) throw redirect({ to: "/card/signin" });
    return { view, pending };
  },
  head: () => ({
    meta: [{ title: "My Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }, ...CARD_APP_HEAD_META],
    links: CARD_APP_HEAD_LINKS,
  }),
  component: CardPage,
});

function CardPage() {
  const { view, pending } = Route.useLoaderData();
  const router = useRouter();
  const [done, setDone] = useState<{ at: PendingCheckIn; ok: PlateOk } | null>(null);
  const [closed, setClosed] = useState(false);
  const [scans, setScans] = useState(0);

  // A page brought back from the phone's memory must not keep an old check-in on screen.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (done) {
    return (
      <TapCardShell>
        <PlateSuccess memberName={done.at.memberName} memberSlug={done.at.memberSlug} plateCode={done.at.plateCode} initial={done.ok} />
      </TapCardShell>
    );
  }

  return (
    <TapCardShell>
      {pending && !closed && (
        <CheckInModal
          key={scans}
          pending={pending}
          onDone={(ok) => setDone({ at: pending, ok })}
          onClose={async () => {
            setClosed(true);
            try {
              await cancelPendingCheckIn();
              await router.invalidate();
            } catch {
              // it lapses by itself in a few minutes
            }
          }}
        />
      )}
      <Eyebrow>Inland Scan Pass · {view.year}</Eyebrow>
      <CanvasHeading size="md">{view.firstName}&rsquo;s Inland Scan Pass</CanvasHeading>
      <CardScanner
        onNoted={async () => {
          await router.invalidate();
          setScans((n) => n + 1);
          setClosed(false);
        }}
      />
      <SaveToHomeScreen />
      <Waiting view={view} />
      <JoinTrail view={view} />
      {view.upcomingPassYear && (
        <p className="rounded-[14px] border border-canvas-border bg-white px-4 py-4 text-[15px] text-ink">
          <span className="font-semibold">Your {view.upcomingPassYear} Beer Trail Pass is ready.</span> It starts January 1,{" "}
          {view.upcomingPassYear}. Your brewery rewards work now.
        </p>
      )}
      {view.hasTrailPass && (
        <>
          <Progress view={view} />
          <Milestones view={view} />
          <StopList view={view} />
        </>
      )}
      <YourVisits view={view} />
      <SignOut />
    </TapCardShell>
  );
}

function JoinTrail({ view }: { view: HolderCardView }) {
  if (!view.canJoinTrail) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-canvas-border bg-white px-4 py-4">
      <p className="text-[15px] font-semibold text-ink">Join the Beer Trail</p>
      <p className="text-[14px] text-ink-muted">Get the Beer Trail offer at every stop and Guild rewards for visiting more. Your brewery rewards keep working either way.</p>
      <a href="/trail/join" className={`${cardLinkClass} w-fit text-[14px]`}>
        Get your Beer Trail Pass
      </a>
    </div>
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

/** Loyalty rewards earned at breweries, waiting to be used. */
function Waiting({ view }: { view: HolderCardView }) {
  if (view.waiting.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-canvas-border bg-white px-4 py-3.5" aria-label="Waiting for you">
      <h2 className="text-[15px] font-semibold text-ink">Waiting for you</h2>
      <ul className="flex flex-col gap-3">
        {view.waiting.map((w) => (
          <li key={`${w.memberName}-${w.reward}-${w.expiresAt}`} className="flex flex-col gap-0.5">
            <span className="text-[16px] font-semibold text-ink">{w.reward}</span>
            <span className="text-[13px] text-ink-muted">
              {w.memberName} · Use by {useByDate(w.expiresAt)}
            </span>
            {w.terms && <span className="text-[13px] text-ink-muted">{w.terms}</span>}
          </li>
        ))}
      </ul>
      <p className={hintClass}>Ask a staff member for it on your next visit. One reward per visit.</p>
    </section>
  );
}

function YourVisits({ view }: { view: HolderCardView }) {
  if (view.visitCounts.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Your visits">
      <h2 className="text-[15px] font-semibold text-ink">Your visits</h2>
      <ul className="flex flex-col gap-1 text-[14px] text-ink">
        {view.visitCounts.map((v) => (
          <li key={v.memberId}>
            {v.name} — {v.count} {v.count === 1 ? "visit" : "visits"}
          </li>
        ))}
      </ul>
    </section>
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
      <h2 className="text-[15px] font-semibold text-ink">The Beer Trail Stops</h2>
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
