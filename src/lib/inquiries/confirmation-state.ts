/**
 * Artboard N shows "Confirmation email sent automatically at 4:12 pm," and
 * needs to distinguish a delivered auto-reply from one that silently
 * failed to send (spec, "inquiries" table notes). The auto-reply is a
 * synchronous send inside the Worker request that handles the contact-form
 * POST (Contact Form + Resend phase) -- there's no legitimate reason for a
 * healthy send to take minutes, so a five-minute grace period is a
 * generous margin against transient delay while still surfacing a
 * genuinely failed send well before an admin looks at the inquiry.
 */
export type ConfirmationDisplayState = "sent" | "not_yet_sent" | "failed_to_send";

const CONFIRMATION_GRACE_PERIOD_MS = 5 * 60 * 1000;

export function resolveConfirmationDisplayState(input: {
  confirmationSentAt: string | null;
  createdAt: string;
  now: number;
}): ConfirmationDisplayState {
  if (input.confirmationSentAt) return "sent";
  const ageMs = input.now - new Date(input.createdAt).getTime();
  return ageMs > CONFIRMATION_GRACE_PERIOD_MS ? "failed_to_send" : "not_yet_sent";
}
