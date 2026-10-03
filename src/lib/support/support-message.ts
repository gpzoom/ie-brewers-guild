/**
 * The Help button's form (docs/member-profiles.md, "Help button"): the
 * field limits and the one validation both the form and the server use.
 * No I/O -- safe to import from the page.
 */

export type SupportMessageKind = "bug" | "feature";

export const SUPPORT_KIND_LABEL: Record<SupportMessageKind, string> = {
  bug: "Problem/bug",
  feature: "Feature request",
};

export const SUPPORT_FIRST_NAME_MAX = 60;
export const SUPPORT_EMAIL_MAX = 254;
export const SUPPORT_MESSAGE_MAX = 5000;
export const SUPPORT_PAGE_PATH_MAX = 300;
/** How many messages one signed-in person can send in an hour. */
export const SUPPORT_MESSAGES_PER_HOUR = 5;

export type SupportMessageInput = {
  kind: SupportMessageKind;
  firstName: string;
  email: string;
  message: string;
  /** The page they were on (a path on this site). */
  pagePath: string;
};

export type SupportFieldErrors = Partial<
  Record<"kind" | "firstName" | "email" | "message", string>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims and checks the form. Returns the cleaned input, or the errors to show beside each field. */
export function validateSupportMessage(
  raw: Partial<Record<keyof SupportMessageInput, unknown>> | null | undefined,
): { ok: true; value: SupportMessageInput } | { ok: false; errors: SupportFieldErrors } {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const kind = raw?.kind;
  const firstName = text(raw?.firstName);
  const email = text(raw?.email);
  const message = text(raw?.message);
  const errors: SupportFieldErrors = {};

  if (kind !== "bug" && kind !== "feature") errors.kind = "Choose Problem/bug or Feature request.";
  if (!firstName) errors.firstName = "Enter your first name.";
  else if (firstName.length > SUPPORT_FIRST_NAME_MAX)
    errors.firstName = `Keep it under ${SUPPORT_FIRST_NAME_MAX} characters.`;
  if (!email) errors.email = "Enter your email.";
  else if (email.length > SUPPORT_EMAIL_MAX || !EMAIL_PATTERN.test(email))
    errors.email = "Enter a valid email address.";
  if (!message) errors.message = "Tell us what happened, or what you'd like.";
  else if (message.length > SUPPORT_MESSAGE_MAX)
    errors.message = `Keep it under ${SUPPORT_MESSAGE_MAX} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Only a path on this site is kept; anything else is dropped, not refused.
  const rawPath = text(raw?.pagePath);
  const pagePath =
    rawPath.startsWith("/") && !rawPath.startsWith("//")
      ? rawPath.slice(0, SUPPORT_PAGE_PATH_MAX)
      : "";

  return {
    ok: true,
    value: { kind: kind as SupportMessageKind, firstName, email, message, pagePath },
  };
}

/** Which part of the site a path belongs to; the Help button only shows on these. */
export type SupportArea = "portal" | "admin" | "guild";

const PREVIEW_PATHS = ["/admin/preview", "/portal/preview", "/portal/setup/preview"];

export function supportAreaForPath(pathname: string): SupportArea | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  // The draft previews show the profile the way the public sees it.
  if (PREVIEW_PATHS.includes(path)) return null;
  for (const area of ["portal", "admin", "guild"] as const) {
    if (path === `/${area}` || path.startsWith(`/${area}/`)) return area;
  }
  return null;
}
