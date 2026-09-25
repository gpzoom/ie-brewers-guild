import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { getMemberEmail } from "@/lib/members/member-email.server";
import { listHours } from "@/lib/hours/hours-editor.server";
import { getMemberLogo } from "@/lib/media/logo.server";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { LogoUploader } from "@/components/admin/LogoUploader";

/**
 * "Basics & hours" -- one page (artboard AdminBasics; owner decision
 * 2026-09-25, docs/design/README.md). Basics fields, the logo, and weekly +
 * special hours all live here; /admin/hours now redirects to this page's
 * #hours section.
 */
export const Route = createFileRoute("/admin/basics")({
  loader: async ({ context }) => {
    // The sign-in email field only matters (and is only editable) while
    // impersonating -- see BasicsForm's own doc comment -- so it's only
    // fetched then, sparing an ordinary member's own page load an extra
    // service-role lookup it will never render.
    const [member, emailData, hoursData, logo] = await Promise.all([
      getMemberBasics({ data: { memberId: context.memberId } }),
      context.isImpersonating
        ? getMemberEmail({ data: { memberId: context.memberId } })
        : Promise.resolve(null),
      listHours({ data: { memberId: context.memberId } }),
      getMemberLogo({ data: { memberId: context.memberId } }),
    ]);
    return {
      member,
      email: emailData?.email ?? null,
      hours: hoursData.hours,
      specialHours: hoursData.specialHours,
      logoUrl: logo.logoUrl,
    };
  },
  component: BasicsRoute,
});

function BasicsRoute() {
  const { member, email, hours, specialHours, logoUrl } = Route.useLoaderData();
  const { memberId, isImpersonating } = Route.useRouteContext();
  return (
    <BasicsForm
      member={member}
      email={email}
      isImpersonating={isImpersonating}
      logo={<LogoUploader memberId={memberId} initialLogoUrl={logoUrl} />}
      hours={<HoursEditor memberId={memberId} hours={hours} specialHours={specialHours} />}
    />
  );
}
