import { useState } from "react";
import { actOnVisitLink } from "@/lib/events/visit-link.server";
import type { VisitDetails, VisitView } from "@/lib/events/visit-link";
import type { EventHostStatus } from "@/lib/supabase/types";
import { formatTimeRange } from "@/components/profile/EventsModule";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  leadClass,
  primaryButtonClass,
  cardLinkClass,
} from "@/components/public-forms/PublicFormParts";

/**
 * The page behind a Guild member visit email's Approve, Decline and Hide
 * buttons (spec, "The email buttons"; artboard GV2). Opening it changes
 * nothing; only its one button does, so an email scanner can't answer for
 * the taproom.
 */
const BUTTON: Record<VisitDetails["action"], string> = {
  approve: "Approve this visit",
  decline: "Decline this visit",
  hide: "Hide it from my page",
};
const DONE: Record<VisitDetails["action"], string> = {
  approve: "Approved. It's on your page now.",
  decline: "Declined. It won't show on your page.",
  hide: "Hidden. It's off your page.",
};
const ANSWERED: Record<EventHostStatus, string> = {
  shown: "This visit is already on your page.",
  hidden: "This visit is already hidden from your page.",
  declined: "You already declined this visit.",
  pending: "This visit is waiting for your approval.",
};
const EXPLAIN: Record<VisitDetails["action"], string> = {
  approve: "Nothing shows on your page until you approve.",
  decline: "Nothing shows on your page until you approve.",
  hide: "It's on your page now. Hiding takes it off your page, your food week and the homepage.",
};

function visitWhen(v: VisitDetails): string {
  const day = new Date(v.startsAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: v.timezone,
  });
  return `${day} · ${v.allDay ? "All day" : formatTimeRange(v.startsAt, v.endsAt, v.timezone)}`;
}

function EventsPageLink() {
  return (
    <p className={leadClass}>
      Changed your mind? Your Events page has every visit.{" "}
      <a href="/portal/events" className={cardLinkClass}>
        Your Events page
      </a>
    </p>
  );
}

export function VisitLinkCard({
  view,
  done,
  busy,
  error,
  onConfirm,
}: {
  view: VisitView;
  done: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  if (view.state === "invalid") {
    return (
      <CanvasCard className="gap-[18px]">
        <CanvasHeading size="md">A Guild member&rsquo;s visit</CanvasHeading>
        <p className={leadClass}>
          This link isn&rsquo;t valid. Open your{" "}
          <a href="/portal/events" className={cardLinkClass}>
            Events page
          </a>{" "}
          to see every visit.
        </p>
      </CanvasCard>
    );
  }
  if (view.state === "gone") {
    return (
      <CanvasCard className="gap-[18px]">
        <CanvasHeading size="md">A Guild member&rsquo;s visit</CanvasHeading>
        <p className={leadClass}>This visit is no longer at your taproom.</p>
        <EventsPageLink />
      </CanvasCard>
    );
  }
  return <VisitDetailsCard view={view as VisitDetails & { state: "ready" | "answered" }} done={done} busy={busy} error={error} onConfirm={onConfirm} />;
}

function VisitDetailsCard({
  view,
  done,
  busy,
  error,
  onConfirm,
}: {
  view: VisitDetails & { state: "ready" | "answered" };
  done: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <CanvasCard className="gap-[18px]">
      <CanvasHeading size="md">A Guild member&rsquo;s visit</CanvasHeading>
      <div className="flex flex-col gap-1 rounded-xl border border-canvas-border bg-white px-4 py-3.5">
        <span className="text-[15px] font-semibold text-ink">
          {view.title ? `${view.guestName} — ${view.title}` : view.guestName}
        </span>
        <span className="text-[13px] text-ink-muted">{visitWhen(view)}</span>
        <span className="text-[13px] text-ink-muted">{view.taproomName}</span>
      </div>
      {done ? (
        <p className="text-[15px] font-semibold text-ink">{DONE[view.action]}</p>
      ) : view.state === "answered" ? (
        <p className="text-[15px] font-semibold text-ink">{ANSWERED[view.status]}</p>
      ) : (
        <>
          <p className={leadClass}>{EXPLAIN[view.action]}</p>
          <button type="button" onClick={onConfirm} disabled={busy} className={primaryButtonClass}>
            {BUTTON[view.action]}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] leading-normal text-danger">
          {error}
        </p>
      )}
      {(done || view.state === "answered") && <EventsPageLink />}
    </CanvasCard>
  );
}

export function VisitLinkPage({ token, initial }: { token: string; initial: VisitView }) {
  const [view, setView] = useState<VisitView>(initial);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await actOnVisitLink({ data: { token } });
      setView(next);
      setDone(next.state === "answered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[480px]">
        <BrandBar linkHome />
        <div className="mx-2.5 sm:mx-0 sm:mt-6">
          <VisitLinkCard view={view} done={done} busy={busy} error={error} onConfirm={onConfirm} />
        </div>
      </div>
    </div>
  );
}
