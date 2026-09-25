import type { EventRow, MemberType } from "@/lib/supabase/types";
import { SectionLabel } from "@/components/profile/SectionLabel";
import { cn } from "@/lib/utils";

type EventsModuleProps = {
  events: EventRow[];
  memberType: MemberType;
  // The member's own IANA timezone (spec, "Computing 'open now'", rule 1 --
  // the same rule applies to displaying an event's time: it must be the
  // member's own zone, never the server's (Cloudflare Workers render in
  // UTC) or the visitor's. Formatting without an explicit timeZone lets
  // Intl fall back to the runtime's local zone, which differs between
  // server and browser and is also simply the wrong zone for the event.
  timezone: string;
};

const HEADINGS: Record<MemberType, string> = {
  producer: "Coming up",
  mobile: "Where we'll be",
  allied: "Coming up",
};

function dateParts(iso: string, timezone: string): { weekday: string; day: string } {
  const date = new Date(iso);
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: timezone }),
    day: date.toLocaleDateString("en-US", { day: "numeric", timeZone: timezone }),
  };
}

function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).toLowerCase();
}

// "6:00 pm", or "6:00 – 9:00 pm" when the event has an end on the same
// local day (artboard E). A rescheduled event has no overlay end time, so
// it shows its new start only.
function formatTimeRange(startIso: string, endIso: string | null, timezone: string): string {
  const start = formatTime(startIso, timezone);
  if (!endIso) return start;
  const sameDay =
    new Date(startIso).toLocaleDateString("en-US", { timeZone: timezone }) ===
    new Date(endIso).toLocaleDateString("en-US", { timeZone: timezone });
  if (!sameDay) return start;
  const end = formatTime(endIso, timezone);
  const startPeriod = start.slice(-2);
  const endPeriod = end.slice(-2);
  return startPeriod === endPeriod ? `${start.slice(0, -3)} – ${end}` : `${start} – ${end}`;
}

function syncedLabel(events: EventRow[]): string | null {
  if (events.length === 0) return null;
  if (events.every((event) => event.source === "google")) return "Synced from Google Calendar";
  if (events.every((event) => event.source === "google" || event.source === "ics")) return "Synced from calendar";
  return null;
}

const BADGE_STYLES: Record<NonNullable<EventRow["overlay_status"]>, string> = {
  rescheduled: "bg-[#F5E2D0] text-[#7A4413]",
  postponed: "bg-[#F5E2D0] text-[#7A4413]",
  canceled: "bg-[#F0DBD4] text-[#7A2E1C]",
};

/**
 * Every member type gets this module (spec, "Events": "Every member type
 * can list events, not just mobile members"). Status overlays render per
 * the spec's table: postponed strikes the original date with no new
 * date, rescheduled shows the new date/time, canceled mutes the row and
 * strikes its details but the row stays visible (spec: "a silently
 * vanished row teaches them nothing"). Look: artboards D/E/V/L -- a date
 * column beside a title and a detail line, on white rows.
 */
export function EventsModule({ events, memberType, timezone }: EventsModuleProps) {
  const visibleEvents = events.filter((event) => !event.is_hidden);

  if (visibleEvents.length === 0) {
    if (memberType === "mobile") {
      // Spec, "Empty and error states": "Mobile member, no upcoming events ->
      // 'No dates announced yet' with the booking button still present --
      // never an empty list." The booking button itself lives in
      // StatusBlock for mobile members, so this module just steps aside
      // rather than rendering a duplicate CTA.
      //
      // This must key off "no events at all", not "no non-canceled
      // events": a canceled event still has to render (spec, "a canceled
      // event stays visible rather than disappearing") -- if a mobile
      // member's only upcoming event is canceled, the fix is to show that
      // canceled row below, not to fall back to this empty state.
      return (
        <section className="flex flex-col gap-[9px] lg:gap-[11px]">
          <SectionLabel>{HEADINGS[memberType]}</SectionLabel>
          <p className="text-sm text-ink-muted">No dates announced yet</p>
        </section>
      );
    }

    // Spec's general rule: a module with nothing in it disappears rather
    // than rendering an empty container -- this is the "no exceptions
    // listed" case for producer/Allied Member.
    return null;
  }

  return (
    <section className="flex flex-col gap-[9px] lg:gap-[11px]">
      <SectionLabel aside={syncedLabel(visibleEvents)}>{HEADINGS[memberType]}</SectionLabel>
      <ul className="flex flex-col gap-[9px] lg:gap-[11px]">
        {visibleEvents.map((event) => {
          const isPostponed = event.overlay_status === "postponed";
          const isCanceled = event.overlay_status === "canceled";
          const isRescheduled = event.overlay_status === "rescheduled" && Boolean(event.overlay_starts_at);

          // A rescheduled event's date column shows its NEW date; the
          // original is what a postponed/canceled row strikes.
          const shownStart = isRescheduled ? (event.overlay_starts_at as string) : event.starts_at;
          const { weekday, day } = dateParts(shownStart, timezone);
          const time = isRescheduled
            ? `now ${formatTime(shownStart, timezone)}`
            : formatTimeRange(event.starts_at, event.ends_at, timezone);

          // Title line: the event's own name, else its venue. The detail
          // line carries the time plus whatever of venue/city isn't already
          // the title (venue null = at the member's own address).
          const title = event.title ?? event.venue_name ?? "Event";
          const place = [event.title ? event.venue_name : null, event.city].filter(Boolean).join(", ");
          const struck = isPostponed || isCanceled;

          return (
            <li
              key={event.id}
              className={cn(
                "flex min-h-16 items-center gap-[13px] rounded-xl border px-[13px] py-[11px] lg:min-h-[70px] lg:gap-4 lg:rounded-[13px] lg:px-4 lg:py-[13px]",
                isCanceled ? "border-canvas-2 bg-[#F2EEE7]" : "border-canvas-border bg-white",
              )}
            >
              <div className={cn("flex w-10 shrink-0 flex-col items-center lg:w-[46px]", isPostponed && "line-through")}>
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-[0.1em] lg:text-[10px]",
                    isCanceled ? "text-ink-subtle" : "text-ink-muted",
                  )}
                >
                  {weekday}
                </span>
                <span
                  className={cn(
                    "font-display text-[19px] leading-[1.05] lg:text-[22px]",
                    isCanceled ? "text-ink-subtle" : "text-ink",
                  )}
                >
                  {day}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
                <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1">
                  <span
                    className={cn(
                      "text-[13px] font-semibold lg:text-[15px]",
                      isCanceled ? "text-ink-muted" : "text-ink",
                    )}
                  >
                    {title}
                  </span>
                  {event.overlay_status && (
                    <span
                      className={cn(
                        "rounded-pill px-[7px] py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]",
                        BADGE_STYLES[event.overlay_status],
                      )}
                    >
                      {event.overlay_status}
                    </span>
                  )}
                </div>
                <span className={cn("text-xs lg:text-[13px]", isCanceled ? "text-ink-subtle" : "text-ink-muted")}>
                  <span className={cn(struck && "line-through")}>{/* Where comes first for a mobile member's gigs (artboard E);
                      when comes first at a taproom or supply house (D/V). */}
                    {(memberType === "mobile" ? [place, time] : [time, place]).filter(Boolean).join(" · ")}</span>
                </span>
                {event.overlay_note && (
                  <span className={cn("text-xs text-ink-muted lg:text-[13px]", isCanceled && "line-through")}>
                    {event.overlay_note}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
