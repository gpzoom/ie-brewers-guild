/**
 * Splits plain text into text and web-address pieces, so a component can
 * render the addresses as links (an event's description from a member's
 * calendar -- EventsModule). Only http(s) addresses and "www." ones become
 * links; anything else stays text, so nothing in the text can make a
 * javascript: or other kind of link.
 */

export type LinkifiedPart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

// An address runs to the next space or angle bracket/quote.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// Punctuation that usually ends the sentence rather than the address.
const TRAILING = /[.,;:!?'"]+$/;

function trimAddress(raw: string): string {
  let address = raw.replace(TRAILING, "");
  // A closing bracket belongs to the address only if it opened one:
  // "(see https://x.example/a)" vs "https://en.wikipedia.org/wiki/X_(y)".
  while (/[)\]]$/.test(address)) {
    const close = address.slice(-1);
    const open = close === ")" ? "(" : "[";
    if (address.split(open).length >= address.split(close).length) break;
    address = address.slice(0, -1).replace(TRAILING, "");
  }
  return address;
}

export function linkifyText(text: string): LinkifiedPart[] {
  const parts: LinkifiedPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const address = trimAddress(match[0]);
    if (!address || /^www\.?$/i.test(address)) continue;
    const href = /^https?:\/\//i.test(address) ? address : `https://${address}`;
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "link", text: address, href });
    last = start + address.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
