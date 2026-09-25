import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { DiscountEditor } from "@/components/admin/DiscountEditor";

/** The Allied Member discount -- reads and saves the draft's `discount` section. */
export const Route = createFileRoute("/admin/discount")({
  loader: async ({ context }) => getMemberDraft({ data: { memberId: context.memberId } }),
  component: DiscountRoute,
});

function DiscountRoute() {
  const draft = Route.useLoaderData();
  return (
    <DiscountEditor
      memberId={draft.member.id}
      memberType={draft.member.member_type}
      discount={draft.data.discount}
    />
  );
}
