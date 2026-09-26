import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

/**
 * Links & contact. The link pills read and save the draft's `links`
 * section. Phone, sales email and address are edited on Basics & hours
 * (plan Decision 2 moved phone and sales email into the `basics` section);
 * this page only shows them, from the same draft, with a pointer there.
 */
export const Route = createFileRoute("/admin/links")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => getMemberDraft({ data: { memberId: context.memberId } }),
  component: LinksRoute,
});

function LinksRoute() {
  const draft = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  const basics = draft.data.basics;
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
    <LinksContactEditor
      memberId={draft.member.id}
      initialLinks={draft.data.links.links}
      memberType={draft.member.member_type}
      contact={{
        phone: basics.phone,
        contactEmail: basics.contact_email,
        street: basics.street_address,
        city: basics.city,
        state: basics.state,
      }}
    />
    </SameMemberGuard>
  );
}
