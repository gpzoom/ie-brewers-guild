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
import type { MemberType } from "@/lib/supabase/types";
import { MEMBER_GUIDE_PATH } from "@/lib/member-guide";

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
    }
  | {
      /** Setup wizard step 2: the member picked a different type than the Guild set. */
      trigger: "member_type_changed_in_setup";
      memberId: string;
      memberName: string;
      oldType: MemberType;
      newType: MemberType;
    }
  | {
      /** Portal Basics' "Request a type change": to the Guild. */
      trigger: "type_change_requested";
      memberId: string;
      memberName: string;
      currentType: MemberType;
      requestedType: MemberType;
      note: string | null;
      /** Who asked, or null when a Guild admin asked while editing as them. */
      requestedByEmail: string | null;
    }
  | {
      /** The owner's People section invited someone: to the invitee. */
      trigger: "editor_invited";
      memberId: string;
      memberName: string;
      email: string;
      role: "editor" | "media_events";
      /** The owner's address, or null when a Guild admin invited while editing as them. */
      inviterEmail: string | null;
    }
  | {
      /** The super admin's Guild admins screen invited someone: to the invitee. */
      trigger: "guild_admin_invited";
      email: string;
      /** The super admin's address. */
      inviterEmail: string | null;
    }
  | {
      /** The Help button (docs/member-profiles.md, "Help button"): to the site owner. */
      trigger: "support_message";
      /** The support inbox, chosen by the server (SUPPORT_INBOX_EMAIL). */
      to: string;
      kind: "bug" | "feature";
      firstName: string;
      /** What they typed; replies go here. */
      email: string;
      message: string;
      /** The profile they were working on, from the session; null on the Guild screens or with no profile yet. */
      memberName: string | null;
      memberType: MemberType | null;
      /** The signed-in account, when it differs from what they typed. */
      accountEmail: string | null;
      /** member: the member or their editor · guild_admin: on the Guild screens · guild_admin_as_member: editing as the member. */
      senderRole: "member" | "guild_admin" | "guild_admin_as_member";
      pagePath: string;
      userAgent: string | null;
    };

/** replyTo: where hitting Reply goes, when it isn't the sender's no-reply address. */
export type EmailContent = { subject: string; html: string; text: string; replyTo?: string };

/**
 * The Guild's real, currently-used contact inbox (confirmed against
 * src/components/site/UnderConstruction.tsx's existing mailto: link this
 * session). A single named constant, not repeated inline, so it's
 * trivially correctable in one place if this guess is ever wrong --
 * reused by send.ts's recipient resolution (Task 3) and by contact.tsx's
 * own on-page display (Task 6).
 */
export const GUILD_NOTIFICATION_EMAIL = "iscbrewersguild@gmail.com";

/**
 * Where Guild notifications go when they're sent from the STAGING site
 * (owner's request, 2026-09-26), so testing never lands in the real Guild
 * inbox. The public contact address shown on the site is unchanged.
 */
export const STAGING_GUILD_NOTIFICATION_EMAIL = "boblelle77+iscadmin@gmail.com";
const STAGING_HOST = "ie-brewers-guild-staging.boblelle77.workers.dev";

/**
 * Where the Help button's messages go (owner's request, 2026-09-27), unless
 * the Worker's SUPPORT_INBOX_EMAIL variable names another address.
 */
export const DEFAULT_SUPPORT_INBOX_EMAIL = "boblelle77@gmail.com";

function isStagingSite(siteUrl: string | null): boolean {
  if (!siteUrl) return false;
  try {
    return new URL(siteUrl).hostname === STAGING_HOST;
  } catch {
    return false;
  }
}

/**
 * The Guild inbox for the site an email is being sent from: the staging
 * inbox for the staging Worker, the real Guild inbox for everything else
 * (production, local dev, and sends with no request such as the cron).
 */
export function guildInboxFor(siteUrl: string | null): string {
  if (!siteUrl) return GUILD_NOTIFICATION_EMAIL;
  try {
    return new URL(siteUrl).hostname === STAGING_HOST ? STAGING_GUILD_NOTIFICATION_EMAIL : GUILD_NOTIFICATION_EMAIL;
  } catch {
    return GUILD_NOTIFICATION_EMAIL;
  }
}

/** The Guild's real domain, confirmed against the spec and this session's own research. */
export const SITE_URL = "https://iscbrewersguild.org";

