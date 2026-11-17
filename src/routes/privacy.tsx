import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicy } from "@/components/site/PrivacyPolicy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content:
          "What the Inland Southern California Brewers Guild collects on its website, how it's used, and your choices.",
      },
    ],
  }),
  component: PrivacyPolicy,
});
