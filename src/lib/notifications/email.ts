import type { MemberNotificationRow } from "@/lib/supabase/types";
import { ORG_SHORT_NAME } from "@/lib/email/build-email-content";
import { typeDef } from "./registry";
import type { NoticeContext } from "./types";

/**
 * One member's notification email (spec, "Emails"): every item claimed for
 * that member in this run, each with its type's own wording from the
 * registry and its button (origin + path). A reminder is always labeled
 * "Reminder". Pure. Same look as the visit emails (guest-stop-email.ts).
 */
export type EmailItem = {
  row: MemberNotificationRow;
  sendKind: "notice" | "reminder";
  ctx: NoticeContext;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function itemContent(item: EmailItem): {
  heading: string;
  lines: string[];
  button: { label: string; path: string } | null;
} {
  const out = typeDef(item.row.type).email(item.row.details, item.ctx, item.sendKind);
  const heading =
    item.sendKind === "reminder" && !/^reminder\b/i.test(out.heading)
      ? `Reminder: ${out.heading}`
      : out.heading;
  return { ...out, heading };
}

export function buildNotificationEmail(args: {
  memberName: string;
  items: EmailItem[];
  origin: string;
  staging: boolean;
}): { subject: string; html: string; text: string } {
  const { memberName, items, origin } = args;
  const contents = items.map(itemContent);
  const allProblems = items.every((i) => i.row.kind === "problem");
  const subject =
    contents.length === 1
      ? contents[0].heading
      : `${memberName}: ${contents.length} ${allProblems ? "alerts" : "notifications"}`;

  const portalUrl = `${origin}/portal`;
  const footer = `You get this because you're on the team for ${memberName} on the ${ORG_SHORT_NAME} site. These also show in your Member Portal.`;

  const textParts: string[] = [];
  const htmlParts: string[] = [];
  for (const c of contents) {
    const href = c.button ? `${origin}${c.button.path}` : null;
    textParts.push(
      [c.heading, ...c.lines, ...(c.button && href ? [`${c.button.label}: ${href}`] : [])].join(
        "\n",
      ),
    );
    htmlParts.push(
      `<div style="margin: 0 0 24px;"><p style="font-size: 17px; font-weight: 700; margin: 0 0 8px;">${escapeHtml(c.heading)}</p>${c.lines
        .map((l) => `<p>${escapeHtml(l)}</p>`)
        .join("")}${
        c.button && href
          ? `<p><a href="${escapeHtml(href)}" style="display: inline-block; padding: 10px 18px; background: #BE5A0A; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600;">${escapeHtml(c.button.label)}</a></p>`
          : ""
      }</div>`,
    );
  }
  const intro =
    contents.length > 1 ? `Here are ${contents.length} updates for ${memberName}:` : null;

  return {
    subject: `${args.staging ? "[Staging] " : ""}${subject}`,
    text: [...(intro ? [intro] : []), ...textParts, `Member Portal: ${portalUrl}`, footer].join(
      "\n\n",
    ),
    html: `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${
      intro ? `<p>${escapeHtml(intro)}</p>` : ""
    }${htmlParts.join("")}<p style="color: #6B6156; font-size: 13px;"><a href="${escapeHtml(portalUrl)}">Your Member Portal</a><br>${escapeHtml(footer)}</p></div>`,
  };
}
