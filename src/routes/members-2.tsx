import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateDirectorySearch } from "@/lib/directory/search-params";

/** The trial address of the new Members page; it's /members now (5 October 2026). */
export const Route = createFileRoute("/members-2")({
  validateSearch: validateDirectorySearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/members", search, statusCode: 301 });
  },
});
