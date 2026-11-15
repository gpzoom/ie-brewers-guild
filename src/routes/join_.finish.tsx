import { createFileRoute, redirect } from "@tanstack/react-router";
import { getJoinFinishState } from "@/lib/join/finish.server";
import { FinishForm } from "@/components/join/FinishForm";
import { InactiveApplicationCard } from "@/components/join/InactiveApplicationCard";
import { BrandBar } from "@/components/public-forms/PublicFormParts";

/**
 * /join/finish: Join the Guild, step 2 (the emailed draft link lands here
 * through /auth/confirm?...&next=/join/finish). `join_` keeps it out of the
 * /join route's layout -- /join is a single page with no Outlet.
 *
 * getJoinFinishState decides from the session, never from the URL:
 * signed out → /signin?next=/join/finish; an applicant → the form; a
 * declined applicant → "Your application isn't active"; anyone else →
 * /portal (Review Focus 5: never an editable form for a non-applicant).
 */
export const Route = createFileRoute("/join_/finish")({
  // Never reuse a previous visit's data: the draft changes as they edit.
  staleTime: 0,
  gcTime: 0,
  loader: async () => {
    const state = await getJoinFinishState();
    if (state.kind === "not-applicant") throw redirect({ to: "/portal" });
    return state;
  },
  head: () => ({
    meta: [
      { title: "Finish your profile — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JoinFinishPage,
});

function JoinFinishPage() {
  const state = Route.useLoaderData();
  if (state.kind === "form") return <FinishForm state={state} />;
  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[480px]">
        <BrandBar linkHome />
        <div className="mx-2.5 sm:mx-0 sm:mt-6">
          <InactiveApplicationCard />
        </div>
      </div>
    </div>
  );
}
