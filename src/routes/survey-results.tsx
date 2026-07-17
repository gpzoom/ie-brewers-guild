import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/survey-results")({
  head: () => ({
    meta: [
      { title: "Survey Results — IE Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SurveyResults,
});

function SurveyResults() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-4xl">
        <div style={{ padding: "56.25% 0 0 0", position: "relative", width: "100%" }}>
          <iframe
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
            allowFullScreen
            frameBorder="0"
            referrerPolicy="strict-origin-when-cross-origin"
            src="https://livid.com/embed/PQiylruf4AlM"
            title="iebg_questionnaire_findings"
          />
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
