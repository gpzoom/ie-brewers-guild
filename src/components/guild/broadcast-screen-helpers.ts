import type { BroadcastAudience } from "@/lib/guild/broadcast-audience";

/**
 * Small pure helpers for the Broadcast email screen (BroadcastScreen.tsx):
 * the counted words, button and dialog text, attachment sizes and the
 * audience the screen's tabs describe. Kept here so they're tested without
 * rendering the screen.
 */

export type AudienceTab = "all" | "type_or_category" | "members";
export type AudienceMemberType = "" | "producer" | "mobile" | "allied";

export const BROADCAST_FROM_LABEL = "ISC Brewers Guild <hello@iscbrewersguild.org>";

export const MEMBER_TYPE_CHOICES: { value: AudienceMemberType; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "producer", label: "Producers" },
  { value: "mobile", label: "Mobile members" },
  { value: "allied", label: "Affiliate Members" },
];

export function peopleText(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

export function membersText(n: number): string {
  return `${n} ${n === 1 ? "member" : "members"}`;
}

export function sendButtonLabel(peopleCount: number, sending: boolean): string {
  return sending ? "Sending…" : `Send to ${peopleText(peopleCount)}`;
}

export function confirmTitle(peopleCount: number): string {
  return `Send to ${peopleText(peopleCount)}?`;
}

export function confirmDescription(audienceLabel: string): string {
  return `${audienceLabel}. This can't be undone.`;
}

export function successTitle(sent: number, memberCount: number): string {
  return `Sent to ${peopleText(sent)} across ${membersText(memberCount)}, just now.`;
}

/** "2.1 MB", or "340 KB" under 1 MB (never "0 KB"). */
export function formatAttachmentSize(bytes: number): string {
  const MB = 1024 * 1024;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function recentAudienceLine(row: {
  audienceLabel: string;
  recipient_count: number;
  status: string;
  failedCount: number;
}): string {
  const base = `${row.audienceLabel} · ${peopleText(row.recipient_count)}`;
  switch (row.status) {
    case "failed":
      return `${base} · failed`;
    case "sending":
      return `${base} · sending…`;
    case "interrupted":
      return `${base} · interrupted, may be partly sent (${row.recipient_count} so far)`;
    default:
      return row.failedCount > 0 ? `${base} · ${row.failedCount} failed` : base;
  }
}

/** The audience the screen's current tab and fields describe. */
export function audienceFromForm(form: {
  tab: AudienceTab;
  memberType: AudienceMemberType;
  categoryId: string;
  memberIds: string[];
}): BroadcastAudience {
  switch (form.tab) {
    case "all":
      return { type: "all" };
    case "type_or_category":
      return {
        type: "type_or_category",
        memberType: form.memberType || null,
        categoryId: form.categoryId || null,
      };
    case "members":
      return { type: "members", memberIds: form.memberIds };
  }
}

/** The screen's tab and fields for a saved audience (the draft's). */
export function formFromAudience(audience: BroadcastAudience): {
  tab: AudienceTab;
  memberType: AudienceMemberType;
  categoryId: string;
  memberIds: string[];
} {
  switch (audience.type) {
    case "all":
      return { tab: "all", memberType: "", categoryId: "", memberIds: [] };
    case "type_or_category":
      return {
        tab: "type_or_category",
        memberType: audience.memberType ?? "",
        categoryId: audience.categoryId ?? "",
        memberIds: [],
      };
    case "members":
      return { tab: "members", memberType: "", categoryId: "", memberIds: audience.memberIds };
  }
}

/** Members matching the search box that aren't picked yet, by name. */
export function searchMembers<T extends { id: string; business_name: string }>(
  members: T[],
  query: string,
  pickedIds: string[],
): T[] {
  const q = query.trim().toLowerCase();
  const picked = new Set(pickedIds);
  return members.filter(
    (m) => !picked.has(m.id) && (q === "" || m.business_name.toLowerCase().includes(q)),
  );
}

/**
 * The Insert link dialog's address as a link: http(s) or mailto only (the
 * Worker's sanitizer keeps nothing else). A bare "example.com" gets
 * https://, a bare address gets mailto:. "" means remove the link; null
 * means the address can't be a link.
 */
export function normalizeLinkUrl(input: string): string | null {
  const url = input.trim();
  if (url === "") return "";
  if (/^(https?:\/\/|mailto:)\S+$/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[^:]+\.[^:]+:\d/.test(url)) return null;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)) return `mailto:${url}`;
  if (/^[^\s/]+\.[^\s/]+\S*$/.test(url)) return `https://${url}`;
  return null;
}

/**
 * Refusals the server gives BEFORE any email goes out (broadcast-core.ts
 * validation and setup checks). Anything else from Send -- a dropped
 * connection, a sleeping tab, a timeout -- may have happened after the
 * emails went out, so the screen treats it as "lost contact".
 */
const SEND_REFUSALS = [
  "Add a subject.",
  "Write a message.",
  "No one to send to.",
  "Choose who gets this email.",
  "The subject can be 200 characters at most.",
  "That attachment isn't in the draft anymore.",
  "Email isn't set up on this site. Nothing was sent.",
  "Couldn't read an attachment. Remove it and attach it again.",
  "Couldn't look up who gets this email. Try again.",
  "Couldn't load the draft. Try again.",
  "Your account has no email address to send from.",
  "Not signed in.",
  "A broadcast is still sending. Wait a few minutes and check Recent broadcasts.",
  "Couldn't start the send. Nothing was sent.",
];

export const LOST_CONTACT_MESSAGE =
  "We lost contact while sending. Check Recent broadcasts and the Audit log before sending again.";

export function isSendRefusal(message: string): boolean {
  return SEND_REFUSALS.includes(message) || message.startsWith("Only the super admin can");
}
