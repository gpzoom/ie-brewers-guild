import { createFileRoute } from "@tanstack/react-router";
import { TermsOfUse } from "@/components/site/TermsOfUse";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content:
          "The terms for using the Inland Southern California Brewers Guild website and member directory.",
      },
    ],
  }),
  component: TermsOfUse,
});
