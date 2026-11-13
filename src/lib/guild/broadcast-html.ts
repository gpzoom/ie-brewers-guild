import { ORG_SHORT_NAME } from "@/lib/email/build-email-content";

const KEEP_TAGS = new Set(["p", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);

// A tag at the current position (sticky), tolerating ">" inside quoted
// attribute values. An unterminated quote or missing ">" does not match.
const TAG_AT = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;

function safeHref(attrs: string): string | null {
  const m = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return null;
  const value = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  if (!/^(https?:|mailto:)/i.test(value)) return null;
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Reduces pasted/typed HTML to p, br, strong, b, em, i, u, ul, ol, li and
 * links (http, https, mailto only). Other tags are unwrapped (text kept);
 * script, style and iframe are dropped with their contents. Single-pass
 * tokenizer, no DOM: every "<" either starts a recognized tag or is escaped,
 * so text can never form a tag. Output is balanced.
 */
export function sanitizeBroadcastHtml(html: string): string {
  const src = html
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<[!?][^>]*>?/g, "")
    .replace(/<(script|style|iframe)\b[\s\S]*?(<\/\1\s*>|$)/gi, "");

  let out = "";
  const stack: { name: string; emit: boolean }[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      out += escapeText(src.slice(i));
      break;
    }
    out += escapeText(src.slice(i, lt));
    TAG_AT.lastIndex = lt;
    const m = TAG_AT.exec(src);
    if (!m) {
      out += "&lt;";
      i = lt + 1;
      continue;
    }
    i = lt + m[0].length;
    const slash = m[1] === "/";
    const name = m[2].toLowerCase();
    if (name === "br") {
      if (!slash) out += "<br>";
      continue;
    }
    const isA = name === "a";
    if (!isA && !KEEP_TAGS.has(name)) continue;
    if (!slash) {
      if (isA) {
        const href = safeHref(m[3]);
        stack.push({ name, emit: href !== null });
        if (href !== null) out += `<a href="${href}">`;
      } else {
        stack.push({ name, emit: true });
        out += `<${name}>`;
      }
      continue;
    }
    const idx = stack.map((e) => e.name).lastIndexOf(name);
    if (idx === -1) continue; // stray closing tag
    while (stack.length > idx) {
      const e = stack.pop()!;
      if (e.emit) out += `</${e.name}>`;
    }
  }
  while (stack.length) {
    const e = stack.pop()!;
    if (e.emit) out += `</${e.name}>`;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

export function htmlToText(html: string): string {
  const text = html
    .replace(
      /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, d: string, sq: string, inner: string) => {
        const url = decodeEntities(d ?? sq ?? "");
        const label = decodeEntities(inner.replace(/<[^>]*>/g, "")).trim();
        if (!label || label === url.replace(/^mailto:/i, "")) return url;
        return `${label} (${url})`;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|ul|ol|li)>/gi, "\n")
    .replace(/<(p|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The email around a message, built once: the body's HTML wrapper and its
 * plain-text version are computed here, and each person only gets their own
 * footer appended (no htmlToText per recipient).
 */
export function broadcastEmailBuilder(
  bodyHtml: string,
): (unsubscribeUrl: string) => { html: string; text: string } {
  const footerSentence = `You're getting this because you're on a member profile with the ${ORG_SHORT_NAME}.`;
  const head = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #F7F3EC;"><tr><td align="center" style="padding: 24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: #FFFFFF; border-radius: 8px;"><tr><td style="padding: 24px; font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${bodyHtml}</td></tr>`;
  const tail = `</table></td></tr></table>`;
  const body = htmlToText(bodyHtml);
  return (unsubscribeUrl) => {
    const footerHtml = unsubscribeUrl
      ? `<tr><td style="padding: 16px 24px 24px; border-top: 1px solid #E5DED4; font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #6B6156;">${footerSentence} <a href="${escapeAttr(unsubscribeUrl)}" style="color: #6B6156; text-decoration: underline;">Unsubscribe from Guild broadcasts</a></td></tr>`
      : "";
    const text = unsubscribeUrl
      ? `${body}\n\n--\n${footerSentence} Unsubscribe from Guild broadcasts: ${unsubscribeUrl}`
      : body;
    return { html: `${head}${footerHtml}${tail}`, text };
  };
}

export function buildBroadcastEmail(p: { bodyHtml: string; unsubscribeUrl: string }): {
  html: string;
  text: string;
} {
  return broadcastEmailBuilder(p.bodyHtml)(p.unsubscribeUrl);
}
