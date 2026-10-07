import type { MemberType } from "@/lib/supabase/types";
import { MEMBER_TYPE_SHORT_LABEL } from "@/lib/members/member-type-options";

/** The guide's type colors (Producer orange, Mobile teal, Affiliate blue). */
const TAG_COLORS: Record<MemberType, { bg: string; fg: string }> = {
  producer: { bg: "#F5E2D0", fg: "#7A4413" },
  mobile: { bg: "#DCEDEC", fg: "#17605F" },
  allied: { bg: "#E6E3F3", fg: "#3B4B9A" },
};

/**
 * Which member type a wizard screen is for, large enough to spot in a
 * screenshot (owner, 2026-10-02). Replaces the small grey label.
 */
export function MemberTypeTag({ memberType }: { memberType: MemberType }) {
  const { bg, fg } = TAG_COLORS[memberType];
  return (
    <span
      className="inline-flex h-[30px] shrink-0 items-center gap-[7px] rounded-full px-3.5 text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: fg }} aria-hidden="true" />
      {MEMBER_TYPE_SHORT_LABEL[memberType]}
    </span>
  );
}
