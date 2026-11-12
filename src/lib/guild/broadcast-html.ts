import { ORG_SHORT_NAME } from "@/lib/email/build-email-content";

const KEEP_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);

// A tag, tolerating ">" inside quoted attribute values.
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

function safeHref(attrs: string): string | null {
  const m = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return null;
  const value = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  if (!/^(https?:|mailto:)/i.test(value)) return null;
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Reduces pasted/typed HTML to p, br, strong, b, em, i, u, ul, ol, li and
 * links (http, https, mailto only). Other tags are unwrapped (text kept);
 * script, style and iframe are dropped with their contents. No DOM needed.
 */
export function sanitizeBroadcastHtml(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<(script|style|iframe)\b[\s\S]*?(<\/\1\s*>|$)/gi, "");

  const aStack: boolean[] = [];
  s = s.replace(TAG_RE, (_all, slash: string, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (KEEP_TAGS.has(name)) return slash ? `</${name}>` : `<${name}>`;
    if (name === "a") {
      if (slash) return aStack.pop() ? "</a>" : "";
      const href = safeHref(attrs);
      aStack.push(href !== null);
      return href !== null ? `<a href="${href}">` : "";
    }
    return "";
  });
  return s;
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
    .replace(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, d: string, sq: string, inner: string) => {
      const url = decodeEntities(d ?? sq ?? "");
      const label = decodeEntities(inner.replace(/<[^>]*>/g, "")).trim();
      if (!label || label === url.replace(/^mailto:/i, "")) return url;
      return `${label} (${url})`;
    })
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
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildBroadcastEmail(p: { bodyHtml: string; unsubscribeUrl: string }): {
  html: string;
  text: string;
} {
  const footerSentence = `You're getting this because you're on a member profile with the ${ORG_SHORT_NAME}.`;
  const footerHtml = p.unsubscribeUrl
    ? `<tr><td style="padding: 16px 24px 24px; border-top: 1px solid #E5DED4; font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #6B6156;">${footerSentence} <a href="${escapeAttr(p.unsubscribeUrl)}" style="color: #6B6156; text-decoration: underline;">Unsubscribe from Guild broadcasts</a></td></tr>`
    : "";
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #F7F3EC;"><tr><td align="center" style="padding: 24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: #FFFFFF; border-radius: 8px;"><tr><td style="padding: 24px; font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${p.bodyHtml}</td></tr>${footerHtml}</table></td></tr></table>`;
  const body = htmlToText(p.bodyHtml);
  const text = p.unsubscribeUrl
    ? `${body}\n\n--\n${footerSentence} Unsubscribe from Guild broadcasts: ${p.unsubscribeUrl}`
    : body;
  return { html, text };
}
