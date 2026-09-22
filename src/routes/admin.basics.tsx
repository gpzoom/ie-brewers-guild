import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { BasicsForm } from "@/components/admin/BasicsForm";

export const Route = createFileRoute("/admin/basics")({
  loader: async ({ context }) => getMemberBasics({ data: { memberId: context.memberId } }),
  component: BasicsRoute,
});

function BasicsRoute() {
  const member = Route.useLoaderData();
  return <BasicsForm member={member} />;
}
