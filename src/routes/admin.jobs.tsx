import { createFileRoute } from "@tanstack/react-router";
import { listMemberJobs } from "@/lib/jobs/jobs.server";
import { JobsEditor } from "@/components/admin/JobsEditor";

/**
 * Jobs (every member type; docs/member-profiles.md, "Jobs board"; artboard
 * CC1). The same editor as the portal's Jobs section. Not drafted -- like
 * the Food calendar, a save is live straight away.
 */
export const Route = createFileRoute("/admin/jobs")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => ({
    jobs: await listMemberJobs({ data: { memberId: context.memberId } }),
  }),
  component: JobsRoute,
});

function JobsRoute() {
  const { jobs } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  // Keyed by member: Edit as them switching members must start fresh.
  return <JobsEditor key={memberId} memberId={memberId} initialJobs={jobs} />;
}
