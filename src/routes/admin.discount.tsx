import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { getCategories } from "@/lib/categories/categories.server";
import { DiscountEditor } from "@/components/admin/DiscountEditor";
import { SupplyCategoriesPicker } from "@/components/admin/SupplyCategoriesPicker";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

/**
 * The Affiliate Member discount plus "What you supply" (plan Decision 8) --
 * reads and saves the draft's `discount` section, the same editors as the
 * portal's Discount & supplies section. Any number of categories can be
 * picked.
 */
export const Route = createFileRoute("/admin/discount")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => {
    const [draft, categories] = await Promise.all([
      getMemberDraft({ data: { memberId: context.memberId } }),
      getCategories(),
    ]);
    return { draft, categories };
  },
  component: DiscountRoute,
});

function DiscountRoute() {
  const { draft, categories } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
      <DiscountEditor
        memberId={draft.member.id}
        memberType={draft.member.member_type}
        discount={draft.data.discount}
      >
        {draft.member.member_type === "allied" && (
          <SupplyCategoriesPicker
            memberId={draft.member.id}
            categories={categories}
            initialCategoryIds={draft.data.discount.category_ids}
          />
        )}
      </DiscountEditor>
    </SameMemberGuard>
  );
}
