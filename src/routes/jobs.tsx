import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import heroImg from "@/assets/pillar-education.jpg";

/** Jobs (owner, 2026-10-19): a "Coming soon" page until members can post jobs. */
export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content: "Job postings from Inland Southern California Brewers Guild members are coming soon. Check back often.",
      },
      { property: "og:title", content: "Jobs — Inland Southern California Brewers Guild" },
      { property: "og:description", content: "Members' job postings, coming soon." },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  return (
    <PageHero
      image={heroImg}
      eyebrow="Jobs"
      title="Coming soon."
      subtitle="Job postings from our members will be published here, so check back often."
      minHeight="min-h-[70vh]"
    />
  );
}
