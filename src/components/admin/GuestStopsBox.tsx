import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listGuestStops, setGuestStopStatus, setGuestStopsMode } from "@/lib/events/guest-stops.server";
import type { GuestStopRow } from "@/lib/events/guest-stops";
import type { GuestStopsMode } from "@/lib/supabase/types";
import { dateParts, formatTimeRange, GuildMemberPill } from "@/components/profile/EventsModule";
import { cn } from "@/lib/utils";

/** What a taproom's person may set a visit to (Approve is "shown"). */
export type SettableStatus = "shown" | "hidden" | "declined";

/**
 * Guild Mobile members at taprooms (Part 1 and Part 2 specs,
 * docs/superpowers/specs/2026-10-07-guild-members-at-taprooms*.md): a
 * producer's linked stops and its "Ask me first" setting, loaded on mount.
 * Hide/Show, Approve/Decline and the setting save straight away
 * (optimistic; rolled back with the message if it fails). Shared by the
 * Events page box and the Food page preview.
 */
export function useGuestStops(memberId: string) {
  const [street, setStreet] = useState<string | null>(null);
  const [stops, setStops] = useState<GuestStopRow[] | null>(null);
  const [mode, setModeState] = useState<GuestStopsMode>("show");
  const [canChangeMode, setCanChangeMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listGuestStops({ data: { memberId } });
    setStreet(result.street);
    setStops(result.stops);
    setModeState(result.mode);
    setCanChangeMode(result.canChangeMode);
  }, [memberId]);

  useEffect(() => {
    let live = true;
    load().catch((err: unknown) => {
      if (!live) return;
      setStops([]);
      setError(err instanceof Error ? err.message : "Couldn't load the Guild members at your taproom.");
    });
    return () => {
      live = false;
    };
  }, [load]);

  const setStatus = useCallback(
    async (row: GuestStopRow, status: SettableStatus) => {
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

  const setMode = useCallback(
    async (next: GuestStopsMode) => {
      const before = mode;
      setError(null);
      setModeState(next);
      try {
        await setGuestStopsMode({ data: { memberId, mode: next } });
        // Switching to Show right away turns waiting visits into shown ones.
        await load();
      } catch (err) {
        setModeState(before);
        setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      }
    },
    [memberId, mode, load],
  );

  return { street, stops, mode, canChangeMode, error, setStatus, setMode };
}

const ROW_STATE: Record<GuestStopRow["status"], { label: string; faded: boolean; actions: Array<[string, SettableStatus]> }> = {
  shown: { label: "On your page", faded: false, actions: [["Hide", "hidden"]] },
  hidden: { label: "Hidden from your page", faded: true, actions: [["Show", "shown"]] },
  pending: { label: "Waiting for approval", faded: false, actions: [["Approve", "shown"], ["Decline", "declined"]] },
  declined: { label: "Declined", faded: true, actions: [["Show", "shown"]] },
};

const actionButtonClass =
  "h-11 rounded-[9px] border border-[#D3CBBD] bg-white px-4 text-[13px] font-semibold text-ink hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** The rows: date, the guest (linked), the marks, title and time, and the buttons for its state (artboard GV1). */
export function GuestStopRows({
  stops,
  timezone,
  onSetStatus,
}: {
  stops: GuestStopRow[];
  timezone: string;
  onSetStatus: (row: GuestStopRow, status: SettableStatus) => void;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {stops.map((row) => {
        const state = ROW_STATE[row.status];
        const { weekday, day, month } = dateParts(row.startsAt, timezone);
        const time = row.allDay ? "All day" : formatTimeRange(row.startsAt, row.endsAt, timezone);
        return (
          <li
            key={row.eventId}
            className={cn(
              "flex flex-col gap-3 rounded-xl border border-canvas-border px-4 py-3.5 sm:flex-row sm:items-center sm:gap-[18px]",
              state.faded ? "bg-[#F7F4EE]" : "bg-white",
            )}
          >
            <div className={cn("flex min-w-0 flex-1 items-center gap-[18px]", state.faded && "opacity-60")}>
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
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <span className={cn("mr-1 text-[12px]", row.status === "pending" ? "font-semibold text-[#B45309]" : "text-ink-muted")}>
                {state.label}
              </span>
              {state.actions.map(([label, status]) => (
                <button key={label} type="button" onClick={() => onSetStatus(row, status)} className={actionButtonClass}>
                  {label}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Show right away or Ask me first (Part 2). Read-only for a Photos & events editor. */
function ModeChoice({
  mode,
  canChangeMode,
  onSetMode,
}: {
  mode: GuestStopsMode;
  canChangeMode: boolean;
  onSetMode: (mode: GuestStopsMode) => void;
}) {
  const options: Array<[GuestStopsMode, string]> = [
    ["show", "Show them on my page right away"],
    ["ask", "Ask me first"],
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-semibold text-ink">When a Guild member lists a stop here</legend>
      {options.map(([value, label]) => (
        <label key={value} className={cn("flex min-h-11 items-center gap-2.5 text-[14px] text-ink", !canChangeMode && "opacity-70")}>
          <input
            type="radio"
            name="guest-stops-mode"
            value={value}
            checked={mode === value}
            disabled={!canChangeMode}
            onChange={() => onSetMode(value)}
            className="h-4 w-4 accent-[#B3591F]"
          />
          {label}
        </label>
      ))}
      {!canChangeMode && <p className="text-[12px] text-ink-muted">Only the owner or a full editor can change this.</p>}
    </fieldset>
  );
}

/** "Guild members at your taproom" (artboard GV1), presentational. */
export function GuestStopsList({
  stops,
  timezone,
  street,
  mode,
  canChangeMode,
  onSetStatus,
  onSetMode,
  error = null,
}: {
  stops: GuestStopRow[];
  timezone: string;
  street: string | null;
  mode: GuestStopsMode;
  canChangeMode: boolean;
  onSetStatus: (row: GuestStopRow, status: SettableStatus) => void;
  onSetMode: (mode: GuestStopsMode) => void;
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
      <ModeChoice mode={mode} canChangeMode={canChangeMode} onSetMode={onSetMode} />
      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {error}
        </p>
      )}
      {stops.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No Guild members have listed a stop here yet.</p>
      ) : (
        <GuestStopRows stops={stops} timezone={timezone} onSetStatus={onSetStatus} />
      )}
      <p className="border-t border-canvas-2 pt-3 text-[12px] leading-[1.45] text-ink-muted">
        Hidden stops come off your profile, your Food this week and the homepage. They stay on the
        member&rsquo;s own page. With Ask me first, a new visit waits here (and in your email) until you
        approve it.
      </p>
    </section>
  );
}

/** The Events page box (portal and /admin), producers only -- the caller decides. */
export function GuestStopsBox({ memberId, timezone }: { memberId: string; timezone: string }) {
  const { street, stops, mode, canChangeMode, error, setStatus, setMode } = useGuestStops(memberId);
  if (stops === null) return null;
  return (
    <GuestStopsList
      stops={stops}
      timezone={timezone}
      street={street}
      mode={mode}
      canChangeMode={canChangeMode}
      onSetStatus={setStatus}
      onSetMode={setMode}
      error={error}
    />
  );
}
