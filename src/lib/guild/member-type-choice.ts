import type { MemberType } from "@/lib/supabase/types";

/**
 * The Guild must choose a member type when it adds a member (owner,
 * 2026-10-17): there is no Producer default. The add forms start empty and
 * disable their button until a type is chosen; the server checks again here
 * so a stale or hand-made request can't slip through.
 */
const MEMBER_TYPES: readonly MemberType[] = ["producer", "mobile", "allied"];

export const CHOOSE_MEMBER_TYPE_MESSAGE = "Choose a member type.";

export function validateMemberTypeChoice(value: unknown): MemberType {
  if (!MEMBER_TYPES.includes(value as MemberType)) throw new Error(CHOOSE_MEMBER_TYPE_MESSAGE);
  return value as MemberType;
}
