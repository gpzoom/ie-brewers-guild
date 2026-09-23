import { createFileRoute } from "@tanstack/react-router";
import { getCategories } from "@/lib/categories/categories.server";
import { CategoriesEditor } from "@/components/guild/CategoriesEditor";

export const Route = createFileRoute("/guild/categories")({
  loader: async () => getCategories(),
  component: CategoriesRoute,
});

function CategoriesRoute() {
  const categories = Route.useLoaderData();
  return <CategoriesEditor categories={categories} />;
}
