import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { DiscountEditor } from "@/components/admin/DiscountEditor";

export const Route = createFileRoute("/admin/discount")({
  loader: async ({ context }) => getMemberBasics({ data: { memberId: context.memberId } }),
  component: DiscountRoute,
});

function DiscountRoute() {
  const member = Route.useLoaderData();
  return <DiscountEditor member={member} />;
}
