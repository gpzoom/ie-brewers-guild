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

function EventsRoute() {
  const { events, memberTimezone, calendarConnection } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <>
      <CalendarConnectionPanel memberId={memberId} initialConnection={calendarConnection} />
      <EventsEditor memberId={memberId} initialEvents={events} memberTimezone={memberTimezone} />
    </>
  );
}
