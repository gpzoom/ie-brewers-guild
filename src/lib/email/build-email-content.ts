/**
 * The canonical shape of every transactional email this build sends (spec,
 * "Transactional email"). This is the single source of truth for
 * TransactionalEmailPayload -- send.ts (Task 4) imports and re-exports it
 * rather than declaring its own copy, so every existing call site
 * (creator-upload.server.ts, hours-stale-cron.server.ts,
 * invite-member.server.ts, and this plan's own submit-contact-form.server.ts)
 * keeps importing the type from "@/lib/email/send" unchanged.
 *
 * This module does no I/O and is safe to import from a client component
 * (src/routes/contact.tsx does, for GUILD_NOTIFICATION_EMAIL) as well as
 * from server-only code.
 */
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string }
  | { trigger: "member_invited"; memberId: string; email: string }
  | { trigger: "contact_confirmation"; inquiryId: string; name: string; email: string; wantsMembershipInfo: boolean }
  | {
      trigger: "contact_form_submitted";
      inquiryId: string;
      name: string;
      email: string;
      phone: string | null;
      message: string | null;
      wantsMembershipInfo: boolean;
    };

export type EmailContent = { subject: string; html: string; text: string };

/**
 * The Guild's real, currently-used contact inbox (confirmed against
 * src/components/site/UnderConstruction.tsx's existing mailto: link this
 * session). A single named constant, not repeated inline, so it's
 * trivially correctable in one place if this guess is ever wrong --
 * reused by send.ts's recipient resolution (Task 3) and by contact.tsx's
 * own on-page display (Task 6).
 */
export const GUILD_NOTIFICATION_EMAIL = "iscbrewersguild@gmail.com";

/** The Guild's real domain, confirmed against the spec and this session's own research. */
export const SITE_URL = "https://iscbrewersguild.org";

/** The Guild's full name, and the short form the site header/footer use. */
export const ORG_NAME = "Inland Southern California Brewers Guild";
export const ORG_SHORT_NAME = "ISC Brewers Guild";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapHtml(paragraphs: string[]): string {
  return `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${paragraphs
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("\n")}</div>`;
}

export function buildEmailContent(payload: TransactionalEmailPayload): EmailContent {
  switch (payload.trigger) {
    case "creator_upload_pending": {
      const attribution = payload.creatorName ? ` from ${payload.creatorName}` : "";
      const text =
        `Something is waiting for review. A file${attribution} was uploaded to your media gallery and ` +
        `needs your approval before it can appear on your profile.\n\nReview it: ${SITE_URL}/admin/media`;
      return {
        subject: "Something's waiting for your review",
        text,
        html: wrapHtml([
          `Something is waiting for review. A file${escapeHtml(attribution)} was uploaded to your media ` +
            "gallery and needs your approval before it can appear on your profile.",
          `<a href="${SITE_URL}/admin/media">Review it in your admin panel</a>`,
        ]),
      };
    }

    case "hours_stale": {
      const text =
        "It's been a while since you confirmed your posted hours are still accurate. Click below to " +
        `confirm them now — no sign-in needed:\n\n${payload.confirmUrl}`;
      return {
        subject: "Please confirm your hours are still accurate",
        text,
        html: wrapHtml([
          "It's been a while since you confirmed your posted hours are still accurate. Click below to " +
            "confirm them now — no sign-in needed.",
          `<a href="${payload.confirmUrl}">Confirm my hours</a>`,
        ]),
      };
    }

    case "member_invited": {
      const signInUrl = `${SITE_URL}/signin`;
      const text =
        `Welcome to the ${ORG_NAME}! The Guild has created a profile for your business on the ` +
        `member directory. Sign in anytime with this email address to start filling it in:\n\n${signInUrl}`;
      return {
        subject: `You're invited to the ${ORG_SHORT_NAME} member directory`,
        text,
        html: wrapHtml([
          `Welcome to the ${ORG_NAME}! The Guild has created a profile for your business on the ` +
            "member directory.",
          `Sign in anytime with this email address to start filling it in: <a href="${signInUrl}">${signInUrl}</a>`,
        ]),
      };
    }

    case "contact_confirmation": {
      const membershipLine = payload.wantsMembershipInfo
        ? " A Guild representative will be in touch to discuss membership."
        : "";
      const text = `Thank you for reaching out. We have received your submission.${membershipLine}`;
      return {
        subject: `We've received your message — ${ORG_SHORT_NAME}`,
        text,
        html: wrapHtml([`Thank you for reaching out. We have received your submission.${membershipLine}`]),
      };
    }

    case "contact_form_submitted": {
      const isMembershipLead = payload.wantsMembershipInfo;
      const lines = [
        isMembershipLead ? "MEMBERSHIP LEAD" : "General inquiry",
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Phone: ${payload.phone ?? "(not given)"}`,
        `Wants membership info: ${isMembershipLead ? "Yes" : "No"}`,
        `Message: ${payload.message ?? "(no message)"}`,
      ];
      return {
        subject: `${isMembershipLead ? "[Membership Lead] " : ""}New contact form submission`,
        text: lines.join("\n"),
        html: wrapHtml(lines.map(escapeHtml)),
      };
    }
  }
}
