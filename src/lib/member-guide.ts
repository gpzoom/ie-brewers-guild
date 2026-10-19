import type { MemberType } from "@/lib/supabase/types";

/**
 * The Member Guide, one PDF per member type, served from public/ (owner,
 * 2026-10-17; before that a single combined guide). Copies of
 * docs/member-guide/ISC-Brewers-Guild-Member-Guide-{Producer,Mobile,Affiliate}.pdf:
 * after rebuilding the guides (npm run build:guides), they are written to
 * both places (member-guide.test.ts fails until the copies match). Public on
 * purpose -- they hold only sample members, and the Guild can send a link to
 * someone who hasn't joined yet.
 *
 * "allied" is the stored value for Affiliate Members, so its file is named
 * "affiliate".
 */
const GUIDE_FILE: Record<MemberType, string> = {
  producer: "producer",
  mobile: "mobile",
  allied: "affiliate",
};

/** The public path of the guide for this member type. */
export function memberGuidePath(type: MemberType): string {
  return `/member-guide-${GUIDE_FILE[type]}.pdf`;
}

/**
 * All three, in display order, for places that offer every guide (the
 * sign-in page lists them one per line, owner's wording 2026-10-19).
 */
export const MEMBER_GUIDES: readonly { type: MemberType; label: string; description: string; path: string }[] = [
  { type: "producer", label: "Producers", description: "alcohol producers with a taproom", path: memberGuidePath("producer") },
  {
    type: "mobile",
    label: "Mobile",
    description: "such as entertainment, food trucks or pop-up vendors",
    path: memberGuidePath("mobile"),
  },
  {
    type: "allied",
    label: "Affiliate",
    description: "industry partners such as suppliers and service providers",
    path: memberGuidePath("allied"),
  },
];
