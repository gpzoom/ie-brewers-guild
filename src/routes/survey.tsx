import { createFileRoute } from "@tanstack/react-router";
import Questionnaire from "@/components/Questionnaire";

export const Route = createFileRoute("/survey")({
  head: () => ({
    meta: [
      { title: "Website Questionnaire — IE Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Questionnaire,
});
