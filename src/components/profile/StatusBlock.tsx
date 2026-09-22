import { computeOpenNow, type OpenNowResult, type SpecialHoursDay, type WeekdayHours } from "@/lib/hours/open-now";
import type { EventRow, MemberRow } from "@/lib/supabase/types";
import { Phone } from "lucide-react";

type StatusBlockProps = {
  member: MemberRow;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
  tonightEvent: EventRow | null; // the earliest non-postponed/canceled event starting today, if any
};

function formatHoursConfirmedLabel(hoursConfirmedAt: string | null): string | null {
  if (!hoursConfirmedAt) return null;
  const confirmedDate = new Date(hoursConfirmedAt);
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  if (confirmedDate.getTime() > ninetyDaysAgo) return null;
  return `Hours confirmed ${confirmedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

/**
 * The status line + second line + primary action, switched per the
 * "Member types" comparison table. Producer and Allied Member both show
 * open/closed with a phone-number fallback when there are no hours at
 * all (spec, "Empty and error states": "Hours not listed"); mobile shows
 * the next-appearance line instead, since mobile members have no weekly
 * hours (spec, "Events": "for a mobile member, events *are* the
 * schedule").
 */
export function StatusBlock({ member, hours, specialHours, tonightEvent }: StatusBlockProps) {
  const hasHours = hours.length > 0 || specialHours.length > 0;
  const openNow: OpenNowResult = hasHours
    ? computeOpenNow({ now: new Date(), timezone: member.timezone, hours, specialHours })
    : { status: "unknown" };
  const staleLabel = formatHoursConfirmedLabel(member.hours_confirmed_at);

  if (member.member_type === "mobile") {
    return (
      <div className="rounded-inset bg-canvas-2 p-4">
        {tonightEvent ? (
          <>
            <p className="font-display text-lg text-ink">Next appearance: {new Date(tonightEvent.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>
            <p className="text-sm text-ink-muted">{tonightEvent.venue_name ?? member.service_area}{tonightEvent.city ? `, ${tonightEvent.city}` : ""}</p>
          </>
        ) : (
          <p className="font-display text-lg text-ink">No dates announced yet</p>
        )}
        <a
          href={member.phone ? `tel:${member.phone}` : undefined}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Phone className="h-4 w-4" /> Book us
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-inset bg-canvas-2 p-4">
      {!hasHours || openNow.status === "unknown" ? (
        <>
          <p className="font-display text-lg text-ink">Hours not listed</p>
          {member.phone && (
            <a href={`tel:${member.phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Phone className="h-4 w-4" /> {member.phone}
            </a>
          )}
        </>
      ) : (
        <>
          <p className="font-display text-lg text-ink">
            {openNow.status === "open" ? (
              <>
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-open align-middle" aria-hidden="true" />
                Open now &middot; {openNow.closesInLabel}
              </>
            ) : (
              <>Closed{openNow.nextOpenLabel ? ` — ${openNow.nextOpenLabel}` : ""}</>
            )}
          </p>
          {tonightEvent && member.member_type !== "allied" && (
            <p className="text-sm text-ink-muted">Tonight: {tonightEvent.venue_name ?? "on tap"}</p>
          )}
          {staleLabel && <p className="mt-1 text-xs text-warn">{staleLabel}</p>}
        </>
      )}
    </div>
  );
}
