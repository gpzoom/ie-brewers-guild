import { createFileRoute } from "@tanstack/react-router";
import { getMemberDraft } from "@/lib/drafts/drafts.server";
import { ThemePicker } from "@/components/admin/ThemePicker";

/** Theme -- reads and saves the draft's `theme` section; the preview card uses the draft's basics. */
export const Route = createFileRoute("/admin/theme")({
  loader: async ({ context }) => getMemberDraft({ data: { memberId: context.memberId } }),
  component: ThemeRoute,
});

function ThemeRoute() {
  const draft = Route.useLoaderData();
  const basics = draft.data.basics;
  return (
    <ThemePicker
      memberId={draft.member.id}
      currentTheme={draft.data.theme.theme}
      businessName={basics.business_name}
      city={basics.city}
      state={basics.state}
      tagline={basics.tagline}
    />
  );
}
