import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { getMemberEmail } from "@/lib/members/member-email.server";
import { getCategories } from "@/lib/categories/categories.server";
import { SupplyCategoriesPicker } from "@/components/admin/SupplyCategoriesPicker";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";
import { FillFromGooglePanel, type FillSummary } from "@/components/admin/basics/FillFromGooglePanel";

/**
 * "Basics & hours" -- one page (artboard AdminBasics; owner decision
 * 2026-09-25, docs/design/README.md). Basics fields, phone and sales email
 * (plan Decision 2), the logo, and weekly + special hours all live here;
 * /admin/hours redirects to this page's #hours section.
 *
 * Everything on it reads from and saves to the member's DRAFT (the
 * `basics` section) except member type, which isn't drafted.
 */
export const Route = createFileRoute("/admin/basics")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => {
    // The sign-in email field only matters (and is only editable) while
    // impersonating -- see BasicsForm's own doc comment -- so it's only
    // fetched then.
    const [draft, emailData, categories] = await Promise.all([
      getMemberDraft({ data: { memberId: context.memberId } }),
      context.isImpersonating
        ? getMemberEmail({ data: { memberId: context.memberId } })
        : Promise.resolve(null),
      getCategories(),
    ]);
    return { draft, email: emailData?.email ?? null, categories };
  },
  component: BasicsRoute,
});

function BasicsRoute() {
  const { draft, email, categories } = Route.useLoaderData();
  const { memberId, isImpersonating, isSuperAdmin } = Route.useRouteContext();
  const basics = draft.data.basics;
  const router = useRouter();
  // Only Guild admins can reach /admin for a member they aren't linked to
  // ("Edit as them"), so impersonating means the viewer is a Guild admin.
  const isGuildAdmin = isImpersonating;
  const [fillSummary, setFillSummary] = useState<FillSummary | null>(null);
  // Bumped after a fill so the form remounts with the reloaded draft values
  // (its inputs keep their own local copies).
  const [fillVersion, setFillVersion] = useState(0);
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
    <BasicsForm
      key={fillVersion}
      memberId={memberId}
      memberType={draft.member.member_type}
      typeConfirmed={draft.member.type_confirmed_at !== null}
      basics={basics}
      email={email}
      isImpersonating={isImpersonating}
      googleFill={
        isGuildAdmin ? (
          <FillFromGooglePanel
            memberId={memberId}
            businessName={basics.business_name}
            city={basics.city}
            summary={fillSummary}
            onFilled={async (summary) => {
              setFillSummary(summary);
              await router.invalidate();
              setFillVersion((v) => v + 1);
            }}
          />
        ) : null
      }
      canChangeSignInEmail={isSuperAdmin}
      categories={
        draft.member.member_type === "mobile" && (
          <SupplyCategoriesPicker
            memberId={memberId}
            memberType="mobile"
            categories={categories}
            initialCategoryIds={draft.data.discount.category_ids}
          />
        )
      }
      hours={
        <HoursEditor memberId={memberId} hours={basics.hours} specialHours={basics.special_hours} />
      }
    />
    </SameMemberGuard>
  );
}
