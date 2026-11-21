import { logoBackgroundColor } from "@/lib/members/logo-background";
import type { MemberThemeName } from "@/lib/theme/member-themes";

/** The member's branding for the Scan Pass print kit (spec 2026-11-21). */
export type PrintKitInfo = {
  memberName: string;
  memberSlug: string;
  trailStop: boolean;
  logoUrl: string | null;
  /** The same tile color as the profile and directory (shared logoBackgroundColor). */
  logoTileColor: string;
};

/** The slice of the Supabase client the logo lookup uses (the real client fits it). */
type LogoClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> };
      };
    };
  };
  storage: { from: (bucket: string) => { getPublicUrl: (path: string) => { data: { publicUrl: string } } } };
};

/**
 * Public URL of the member's logo, only if the Guild approved it -- the same
 * rule the public profile pages follow. A rejected or pending logo prints as
 * name only.
 */
export async function approvedLogoUrl(client: LogoClient, assetId: string | null): Promise<string | null> {
  if (!assetId) return null;
  const { data } = await client.from("media_assets").select("storage_path").eq("id", assetId).eq("review_status", "approved").maybeSingle();
  const path = (data as { storage_path?: string } | null)?.storage_path;
  return path ? client.storage.from("member-logos").getPublicUrl(path).data.publicUrl : null;
}

export function printKitInfoFromRow(
  row: { business_name: string; slug: string; logo_background: string | null; theme: string },
  trailStop: boolean,
  logoUrl: string | null,
): PrintKitInfo {
  return {
    memberName: row.business_name,
    memberSlug: row.slug,
    trailStop,
    logoUrl,
    logoTileColor: logoBackgroundColor(row.logo_background, row.theme as MemberThemeName),
  };
}