/** The Guild's full name, and the short form the site header/footer use. */
export const ORG_NAME = "Inland Southern California Brewers Guild";
export const ORG_SHORT_NAME = "ISC Brewers Guild";

/**
 * The site origin an email's links should point at: the site that sent the
 * email, so an invite sent from staging links back to staging rather than
 * to production (which may not have the page yet). Only the Guild's own
 * hosts are honored -- the production domain, this account's
 * workers.dev deployments (production and staging), and local dev --
 * anything else, or no request at all (e.g. the hours-stale cron), falls
 * back to SITE_URL, so a link in an email can never point somewhere else.
 */
export function resolveEmailSiteUrl(requestUrl: string | null): string {
  if (!requestUrl) return SITE_URL;
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return SITE_URL;
  }
  const host = url.hostname;
  const isOwnHost =
    (url.protocol === "https:" &&
      (host === "iscbrewersguild.org" || host === "www.iscbrewersguild.org" || host.endsWith(".boblelle77.workers.dev"))) ||
    host === "localhost" ||
    host === "127.0.0.1";
  return isOwnHost ? url.origin : SITE_URL;
}

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

const SUPPORT_SENDER_LABEL = {
  member: "Member or their editor",
  guild_admin: "Guild admin",
  guild_admin_as_member: "Guild admin, editing as this member",
} as const;

/** How the email names each member type (same words as the type cards' short names). */
const MEMBER_TYPE_EMAIL_LABEL: Record<MemberType, string> = {
  producer: "Producer",
  mobile: "Mobile member",
  allied: "Allied Member",
};

