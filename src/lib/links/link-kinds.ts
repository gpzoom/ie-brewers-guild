import type { MemberLinkKind } from "@/lib/supabase/types";

/**
 * Every link button kind, in the order the Links editor offers them
 * (matches member_links.kind's check). instagram_dm and whatsapp are
 * Mobile members' booking links (src/lib/links/booking-links.ts).
 */
export const LINK_KINDS: MemberLinkKind[] = [
  "website",
  "instagram",
  "facebook",
  "tiktok",
  "taplist",
  "menu",
  "press_kit",
  "catalog",
  "instagram_dm",
  "whatsapp",
  "other",
];
