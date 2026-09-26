import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { getMemberEmail } from "@/lib/members/member-email.server";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

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
    const [draft, emailData] = await Promise.all([
      getMemberDraft({ data: { memberId: context.memberId } }),
      context.isImpersonating
        ? getMemberEmail({ data: { memberId: context.memberId } })
        : Promise.resolve(null),
    ]);
    return { draft, email: emailData?.email ?? null };
  },
  component: BasicsRoute,
});

function BasicsRoute() {
  const { draft, email } = Route.useLoaderData();
  const { memberId, isImpersonating } = Route.useRouteContext();
  const basics = draft.data.basics;
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
    <BasicsForm
      memberId={memberId}
      memberType={draft.member.member_type}
      typeConfirmed={draft.member.type_confirmed_at !== null}
      basics={basics}
      email={email}
      isImpersonating={isImpersonating}
      logo={
        <LogoUploader
          memberId={memberId}
          initialLogoUrl={draft.logoUrl}
          initialBackground={basics.logo_background}
          theme={draft.data.theme.theme}
          businessName={basics.business_name}
        />
      }
      hours={
        <HoursEditor memberId={memberId} hours={basics.hours} specialHours={basics.special_hours} />
      }
    />
    </SameMemberGuard>
  );
}
