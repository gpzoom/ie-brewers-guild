import { createFileRoute } from "@tanstack/react-router";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { getMemberEmail } from "@/lib/members/member-email.server";
import { BasicsForm } from "@/components/admin/BasicsForm";

export const Route = createFileRoute("/admin/basics")({
  loader: async ({ context }) => {
    // The sign-in email field only matters (and is only editable) while
    // impersonating -- see BasicsForm's own doc comment -- so it's only
    // fetched then, sparing an ordinary member's own page load an extra
    // service-role lookup it will never render.
    const [member, emailData] = await Promise.all([
      getMemberBasics({ data: { memberId: context.memberId } }),
      context.isImpersonating
        ? getMemberEmail({ data: { memberId: context.memberId } })
        : Promise.resolve(null),
    ]);
    return { member, email: emailData?.email ?? null };
  },
  component: BasicsRoute,
});

function BasicsRoute() {
  const { member, email } = Route.useLoaderData();
  const { isImpersonating } = Route.useRouteContext();
  return <BasicsForm member={member} email={email} isImpersonating={isImpersonating} />;
}
