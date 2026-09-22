import type { MemberRow } from "@/lib/supabase/types";

type DiscountBlockProps = {
  member: MemberRow;
};

/**
 * Allied Member only. Renders large, in `--brand` with white text --
 * never `--brand-bright` (spec, "Allied Member discount": "The block
 * uses --brand, the deeper amber, because it carries white text. Never
 * build it on --brand-bright."). Omitted entirely when no discount is
 * set (spec, "Empty and error states").
 */
export function DiscountBlock({ member }: DiscountBlockProps) {
  if (member.member_type !== "allied") return null;
  if (!member.discount_no_fixed_percent && member.discount_percent == null) return null;

  return (
    <div className="rounded-inset bg-brand px-4 py-4 text-white">
      <p className="font-display text-2xl">
        {member.discount_no_fixed_percent ? "Discounts available to members in good standing" : `${member.discount_percent}% off`}
      </p>
      {!member.discount_no_fixed_percent && <p className="text-sm text-white/85">for members in good standing</p>}
      {member.discount_redeem_text && <p className="mt-1 text-sm text-white/85">{member.discount_redeem_text}</p>}
    </div>
  );
}
