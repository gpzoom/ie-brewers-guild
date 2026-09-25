import { createFileRoute } from "@tanstack/react-router";
import { getMemberContactInfo, listMemberLinks } from "@/lib/links/member-links.server";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";

export const Route = createFileRoute("/admin/links")({
  loader: async ({ context }) => {
    // getMemberContactInfo, not the Basics editor's getMemberBasics --
    // BasicsMember doesn't carry phone/contact_email at all (Decision 8
    // keeps those out of Basics on purpose), so getMemberBasics's result
    // has no `.phone`/`.contact_email` to read here. See
    // member-links.server.ts's MemberContactInfo doc comment.
    //
    // getMemberBasics is loaded too, read-only, only so the Contact section
    // can SHOW the street address (artboard R puts it here). Its one
    // editor stays on Basics & hours; this page links there.
    const [links, member, basics] = await Promise.all([
      listMemberLinks({ data: { memberId: context.memberId } }),
      getMemberContactInfo({ data: { memberId: context.memberId } }),
      getMemberBasics({ data: { memberId: context.memberId } }),
    ]);
    return {
      links,
      member,
      address: { street: basics.street_address, city: basics.city, state: basics.state },
    };
  },
  component: LinksRoute,
});

function LinksRoute() {
  const { links, member, address } = Route.useLoaderData();
  return (
    <LinksContactEditor
      memberId={member.id}
      initialLinks={links}
      phone={member.phone}
      contactEmail={member.contact_email}
      memberType={member.member_type}
      address={address}
    />
  );
}
