import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import type { CategoryMemberType, CategoryRow } from "@/lib/supabase/types";

const CATEGORY_MEMBER_TYPES: readonly CategoryMemberType[] = ["allied", "mobile"];

export const getCategories = createServerFn({ method: "GET" }).handler(async (): Promise<CategoryRow[]> => {
  const supabase = await getSupabaseServerClientForRequest();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("member_type")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
});

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; sortOrder: number; memberType: CategoryMemberType }) => {
    if (!CATEGORY_MEMBER_TYPES.includes(data?.memberType)) throw new Error("Choose Allied or Mobile.");
    return data;
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("categories").insert({
      name: data.name,
      slug: slugify(data.name),
      sort_order: data.sortOrder,
      member_type: data.memberType,
    });
    // Names are unique across both lists.
    if (error?.code === "23505") throw new Error(`There's already a category called "${data.name}".`);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string; sortOrder: number }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("categories")
      .update({ name: data.name, slug: slugify(data.name), sort_order: data.sortOrder })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
