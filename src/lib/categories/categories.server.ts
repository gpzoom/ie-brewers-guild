import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import type { CategoryRow } from "@/lib/supabase/types";

export const getCategories = createServerFn({ method: "GET" }).handler(async (): Promise<CategoryRow[]> => {
  const supabase = await getSupabaseServerClientForRequest();
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
});

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; sortOrder: number }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("categories")
      .insert({ name: data.name, slug: slugify(data.name), sort_order: data.sortOrder });
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
