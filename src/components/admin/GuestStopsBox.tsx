import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listGuestStops, setGuestStopStatus } from "@/lib/events/guest-stops.server";
import type { GuestStopRow } from "@/lib/events/guest-stops";
import { dateParts, formatTimeRange, GuildMemberPill } from "@/components/profile/EventsModule";
import { cn } from "@/lib/utils";

/**
 * Guild Mobile members at taprooms
 * (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md):
 * a producer's linked stops, loaded on mount, with Hide/Show saved straight
 * away (optimistic; rolled back with the message if it fails). Shared by
 * the Events page box and the Food page preview.
 */
export function useGuestStops(memberId: string) {
  const [street, setStreet] = useState<string | null>(null);
  const [stops, setStops] = useState<GuestStopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listGuestStops({ data: { memberId } })
      .then((result) => {
        if (!live) return;
        setStreet(result.street);
        setStops(result.stops);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setStops([]);
        setError(err instanceof Error ? err.message : "Couldn't load the Guild members at your taproom.");
      });
    return () => {
      live = false;
    };
  }, [memberId]);

  const toggle = useCallback(
    async (row: GuestStopRow) => {
      const status = row.status === "shown" ? "hidden" : "shown";
      setError(null);
      setStops((prev) => prev?.map((s) => (s.eventId === row.eventId ? { ...s, status } : s)) ?? prev);
      try {
        await setGuestStopStatus({ data: { memberId, eventId: row.eventId, status } });
      } catch (err) {
        setStops((prev) => prev?.map((s) => (s.eventId === row.eventId ? { ...s, status: row.status } : s)) ?? prev);
        setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      }
    },
    [memberId],
  );

  return { street, stops, error, toggle };
}

/** The rows: date, the guest (linked), the marks, title and time, and Hide or Show (artboard GV1). */
export function GuestStopRows({
  stops,
  timezone,
  onToggle,
}: {
  stops: GuestStopRow[];
  timezone: string;
  onToggle: (row: GuestStopRow) => void;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {stops.map((row) => {
        const hidden = row.status === "hidden";
        const { weekday, day, month } = dateParts(row.startsAt, timezone);
        const time = row.allDay ? "All day" : formatTimeRange(row.startsAt, row.endsAt, timezone);
        return (
          <li
            key={row.eventId}
            className={cn(
              "flex flex-col gap-3 rounded-xl border border-canvas-border px-4 py-3.5 sm:flex-row sm:items-center sm:gap-[18px]",
              hidden ? "bg-[#F7F4EE]" : "bg-white",
            )}
          >
            <div className={cn("flex min-w-0 flex-1 items-center gap-[18px]", hidden && "opacity-60")}>
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <span className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">{weekday}</span>
                <span className="font-display text-[23px] font-bold leading-[1.05] text-ink">{day}</span>
                <span className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">{month}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/members/$slug"
                    params={{ slug: row.guestSlug }}
                    className="text-[15px] font-semibold text-ink underline-offset-2 hover:underline"
                  >
                    {row.guestName}
                  </Link>
                  <GuildMemberPill />
                  <span className="rounded-full bg-[#DCEDEC] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-[#17605F]">
                    {row.tag}
                  </span>
                </div>
                <span className="text-[13px] text-ink-muted">
                  {[row.title, time, "from their schedule"].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3.5">
              <span className="text-[12px] text-ink-muted">{hidden ? "Hidden from your page" : "On your page"}</span>
              <button
                type="button"
                onClick={() => onToggle(row)}
                className="h-11 rounded-[9px] border border-[#D3CBBD] bg-white px-4 text-[13px] font-semibold text-ink hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {hidden ? "Show" : "Hide"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** "Guild members at your taproom" (artboard GV1), presentational. */
export function GuestStopsList({
  stops,
  timezone,
  street,
  onToggle,
  error = null,
}: {
  stops: GuestStopRow[];
  timezone: string;
  street: string | null;
  onToggle: (row: GuestStopRow) => void;
  error?: string | null;
}) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[14px] border-2 border-[#E8913A] bg-white px-5 py-5 md:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-semibold text-ink">Guild members at your taproom</h2>
        <p className="text-pretty text-[13px] leading-[1.45] text-ink-muted">
          Guild Mobile members, such as food trucks, pop-ups and entertainers, who list a stop at your
          taproom{street ? ` (${street})` : ""}. They show with your events, and food vendors also show
          in your Food this week. You don&rsquo;t type anything. Hide any you don&rsquo;t want on your page.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {error}
        </p>
      )}
      {stops.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No Guild members have listed a stop here yet.</p>
      ) : (
        <GuestStopRows stops={stops} timezone={timezone} onToggle={onToggle} />
      )}
      <p className="border-t border-canvas-2 pt-3 text-[12px] leading-[1.45] text-ink-muted">
        Hidden stops come off your profile, your Food this week and the homepage. They stay on the
        member&rsquo;s own page.
      </p>
    </section>
  );
}

/** The Events page box (portal and /admin), producers only -- the caller decides. */
export function GuestStopsBox({ memberId, timezone }: { memberId: string; timezone: string }) {
  const { street, stops, error, toggle } = useGuestStops(memberId);
  if (stops === null) return null;
  return <GuestStopsList stops={stops} timezone={timezone} street={street} onToggle={toggle} error={error} />;
}
