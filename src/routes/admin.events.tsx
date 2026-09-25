import { createFileRoute } from "@tanstack/react-router";
import { listEvents } from "@/lib/events/events.server";
import { getCalendarConnection } from "@/lib/events/calendar-connection.server";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { EventsEditor } from "@/components/admin/EventsEditor";
import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";

export const Route = createFileRoute("/admin/events")({
  loader: async ({ context }) => {
    // Parallel loads, same Promise.all pattern as admin.media.tsx's loader
    // -- getMemberBasics gives us member.timezone, which EventsEditor
    // needs to display/edit event times in the member's OWN business
    // timezone rather than whatever timezone the viewing browser happens
    // to be set to (see EventsEditor.tsx's TZDate usage).
    const [events, member, calendarConnection] = await Promise.all([
      listEvents({ data: { memberId: context.memberId } }),
      getMemberBasics({ data: { memberId: context.memberId } }),
      getCalendarConnection({ data: { memberId: context.memberId } }),
    ]);
    return { events, memberTimezone: member.timezone, calendarConnection };
  },
  component: EventsRoute,
});

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-px shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.9v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Artboard M (AdminEvents): heading, calendar connection, upcoming list, note. */
function EventsRoute() {
  const { events, memberTimezone, calendarConnection } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <div className="flex flex-col gap-[26px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[27px] font-bold leading-tight text-ink">Events</h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          Every member can list events. Connect a calendar, tag what's public, and it shows up here.
        </p>
      </div>

      <CalendarConnectionPanel memberId={memberId} initialConnection={calendarConnection} />
      <EventsEditor memberId={memberId} initialEvents={events} memberTimezone={memberTimezone} />

      <div className="flex items-start gap-3 rounded-[11px] bg-canvas-2 px-[17px] py-[15px] text-ink-muted">
        <InfoIcon />
        <p className="text-pretty text-[13px] leading-normal text-ink">
          A status you set here stays put. It survives the next sync and it never changes anything
          in your own calendar — so if a gig moves before your calendar catches up, set it here and
          your profile is right straight away.
        </p>
      </div>
    </div>
  );
}
