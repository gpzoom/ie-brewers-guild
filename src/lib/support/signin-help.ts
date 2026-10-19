/**
 * Sign-in help (docs/member-profiles.md, "Sign-in help"): the public form at
 * /signin/help for someone who can't sign in, usually because the email the
 * Guild has for them changed. The field limits and the one validation both
 * the form and the server use. No I/O -- safe to import from the page.
 */

/** Where each request is emailed (owner, 2026-10-19). It forwards to the site owner. */
export const SIGNIN_HELP_INBOX_EMAIL = "support@iscbrewersguild.org";

/** support_messages.first_name allows 60. */
export const SIGNIN_HELP_NAME_MAX = 60;
export const SIGNIN_HELP_BUSINESS_MAX = 120;
export const SIGNIN_HELP_EMAIL_MAX = 254;
export const SIGNIN_HELP_NOTE_MAX = 2000;
/** Saved as the message when they leave the note empty (the column needs text). */
export const SIGNIN_HELP_NO_NOTE = "(No note)";

export type SignInHelpInput = {
  name: string;
  businessName: string;
  /** The address they used to sign in with. */
  previousEmail: string;
  /** Where to reach them now; replies go here. */
  newEmail: string;
  note: string;
};

export type SignInHelpForm = SignInHelpInput & { honeypot: string };

export const EMPTY_SIGNIN_HELP_FORM: SignInHelpForm = {
  name: "",
  businessName: "",
  previousEmail: "",
  newEmail: "",
  note: "",
  honeypot: "",
};

export type SignInHelpFieldErrors = Partial<Record<keyof SignInHelpInput, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailError(value: string, empty: string): string | undefined {
  if (!value) return empty;
  if (value.length > SIGNIN_HELP_EMAIL_MAX || !EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  return undefined;
}

/** Trims and checks the form. Returns the cleaned input, or the errors to show beside each field. */
export function validateSignInHelp(
  raw: Partial<Record<keyof SignInHelpInput, unknown>> | null | undefined,
): { ok: true; value: SignInHelpInput } | { ok: false; errors: SignInHelpFieldErrors } {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const value: SignInHelpInput = {
    name: text(raw?.name),
    businessName: text(raw?.businessName),
    previousEmail: text(raw?.previousEmail),
    newEmail: text(raw?.newEmail),
    note: text(raw?.note),
  };
  const errors: SignInHelpFieldErrors = {};

  if (!value.name) errors.name = "Enter your name.";
  else if (value.name.length > SIGNIN_HELP_NAME_MAX) errors.name = `Keep it under ${SIGNIN_HELP_NAME_MAX} characters.`;
  if (!value.businessName) errors.businessName = "Enter your business name.";
  else if (value.businessName.length > SIGNIN_HELP_BUSINESS_MAX)
    errors.businessName = `Keep it under ${SIGNIN_HELP_BUSINESS_MAX} characters.`;
  const previous = emailError(value.previousEmail, "Enter the email you used to sign in with.");
  if (previous) errors.previousEmail = previous;
  const next = emailError(value.newEmail, "Enter your new email.");
  if (next) errors.newEmail = next;
  if (!previous && !next && value.previousEmail.toLowerCase() === value.newEmail.toLowerCase())
    errors.newEmail = "This is the same as the email you used before. Enter your new one.";
  if (value.note.length > SIGNIN_HELP_NOTE_MAX) errors.note = `Keep it under ${SIGNIN_HELP_NOTE_MAX} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}
