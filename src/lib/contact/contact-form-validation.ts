/**
 * Validation for the public contact form (spec, artboard O / "Joining, for
 * now": "collects name, email, phone, a message, and one checkbox"). This
 * module has no I/O so it is reused as-is on both sides of the wire: the
 * client imports it for instant, accessible inline errors, and the server
 * (submit-contact-form.server.ts) imports the exact same function as its
 * authoritative check, since a client can always be bypassed.
 *
 * Length caps (name/email/phone/message) are not in the spec -- they exist
 * only to keep a single public, unauthenticated request from writing an
 * unbounded row. 320 for email is the RFC 5321 maximum mailbox length; the
 * others are generous round numbers no real submitter will ever hit.
 */
export type ContactFormInput = {
  name: string;
  email: string;
  phone: string;
  message: string;
  wantsMembershipInfo: boolean;
  honeypot: string;
};

export type ContactFormFieldErrors = Partial<Record<"name" | "email" | "phone" | "message", string>>;

export type ContactFormValidation =
  | {
      valid: true;
      value: {
        name: string;
        email: string;
        phone: string | null;
        message: string;
        wantsMembershipInfo: boolean;
      };
    }
  | { valid: false; errors: ContactFormFieldErrors };

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const PHONE_MAX = 32;
const MESSAGE_MAX = 5000;

// Deliberately simple -- not full RFC 5322. A basic shape check plus the
// browser's own <input type="email"> validation on the client is a
// reasonable bar for a contact form; Resend will reject anything it can't
// actually deliver to regardless.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactFormInput(input: ContactFormInput): ContactFormValidation {
  const errors: ContactFormFieldErrors = {};

  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const message = input.message.trim();

  if (!name) {
    errors.name = "Enter your name.";
  } else if (name.length > NAME_MAX) {
    errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  }

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (email.length > EMAIL_MAX) {
    errors.email = `Email must be ${EMAIL_MAX} characters or fewer.`;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (phone.length > PHONE_MAX) {
    errors.phone = `Phone must be ${PHONE_MAX} characters or fewer.`;
  }

  if (!message) {
    errors.message = "Enter a message.";
  } else if (message.length > MESSAGE_MAX) {
    errors.message = `Message must be ${MESSAGE_MAX} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: { name, email, phone: phone || null, message, wantsMembershipInfo: input.wantsMembershipInfo },
  };
}

/**
 * A hidden field named "company" that no real visitor to a personal contact
 * form has a reason to see or fill (it is aria-hidden, tabIndex={-1}, and
 * positioned off-screen in the UI -- see contact.tsx, Task 6) but that a
 * bot filling every input it finds in the DOM often does. Whitespace counts
 * as untripped, matching how a real field's own "required" check trims.
 */
export function isHoneypotTripped(honeypotValue: string): boolean {
  return honeypotValue.trim().length > 0;
}
