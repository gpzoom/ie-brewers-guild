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

/** After Finish sending: the broadcast's total, all batches together. */
export function finishedTitle(sent: number): string {
  return `Finished sending. Sent to ${peopleText(sent)} in all.`;
}

/**
 * The dialog's line while sending: about 80 people a minute (10 per request,
 * paced for Resend).
 */
export function sendingTimeText(total: number): string {
  const minutes = Math.max(1, Math.ceil(total / 80));
  return `Sending takes about ${minutes} ${minutes === 1 ? "minute" : "minutes"} for ${peopleText(total)}. Keep this page open — if it's interrupted, you can finish later from Recent broadcasts.`;
}

export const INTERRUPTED_SEND_NOTE =
  "An earlier send was interrupted. Use Finish sending in Recent broadcasts instead.";

/** The dialog's progress line while batches go out. */
export function progressText(done: number, total: number): string {
  return `Sent ${done} of ${total}…`;
}

export function finishConfirmTitle(left: number): string {
  return `Finish sending to ${peopleText(left)}?`;
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
  processedCount?: number;
  totalCount?: number;
}): string {
  const base = `${row.audienceLabel} · ${peopleText(row.recipient_count)}`;
  switch (row.status) {
    case "failed":
      // Marked as stopped before everyone was tried.
      if ((row.processedCount ?? 0) < (row.totalCount ?? 0)) {
        return `${base} · stopped after ${row.processedCount ?? 0} of ${row.totalCount}`;
      }
      return `${base} · failed`;
    case "sending":
      return `${base} · sending…`;
    case "interrupted":
      return `${base} · interrupted after ${row.processedCount ?? 0} of ${row.totalCount ?? 0}`;
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
 * Refusals startBroadcast gives BEFORE any email goes out (broadcast-core.ts
 * validation and setup checks). Anything else -- a dropped connection, a
 * sleeping tab, a timeout -- may have come after the record was written, so
 * the screen treats it as "lost contact". Once batches are going, any error
 * stops the loop and offers Finish sending.
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
  "That broadcast wasn't found.",
  "That message is too long. Shorten it or attach a file instead.",
  "An attachment for this broadcast is missing, so it can't be finished. Use Mark as stopped.",
  "That broadcast is still sending. Wait a few minutes and check again.",
];

export const LOST_CONTACT_MESSAGE =
  "We lost contact while sending. Check Recent broadcasts and the Audit log before sending again.";

export function isSendRefusal(message: string): boolean {
  return SEND_REFUSALS.includes(message) || message.startsWith("Only the super admin can");
}
