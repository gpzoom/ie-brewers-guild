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
