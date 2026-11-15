import type { MemberType } from "@/lib/supabase/types";
import { CHOOSE_MEMBER_TYPE_MESSAGE } from "@/lib/guild/member-type-choice";

/**
 * Validation for the public Join form. No I/O, so the /join page can use it
 * for inline errors and join.server.ts runs the same check as the real one
 * (a browser can always be bypassed). Every field is treated as untrusted:
 * a hand-made request may send anything, so non-strings count as empty.
 */
export type JoinInput = {
  email: string;
  businessName: string;
  city: string;
  memberType: MemberType;
  placeId: string | null;
  honeypot: string;
};

export type JoinFieldErrors = Partial<Record<"email" | "businessName" | "city" | "memberType", string>>;

const EMAIL_MAX = 320;
const BUSINESS_NAME_MAX = 200;
const CITY_MAX = 100;
const PLACE_ID_MAX = 300;

// Same simple shape check as the contact form.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Google place ids are URL-safe base64-ish text.
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MEMBER_TYPES: readonly MemberType[] = ["producer", "mobile", "allied"];

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const collapse = (value: unknown): string => str(value).replace(/\s+/g, " ").trim();

export function validateJoinInput(
  input: JoinInput,
): { ok: true; value: JoinInput } | { ok: false; errors: JoinFieldErrors } {
  const errors: JoinFieldErrors = {};

  const email = str(input?.email).trim().toLowerCase();
  const businessName = collapse(input?.businessName);
  const city = collapse(input?.city);
  const memberType = input?.memberType;

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > EMAIL_MAX) errors.email = `Email must be ${EMAIL_MAX} characters or fewer.`;
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  if (!businessName) errors.businessName = "Enter your business name.";
  else if (businessName.length > BUSINESS_NAME_MAX)
    errors.businessName = `Business name must be ${BUSINESS_NAME_MAX} characters or fewer.`;

  if (!city) errors.city = "Enter your city.";
  else if (city.length > CITY_MAX) errors.city = `City must be ${CITY_MAX} characters or fewer.`;

  if (!MEMBER_TYPES.includes(memberType)) errors.memberType = CHOOSE_MEMBER_TYPE_MESSAGE;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Mobile (food trucks) skips Google. A place id that isn't shaped like one
  // is dropped rather than shown as an error: the form never lets a person
  // type it.
  const rawPlaceId = str(input.placeId).trim();
  const placeId =
    memberType !== "mobile" && rawPlaceId && rawPlaceId.length <= PLACE_ID_MAX && PLACE_ID_PATTERN.test(rawPlaceId)
      ? rawPlaceId
      : null;

  return {
    ok: true,
    value: { email, businessName, city, memberType, placeId, honeypot: str(input.honeypot) },
  };
}
