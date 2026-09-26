import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { DiscountEditor } from "@/components/admin/DiscountEditor";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

/** The Allied Member discount -- reads and saves the draft's `discount` section. */
export const Route = createFileRoute("/admin/discount")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => getMemberDraft({ data: { memberId: context.memberId } }),
  component: DiscountRoute,
});

function DiscountRoute() {
  const draft = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
      <DiscountEditor
        memberId={draft.member.id}
        memberType={draft.member.member_type}
        discount={draft.data.discount}
      />
    </SameMemberGuard>
  );
}
