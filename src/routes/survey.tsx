import { createFileRoute } from "@tanstack/react-router";
import Questionnaire from "@/components/Questionnaire";

export const Route = createFileRoute("/survey")({
  head: () => ({
    meta: [
      { title: "Website Questionnaire — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Questionnaire,
});
