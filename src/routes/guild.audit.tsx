import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuditLog, type AuditFilter } from "@/lib/guild/audit-log-view.server";
import { AuditLogScreen } from "@/components/guild/AuditLogScreen";

/**
 * /guild/audit: super admin only (docs/member-profiles.md, "Super admin").
 * Filters live in the URL (?member=&person=&from=&to=) so a filtered view
 * can be reloaded or shared with yourself. A Guild admin is sent to the
 * roster; the loader checks again on the server, and audit_log's select
 * policy refuses anyone else in the database.
 */
type AuditSearch = { member?: string; person?: string; from?: string; to?: string };

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export const Route = createFileRoute("/guild/audit")({
  validateSearch: (search: Record<string, unknown>): AuditSearch => ({
    member: text(search.member),
    person: text(search.person),
    from: text(search.from),
    to: text(search.to),
  }),
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/guild/roster" });
  },
  loaderDeps: ({ search }) => search,
  staleTime: 0,
  loader: ({ deps }) =>
    getAuditLog({
      data: { memberId: deps.member, actorUserId: deps.person, from: deps.from, to: deps.to },
    }),
  component: AuditRoute,
});

function AuditRoute() {
  const view = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter: AuditFilter = {
    memberId: search.member,
    actorUserId: search.person,
    from: search.from,
    to: search.to,
  };
  return (
    <AuditLogScreen
      // Remount when the URL's filter changes so the form shows it.
      key={JSON.stringify(filter)}
      view={view}
      filter={filter}
      onFilterChange={(next) =>
        navigate({
          search: { member: next.memberId, person: next.actorUserId, from: next.from, to: next.to },
        })
      }
    />
  );
}
