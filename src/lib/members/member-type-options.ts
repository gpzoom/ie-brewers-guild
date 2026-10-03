import type { MemberType } from "@/lib/supabase/types";

/**
 * The three member types as members see them: artboard AdminBasics's
 * MEMBER TYPE cards. Shared by BasicsForm and the wizard's Confirm your
 * member type step, so both describe the types in the same words.
 */
export const MEMBER_TYPE_OPTIONS: { value: MemberType; title: string; description: string }[] = [
  {
    value: "producer",
    title: "Producer with a taproom",
    description:
      "Brewery, meadery, cidery or distillery the public can visit. Shows weekly hours, an open-now status and directions.",
  },
  {
    value: "mobile",
    title: "Mobile member",
    description:
      "Entertainment, food truck or pop-up. Shows an appearance calendar and a booking button instead of hours.",
  },
  {
    value: "allied",
    title: "Allied Member",
    description:
      "Supply house, ingredients, equipment or services. Same layout as a producer, with business hours and a trade contact.",
  },
];

/** Short names for a type, for emails and small labels. */
export const MEMBER_TYPE_SHORT_LABEL: Record<MemberType, string> = {
  producer: "Producer",
  mobile: "Mobile member",
  allied: "Allied Member",
};
