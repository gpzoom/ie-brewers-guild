import { createFileRoute, redirect } from "@tanstack/react-router";
import { isTapCardTab, type TapCardTab } from "@/components/guild/tap-card/TapCardTabs";

type Search = { tab?: TapCardTab; show?: "all"; year?: number };

/**
 * The Inland Tap Card was renamed the Inland Scan Pass (2026-11-20). This
 * route stays only so old links and bookmarks (and emails already sent with
 * /guild/tap-card?tab=offers) land on /guild/scan-pass, keeping the tab.
 */
export const Route = createFileRoute("/guild/tap-card")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(isTapCardTab(search.tab) && search.tab !== "offers" ? { tab: search.tab } : {}),
    ...(search.show === "all" ? { show: "all" as const } : {}),
    ...(typeof search.year === "number" && Number.isInteger(search.year) ? { year: search.year } : {}),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/guild/scan-pass", search, replace: true });
  },
});
