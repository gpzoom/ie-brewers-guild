import { createFileRoute } from "@tanstack/react-router";
import { listHours } from "@/lib/hours/hours-editor.server";
import { HoursEditor } from "@/components/admin/HoursEditor";

export const Route = createFileRoute("/admin/hours")({
  loader: async ({ context }) => listHours({ data: { memberId: context.memberId } }),
  component: HoursRoute,
});

function HoursRoute() {
  const { hours, specialHours } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return <HoursEditor memberId={memberId} hours={hours} specialHours={specialHours} />;
}
