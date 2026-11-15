import { createFileRoute } from "@tanstack/react-router";
import { JoinForm } from "@/components/join/JoinForm";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join the Guild — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content: "Apply to join the Inland Southern California Brewers Guild and see your member profile in seconds.",
      },
      { property: "og:title", content: "Join the Guild — Inland Southern California Brewers Guild" },
      { property: "og:description", content: "Apply to join the Guild and preview your member profile." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  return <JoinForm />;
}
