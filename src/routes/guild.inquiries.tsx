import { createFileRoute } from "@tanstack/react-router";
import { getInquiries, type InquiryFilter } from "@/lib/guild/inquiries.server";
import { InquiriesTable } from "@/components/guild/InquiriesTable";

export const Route = createFileRoute("/guild/inquiries")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (search.filter as InquiryFilter | undefined) ?? "open",
  }),
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ deps }) => getInquiries({ data: { filter: deps.filter } }),
  component: InquiriesRoute,
});

function InquiriesRoute() {
  const inquiries = Route.useLoaderData();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <InquiriesTable
      inquiries={inquiries}
      filter={filter}
      onFilterChange={(next) => navigate({ search: { filter: next } })}
    />
  );
}
