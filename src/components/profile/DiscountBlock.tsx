import type { MemberRow } from "@/lib/supabase/types";

type DiscountBlockProps = {
  member: MemberRow;
};

/**
 * Allied Member only. Renders large, in `--brand` with white text --
 * never `--brand-bright` (spec, "Allied Member discount": "The block
 * uses --brand, the deeper amber, because it carries white text. Never
 * build it on --brand-bright."). Omitted entirely when no discount is
 * set (spec, "Empty and error states"). Look: artboard V.
 */
export function DiscountBlock({ member }: DiscountBlockProps) {
  if (member.member_type !== "allied") return null;
  if (!member.discount_no_fixed_percent && member.discount_percent == null) return null;

  return (
    <div className="flex flex-col gap-[7px] rounded-2xl bg-brand px-[18px] py-5 text-white lg:rounded-[18px] lg:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Guild member benefit</p>
      {member.discount_no_fixed_percent ? (
        // Spec: "Discounts available to members in good standing" at the
        // same visual weight -- a smaller size so the longer sentence
        // doesn't run to four lines on a phone.
        <p className="font-display text-[26px] leading-[1.1]">Discounts available to members in good standing</p>
      ) : (
        <>
          <p className="font-display text-[40px] leading-none">{member.discount_percent}% off</p>
          <p className="text-[15px] font-semibold">for members in good standing</p>
        </>
      )}
      {member.discount_redeem_text && <p className="text-pretty text-xs">{member.discount_redeem_text}</p>}
    </div>
  );
}
