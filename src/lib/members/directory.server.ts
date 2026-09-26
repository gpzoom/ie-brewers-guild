import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDirectoryMembers,
  DIRECTORY_MEMBER_COLUMNS,
  type DirectoryLinkRow,
  type DirectoryMember,
  type DirectoryMemberRow,
} from "@/lib/members/directory";

/**
 * Every published member for the public /members page (map + cards).
 *
 * Reads with the ANON client on purpose, whoever is signed in: the
 * directory is the public view, so a Guild admin or a member browsing it
 * sees exactly what a visitor sees (RLS "public can read published rows",
 * plus the explicit status filter). Only columns in anon's column grant
 * are selected (see DIRECTORY_MEMBER_COLUMNS).
 */
export const getDirectoryMembers = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryMember[]> => {
    const supabase = await getSupabaseServerClient();

    const { data: memberData, error } = await supabase
      .from("members")
      .select(DIRECTORY_MEMBER_COLUMNS)
      .eq("status", "published")
      .order("business_name");
    if (error) throw new Error("Couldn't load the member directory.");
    const rows = (memberData ?? []) as unknown as DirectoryMemberRow[];
    if (rows.length === 0) return [];

    const memberIds = rows.map((row) => row.id);
    const logoAssetIds = [
      ...new Set(rows.map((row) => row.logo_asset_id).filter((id): id is string => Boolean(id))),
    ];

    const [linksResult, logosResult] = await Promise.all([
      supabase
        .from("member_links")
        .select("member_id, kind, label, url, sort_order")
        .in("member_id", memberIds),
      logoAssetIds.length
        ? // media_assets' own RLS decides readability (approved + referenced by a published logo).
          supabase.from("media_assets").select("id, storage_path").in("id", logoAssetIds)
        : Promise.resolve({ data: [] as Array<{ id: string; storage_path: string }> }),
    ]);

    const logoUrls = new Map<string, string>();
    for (const asset of (logosResult.data ?? []) as Array<{ id: string; storage_path: string }>) {
      logoUrls.set(
        asset.id,
        supabase.storage.from("member-logos").getPublicUrl(asset.storage_path).data.publicUrl,
      );
    }

    return buildDirectoryMembers({
      rows,
      links: (linksResult.data ?? []) as DirectoryLinkRow[],
      logoUrls,
    });
  },
);
