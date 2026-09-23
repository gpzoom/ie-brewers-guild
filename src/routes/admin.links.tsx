import { createFileRoute } from "@tanstack/react-router";
import { getMemberContactInfo, listMemberLinks } from "@/lib/links/member-links.server";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";

export const Route = createFileRoute("/admin/links")({
  loader: async ({ context }) => {
    // getMemberContactInfo, not the Basics editor's getMemberBasics --
    // BasicsMember doesn't carry phone/contact_email at all (Decision 8
    // keeps those out of Basics on purpose), so getMemberBasics's result
    // has no `.phone`/`.contact_email` to read here. See
    // member-links.server.ts's MemberContactInfo doc comment.
    const [links, member] = await Promise.all([
      listMemberLinks({ data: { memberId: context.memberId } }),
      getMemberContactInfo({ data: { memberId: context.memberId } }),
    ]);
    return { links, member };
  },
  component: LinksRoute,
});

function LinksRoute() {
  const { links, member } = Route.useLoaderData();
  return (
    <LinksContactEditor
      memberId={member.id}
      initialLinks={links}
      phone={member.phone}
      contactEmail={member.contact_email}
      memberType={member.member_type}
    />
  );
}
