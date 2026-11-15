/**
 * The messages the public Join server functions may send back to the page,
 * shared by both sides: the server returns or throws them, and the /join
 * page shows a thrown message only when it is one of these (anything else
 * becomes the generic SOMETHING_WRONG). No server-only imports here, so the
 * page can import it.
 */

export const TOO_MANY_TRIES = "Too many tries — please wait a minute and try again.";
export const SOMETHING_WRONG = "Something went wrong. Try again in a moment.";
/** Ruling R11: the JOIN_OPEN Worker var isn't "true". */
export const JOIN_CLOSED = "Joining online isn't open yet. Please contact us.";
/** Ruling R12: the global brake on new applications. */
export const JOIN_BUSY = "We're getting a lot of applications right now. Please try again later.";
export const ENTER_BUSINESS_NAME = "Enter your business name.";
export const CHOOSE_MEMBER_TYPE = "Choose a member type.";

const SAFE_MESSAGES: ReadonlySet<string> = new Set([
  TOO_MANY_TRIES,
  SOMETHING_WRONG,
  JOIN_CLOSED,
  JOIN_BUSY,
  ENTER_BUSINESS_NAME,
  CHOOSE_MEMBER_TYPE,
]);

/** A thrown server-function error's message if it's one we wrote to be shown, else the generic message. */
export function safeJoinMessage(err: unknown): string {
  return err instanceof Error && SAFE_MESSAGES.has(err.message) ? err.message : SOMETHING_WRONG;
}

/** Ruling R11: Join is open only when the JOIN_OPEN Worker var is exactly "true". */
export function isJoinOpenValue(value: unknown): boolean {
  return value === "true";
}

/** Ruling R12: refuse new applications when more than this many came in during the last hour. */
export const JOIN_BRAKE_PER_HOUR = 20;
