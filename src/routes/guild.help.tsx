import { createFileRoute, redirect } from "@tanstack/react-router";
import { getHelpMessages } from "@/lib/guild/help-messages.server";
import { parseHelpMessageShow, type HelpMessageShow } from "@/lib/guild/help-messages";
import { HelpMessagesScreen } from "@/components/guild/HelpMessagesScreen";

/**
 * /guild/help: super admin only (docs/member-profiles.md, "Help button").
 * The top bar's bell and the sidebar link open it on ?show=waiting. A
 * Guild admin is sent to the roster; the loader checks again on the
 * server, and support_messages' select policy refuses anyone else.
 */
export const Route = createFileRoute("/guild/help")({
  validateSearch: (search: Record<string, unknown>): { show?: HelpMessageShow } => ({
    show: search.show === undefined ? undefined : parseHelpMessageShow(search.show),
  }),
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/guild/roster" });
  },
  loaderDeps: ({ search }) => ({ show: parseHelpMessageShow(search.show) }),
  staleTime: 0,
  loader: ({ deps }) => getHelpMessages({ data: { show: deps.show } }),
  component: HelpRoute,
});

function HelpRoute() {
  const page = Route.useLoaderData();
  const { show } = Route.useLoaderDeps();
  return <HelpMessagesScreen page={page} show={show} />;
}
