import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

/** Theme -- reads and saves the draft's `theme` section; the preview card uses the draft's basics. */
export const Route = createFileRoute("/admin/theme")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => getMemberDraft({ data: { memberId: context.memberId } }),
  component: ThemeRoute,
});

function ThemeRoute() {
  const draft = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  const basics = draft.data.basics;
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={draft.member.id}>
      <ThemePicker
        memberId={draft.member.id}
        currentTheme={draft.data.theme.theme}
        businessName={basics.business_name}
        city={basics.city}
        state={basics.state}
        tagline={basics.tagline}
      />
    </SameMemberGuard>
  );
}
