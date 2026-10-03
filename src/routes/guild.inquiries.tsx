import { createFileRoute } from "@tanstack/react-router";
import { getInquiries, type InquiryFilter } from "@/lib/guild/inquiries.server";
import { getOpenSupportRequests } from "@/lib/guild/support-requests.server";
import { InquiriesTable } from "@/components/guild/InquiriesTable";
import { MemberRequests } from "@/components/guild/MemberRequests";

export const Route = createFileRoute("/guild/inquiries")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (search.filter as InquiryFilter | undefined) ?? "open",
  }),
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ deps }) => {
    const [inquiries, memberRequests] = await Promise.all([
      getInquiries({ data: { filter: deps.filter } }),
      getOpenSupportRequests(),
    ]);
    return { inquiries, memberRequests };
  },
  component: InquiriesRoute,
});

function InquiriesRoute() {
  const { inquiries, memberRequests } = Route.useLoaderData();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <InquiriesTable
      // Remount per filter so the newest inquiry in each view opens expanded.
      key={filter}
      inquiries={inquiries}
      filter={filter}
      onFilterChange={(next) => navigate({ search: { filter: next } })}
      memberRequests={<MemberRequests requests={memberRequests} />}
    />
  );
}
