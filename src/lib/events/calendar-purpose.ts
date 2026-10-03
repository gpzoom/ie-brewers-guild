import type { CalendarPurpose, MemberType } from "@/lib/supabase/types";

/**
 * A member's calendars (docs/member-profiles.md, "Events" > "Food
 * calendar"): every member can connect an events calendar; a producer can
 * also connect a food calendar, with its own link and its own tag. No I/O.
 */

export function parseCalendarPurpose(value: unknown): CalendarPurpose {
  return value === "food" ? "food" : "events";
}

/** Only producers get the food calendar (taprooms are where food trucks park). */
export function canHaveFoodCalendar(memberType: MemberType | null | undefined): boolean {
  return memberType === "producer";
}

/**
 * A sync tag as it's saved: trimmed, with exactly one "#" in front ("food"
 * and "##food" both become "#food"), so a plain word in an event can never
 * count as the tag. Blank stays "".
 */
export function canonicalTag(tag: string | null | undefined): string {
  const bare = (tag ?? "").trim().replace(/^#+/, "").trim();
  return bare ? `#${bare}` : "";
}

function normalizeTag(tag: string | null | undefined): string {
  return (tag ?? "").trim().replace(/^#+/, "").toLowerCase();
}

/**
 * Why a food calendar can't be saved as given, or null when it can. The tag
 * has to differ from the events calendar's, or the same entry could land in
 * both places.
 */
export function foodCalendarProblem(params: {
  memberType: MemberType | null | undefined;
  syncTag: string;
  eventsTag: string | null | undefined;
}): string | null {
  if (!canHaveFoodCalendar(params.memberType)) {
    return "The food calendar is only for Producers.";
  }
  const tag = normalizeTag(params.syncTag);
  if (tag && tag === normalizeTag(params.eventsTag)) {
    return "Use a different tag from your events calendar, for example #food.";
  }
  return null;
}
