import { createFileRoute } from "@tanstack/react-router";
import { getCategories } from "@/lib/categories/categories.server";
import { CategoriesEditor } from "@/components/guild/CategoriesEditor";
import type { CategoryMemberType } from "@/lib/supabase/types";

/** One Categories page with a tab per list: ?type=allied (default) or ?type=mobile. */
export const Route = createFileRoute("/guild/categories")({
  validateSearch: (search: Record<string, unknown>): { type?: CategoryMemberType } =>
    search.type === "mobile" ? { type: "mobile" } : {},
  loader: async () => getCategories(),
  component: CategoriesRoute,
});

function CategoriesRoute() {
  const categories = Route.useLoaderData();
  const { type } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CategoriesEditor
      categories={categories}
      tab={type ?? "allied"}
      onTabChange={(next) => navigate({ search: next === "mobile" ? { type: next } : {} })}
    />
  );
}
