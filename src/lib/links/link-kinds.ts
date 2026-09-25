import type { MemberLinkKind } from "@/lib/supabase/types";

/** Every link pill kind, in the order the Links editor offers them (matches member_links.kind's check). */
export const LINK_KINDS: MemberLinkKind[] = [
  "website",
  "instagram",
  "facebook",
  "tiktok",
  "taplist",
  "menu",
  "press_kit",
  "catalog",
  "other",
];
