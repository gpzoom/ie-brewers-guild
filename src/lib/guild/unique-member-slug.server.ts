import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/slug";
import { pickUnusedSlug } from "@/lib/guild/unique-member-slug";

/**
 * Queries the live members table for anything starting with the candidate
 * base slug, then hands the collision-suffix decision to pickUnusedSlug.
 * Callers must use a client whose RLS scope can read every member's slug
 * regardless of status -- in practice this is only ever called by
 * guild-admin-only mutations, where the session-bound client already has
 * that access via "members: guild admins can read every row".
 */
export async function generateUniqueMemberSlug(
  supabase: SupabaseClient,
  businessName: string,
): Promise<string> {
  const base = slugify(businessName);
  const { data, error } = await supabase.from("members").select("slug").ilike("slug", `${base}%`);
  if (error) throw new Error(error.message);
  const existingSlugs = (data ?? []).map((row) => row.slug as string);
  return pickUnusedSlug(base, existingSlugs);
}
