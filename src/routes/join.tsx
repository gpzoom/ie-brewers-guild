import { Link, createFileRoute } from "@tanstack/react-router";
import { JoinForm } from "@/components/join/JoinForm";
import { CanvasCard, CanvasHeading, cardLinkClass, leadClass } from "@/components/public-forms/PublicFormParts";
import { getJoinAvailability } from "@/lib/join/join.server";

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
  // Ruling R11: Join is open only when the JOIN_OPEN Worker var is "true".
  // A failed check shows the closed page rather than an error.
  loader: async () => {
    try {
      return await getJoinAvailability();
    } catch {
      return { open: false };
    }
  },
  component: JoinPage,
});

function JoinPage() {
  const { open } = Route.useLoaderData();
  return open ? <JoinForm /> : <JoinClosed />;
}

function JoinClosed() {
  return (
    <section className="bg-bg px-2.5 pb-16 pt-6 font-sans sm:px-6 sm:pb-24 sm:pt-12">
      <div className="mx-auto w-full max-w-[640px]">
        <CanvasCard className="gap-[18px]">
          <div className="flex flex-col gap-[9px]">
            <CanvasHeading>Join the Guild</CanvasHeading>
            <p className={leadClass}>
              Joining online isn't open yet. Please{" "}
              <Link to="/contact" className={cardLinkClass}>
                contact us
              </Link>
              .
            </p>
          </div>
        </CanvasCard>
      </div>
    </section>
  );
}
