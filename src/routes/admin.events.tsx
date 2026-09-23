import { createFileRoute } from "@tanstack/react-router";
import { listEvents } from "@/lib/events/events.server";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { EventsEditor } from "@/components/admin/EventsEditor";

export const Route = createFileRoute("/admin/events")({
  loader: async ({ context }) => {
    // Parallel loads, same Promise.all pattern as admin.media.tsx's loader
    // -- getMemberBasics gives us member.timezone, which EventsEditor
    // needs to display/edit event times in the member's OWN business
    // timezone rather than whatever timezone the viewing browser happens
    // to be set to (see EventsEditor.tsx's TZDate usage).
    const [events, member] = await Promise.all([
      listEvents({ data: { memberId: context.memberId } }),
      getMemberBasics({ data: { memberId: context.memberId } }),
    ]);
    return { events, memberTimezone: member.timezone };
  },
  component: EventsRoute,
});

function EventsRoute() {
  const { events, memberTimezone } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return <EventsEditor memberId={memberId} initialEvents={events} memberTimezone={memberTimezone} />;
}