export function buildEmailContent(payload: TransactionalEmailPayload, siteUrl: string = SITE_URL): EmailContent {
  switch (payload.trigger) {
    case "creator_upload_pending": {
      const attribution = payload.creatorName ? ` from ${payload.creatorName}` : "";
      const text =
        `Something is waiting for review. A file${attribution} was uploaded to your media gallery and ` +
        `needs your approval before it can appear on your profile.\n\nReview it: ${siteUrl}/admin/media`;
      return {
        subject: "Something's waiting for your review",
        text,
        html: wrapHtml([
          `Something is waiting for review. A file${escapeHtml(attribution)} was uploaded to your media ` +
            "gallery and needs your approval before it can appear on your profile.",
          `<a href="${siteUrl}/admin/media">Review it in your admin panel</a>`,
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
      const signInUrl = `${siteUrl}/signin?next=/portal`;
      const guideUrl = `${siteUrl}${MEMBER_GUIDE_PATH}`;
      const text =
        `Welcome to the ${ORG_NAME}! The Guild has created a profile for your business on the ` +
        `member directory. Sign in anytime with this email address to start filling it in:\n\n${signInUrl}` +
        `\n\nNew to the site? Here's the step-by-step Member Guide (PDF):\n\n${guideUrl}`;
      return {
        subject: `You're invited to the ${ORG_SHORT_NAME} member directory`,
        text,
        html: wrapHtml([
          `Welcome to the ${ORG_NAME}! The Guild has created a profile for your business on the ` +
            "member directory.",
          `Sign in anytime with this email address to start filling it in: <a href="${signInUrl}">${signInUrl}</a>`,
          `New to the site? Here's the <a href="${guideUrl}">step-by-step Member Guide (PDF)</a>.`,
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

    case "member_type_changed_in_setup": {
      const oldLabel = MEMBER_TYPE_EMAIL_LABEL[payload.oldType] ?? payload.oldType;
      const newLabel = MEMBER_TYPE_EMAIL_LABEL[payload.newType] ?? payload.newType;
      const rosterUrl = `${siteUrl}/guild/roster`;
      const sentence = `${payload.memberName} changed their type from ${oldLabel} to ${newLabel} during setup.`;
      const note =
        "Their type is now locked for them. If this looks wrong, you can change it from the roster.";
      return {
        subject: `${payload.memberName} changed their member type during setup`,
        text: `${sentence}\n\n${note}\n\nOpen the roster: ${rosterUrl}`,
        html: wrapHtml([
          escapeHtml(sentence),
          escapeHtml(note),
          `<a href="${rosterUrl}">Open the roster</a>`,
        ]),
      };
    }

    case "type_change_requested": {
      const currentLabel = MEMBER_TYPE_EMAIL_LABEL[payload.currentType] ?? payload.currentType;
      const requestedLabel = MEMBER_TYPE_EMAIL_LABEL[payload.requestedType] ?? payload.requestedType;
      const rosterUrl = `${siteUrl}/guild/roster`;
      const sentence =
        `${payload.memberName} asked to change their member type from ${currentLabel} to ${requestedLabel}.`;
      const from = payload.requestedByEmail ? `Requested by: ${payload.requestedByEmail}` : null;
      const note = `Their note: ${payload.note ?? "(no note)"}`;
      const action =
        "Their type is locked for them, so the change is yours to make from the roster. The request is also listed under Inquiries.";
      const lines = [sentence, ...(from ? [from] : []), note, action];
      return {
        subject: `${payload.memberName} asked to change their member type`,
        text: `${lines.join("\n\n")}\n\nOpen the roster: ${rosterUrl}`,
        html: wrapHtml([...lines.map(escapeHtml), `<a href="${rosterUrl}">Open the roster</a>`]),
      };
    }

    case "guild_admin_invited": {
      const signInUrl = `${siteUrl}/signin`;
      const inviter = payload.inviterEmail ?? `The ${ORG_NAME}`;
      const intro = `${inviter} invited you to be a Guild admin on the ${ORG_SHORT_NAME} website.`;
      const what =
        "Guild admins answer inquiries, look after the member roster and edit members' profiles for them.";
      const howTo = `Sign in with this email address (${payload.email}) to accept. The invitation lasts 14 days.`;
      return {
        subject: `You're invited to be a Guild admin — ${ORG_SHORT_NAME}`,
        text: `${intro}

${what}

${howTo}

${signInUrl}`,
        html: wrapHtml([
          escapeHtml(intro),
          escapeHtml(what),
          escapeHtml(howTo),
          `<a href="${signInUrl}">Sign in</a>`,
        ]),
      };
    }

    case "editor_invited": {
      const signInUrl = `${siteUrl}/signin?next=/portal`;
      const inviter = payload.inviterEmail ?? `The ${ORG_NAME}`;
      const canEdit =
        payload.role === "media_events"
          ? "You'll be able to update its photos and its events."
          : "You'll be able to edit everything on its profile.";
      const intro = `${inviter} invited you to help with ${payload.memberName}'s profile on the ${ORG_SHORT_NAME} member directory.`;
      const howTo = `Sign in to the Member Portal with this email address (${payload.email}). The invitation lasts 14 days.`;
      return {
        subject: `You're invited to help with ${payload.memberName}'s profile`,
        text: `${intro}\n\n${canEdit}\n\n${howTo}\n\n${signInUrl}`,
        html: wrapHtml([
          escapeHtml(intro),
          escapeHtml(canEdit),
          escapeHtml(howTo),
          `<a href="${signInUrl}">Sign in to the Member Portal</a>`,
        ]),
      };
    }

    case "support_message": {
      const kindLabel = payload.kind === "bug" ? "Bug report" : "Feature request";
      const typeLabel = payload.memberType ? MEMBER_TYPE_EMAIL_LABEL[payload.memberType] ?? payload.memberType : null;
      const about = payload.memberName
        ? `${payload.memberName}${typeLabel ? ` (${typeLabel})` : ""}`
        : payload.senderRole === "guild_admin"
          ? "Guild admin screens"
          : "No profile yet";
      const staging = isStagingSite(siteUrl) ? "[Staging] " : "";
      const details = [
        `From: ${payload.firstName} <${payload.email}>`,
        ...(payload.accountEmail && payload.accountEmail.toLowerCase() !== payload.email.toLowerCase()
          ? [`Signed in as: ${payload.accountEmail}`]
          : []),
        `Who: ${SUPPORT_SENDER_LABEL[payload.senderRole]}`,
        `Profile: ${payload.memberName ?? "(none)"}${typeLabel ? ` · ${typeLabel}` : ""}`,
        `Page: ${payload.pagePath ? `${siteUrl}${payload.pagePath}` : "(unknown)"}`,
        `Device: ${payload.userAgent ?? "(unknown)"}`,
      ];
      return {
        subject: `${staging}${kindLabel}: ${about}`,
        replyTo: payload.email,
        text: `${kindLabel.toUpperCase()}\n\n${payload.message}\n\n${details.join("\n")}`,
        html: `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;"><p><strong>${escapeHtml(
          kindLabel,
        )}</strong></p><p style="white-space: pre-wrap;">${escapeHtml(payload.message)}</p><p style="color: #6B6156; font-size: 13px;">${details
          .map(escapeHtml)
          .join("<br>")}</p></div>`,
      };
    }
  }
}
