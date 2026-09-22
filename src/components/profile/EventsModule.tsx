import type { EventRow, MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type EventsModuleProps = {
  events: EventRow[];
  memberType: MemberType;
};

const HEADINGS: Record<MemberType, string> = {
  producer: "Coming up",
  mobile: "Where we'll be",
  allied: "Coming up",
};

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Every member type gets this module (spec, "Events": "Every member type
 * can list events, not just mobile members"). Status overlays render per
 * the spec's table: postponed strikes the original date with no new
 * date, rescheduled shows the new date/time, canceled mutes the row and
 * strikes its details but the row stays visible (spec: "a silently
 * vanished row teaches them nothing").
 */
export function EventsModule({ events, memberType }: EventsModuleProps) {
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
        <section>
          <h2 className="font-display text-lg text-ink">{HEADINGS[memberType]}</h2>
          <p className="mt-2 text-sm text-ink-muted">No dates announced yet</p>
        </section>
      );
    }

    // Spec's general rule: a module with nothing in it disappears rather
    // than rendering an empty container -- this is the "no exceptions
    // listed" case for producer/Allied Member.
    return null;
  }

  return (
    <section>
      <h2 className="font-display text-lg text-ink">{HEADINGS[memberType]}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {visibleEvents.map((event) => {
          const isPostponed = event.overlay_status === "postponed";
          const isCanceled = event.overlay_status === "canceled";
          const isRescheduled = event.overlay_status === "rescheduled";

          return (
            <li
              key={event.id}
              className={cn(
                "flex flex-col gap-0.5 rounded-md border border-canvas-border bg-canvas px-3 py-2",
                isCanceled && "opacity-60",
              )}
            >
              {event.title && (
                <span className={cn("text-sm font-semibold text-ink", isCanceled && "line-through")}>
                  {event.title}
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className={cn("text-sm text-ink", (isPostponed || isCanceled) && "line-through")}>
                  {formatEventDate(event.starts_at)}
                </span>
                {event.overlay_status && (
                  <span className="rounded-pill bg-warn/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-warn">
                    {event.overlay_status}
                  </span>
                )}
              </div>
              {isRescheduled && event.overlay_starts_at && (
                <span className="text-sm font-medium text-ink">
                  New time: {formatEventDate(event.overlay_starts_at)}
                </span>
              )}
              {(event.venue_name || event.city) && (
                <span className={cn("text-xs text-ink-muted", isCanceled && "line-through")}>
                  {[event.venue_name, event.city].filter(Boolean).join(", ")}
                </span>
              )}
              {event.overlay_note && (
                <span className={cn("text-xs text-ink-muted", isCanceled && "line-through")}>
                  {event.overlay_note}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
