import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { ThemePicker } from "@/components/admin/ThemePicker";

export const Route = createFileRoute("/admin/theme")({
  loader: async ({ context }) => getMemberBasics({ data: { memberId: context.memberId } }),
  component: ThemeRoute,
});

function ThemeRoute() {
  const member = Route.useLoaderData();
  return <ThemePicker memberId={member.id} currentTheme={member.theme} />;
}
