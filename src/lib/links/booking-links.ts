import type { MemberLinkKind } from "@/lib/supabase/types";

/**
 * Booking link types for Mobile members (owner's request, 2026-09-27): an
 * Instagram DM and WhatsApp. Members type what they know -- "@name" or a
 * phone number -- and it's stored as an ordinary https link (ig.me/m/…,
 * wa.me/…), so every existing URL safety check keeps applying and the
 * profile's buttons open the conversation directly. Pure, so the editor
 * and the tests share it.
 */

export const BOOKING_LINK_KINDS: readonly MemberLinkKind[] = ["instagram_dm", "whatsapp"];

export function isBookingLinkKind(kind: MemberLinkKind): boolean {
  return BOOKING_LINK_KINDS.includes(kind);
}

/** What the link's input field asks for. */
export function linkInputHint(kind: MemberLinkKind): { placeholder: string; inputMode: "url" | "text" | "tel" } {
  if (kind === "instagram_dm") return { placeholder: "@yourname", inputMode: "text" };
  if (kind === "whatsapp") return { placeholder: "(951) 555-1234", inputMode: "tel" };
  return { placeholder: "https://…", inputMode: "url" };
}

export type StoredLink = { ok: true; url: string } | { ok: false; reason: string };

const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

function instagramHandle(raw: string): string | null {
  let value = raw.trim();
  // Accept a pasted profile or DM link as well as @name.
  value = value.replace(/^https?:\/\//i, "").replace(/^(www\.)?(instagram\.com|ig\.me\/m)\//i, "");
  value = value.replace(/^@/, "").replace(/[/?#].*$/, "");
  return IG_HANDLE.test(value) ? value : null;
}

function whatsappDigits(raw: string): string | null {
  let value = raw.trim().replace(/^https?:\/\/(api\.)?(wa\.me|whatsapp\.com)\/(send\?phone=)?/i, "");
  value = value.replace(/[^\d]/g, "");
  if (value.length === 10) value = `1${value}`; // a US number typed without the country code
  return value.length >= 11 && value.length <= 15 ? value : null;
}

/** The link to store for what the member typed. An empty field stays empty. */
export function toStoredLinkUrl(kind: MemberLinkKind, raw: string): StoredLink {
  const value = raw.trim();
  if (value === "") return { ok: true, url: "" };
  if (kind === "instagram_dm") {
    const handle = instagramHandle(value);
    return handle
      ? { ok: true, url: `https://ig.me/m/${handle}` }
      : { ok: false, reason: "Enter your Instagram name, like @yourname." };
  }
  if (kind === "whatsapp") {
    const digits = whatsappDigits(value);
    return digits
      ? { ok: true, url: `https://wa.me/${digits}` }
      : { ok: false, reason: "Enter the phone number you use for WhatsApp, with the area code." };
  }
  return { ok: true, url: value };
}

/** What the field shows for a stored link: @name, a phone number, or the link itself. */
export function toDisplayLinkValue(kind: MemberLinkKind, url: string): string {
  if (kind === "instagram_dm") {
    const handle = url.match(/^https:\/\/ig\.me\/m\/([A-Za-z0-9._]+)$/)?.[1];
    return handle ? `@${handle}` : url;
  }
  if (kind === "whatsapp") {
    const digits = url.match(/^https:\/\/wa\.me\/(\d+)$/)?.[1];
    if (!digits) return url;
    if (digits.length === 11 && digits.startsWith("1")) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return `+${digits}`;
  }
  return url;
}
