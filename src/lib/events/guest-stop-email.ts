import type { GuestStopNoticeRow } from "@/lib/supabase/types";
import { formatTimeRange } from "@/components/profile/EventsModule";
import { ORG_SHORT_NAME } from "@/lib/email/build-email-content";

/** The taproom's email about Guild members' visits (spec, "Emails"; artboard GV2). Pure. */
export type EmailVisit = GuestStopNoticeRow & { buttons: Array<{ label: string; href: string }> };

export function groupNotices(notes: GuestStopNoticeRow[]): Map<string, GuestStopNoticeRow[]> {
  const byHostEvent = new Map<string, GuestStopNoticeRow[]>();
  for (const note of [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = `${note.host_member_id}|${note.event_id ?? note.id}`;
    byHostEvent.set(key, [...(byHostEvent.get(key) ?? []), note]);
  }
  const out = new Map<string, GuestStopNoticeRow[]>();
  for (const list of byHostEvent.values()) {
    // What the taproom should hear is decided by where the visit ended up
    // in this run: the notes after the last cancel are what's new since.
    const last = list[list.length - 1];
    const lastCancel = list.map((x) => x.kind).lastIndexOf("canceled");
    const opening = list.find((x) => x.kind === "new" || x.kind === "request");
    let merged: GuestStopNoticeRow | null;
    if (last.kind === "canceled") {
      // Announced and canceled within one run: the taproom never heard of it.
      merged = opening && list.indexOf(opening) < lastCancel ? null : last;
    } else {
      const since = list.slice(lastCancel + 1);
      const reopened = since.find((x) => x.kind === "new" || x.kind === "request");
      const firstChange = since.find((x) => x.kind === "changed");
      merged = reopened
        ? { ...last, kind: reopened.kind, old_starts_at: null, old_ends_at: null }
        : { ...last, kind: "changed", old_starts_at: firstChange?.old_starts_at ?? null, old_ends_at: firstChange?.old_ends_at ?? null };
    }
    if (!merged) continue;
    const host = merged.host_member_id;
    out.set(host, [...(out.get(host) ?? []), merged]);
  }
  for (const list of out.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return out;
}

function day(iso: string, tz: string, style: "long" | "short"): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: style, month: style, day: "numeric", timeZone: tz });
}

function when(startsAt: string, endsAt: string | null, allDay: boolean, tz: string): string {
  return `${day(startsAt, tz, "long")} · ${allDay ? "All day" : formatTimeRange(startsAt, endsAt, tz)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function who(v: GuestStopNoticeRow): string {
  return v.title ? `${v.guest_name} — ${v.title}` : v.guest_name;
}

function lines(v: EmailVisit, taproom: string, street: string | null, tz: string): { intro: string; detail: string[]; after: string } {
  const place = street ? `${taproom} · ${street}` : taproom;
  const now = when(v.starts_at, v.ends_at, v.all_day, tz);
  switch (v.kind) {
    case "new":
      return { intro: `${who(v)}, a Guild member, listed a stop at your taproom:`, detail: [now, place], after: "It's on your page now." };
    case "request":
      return { intro: `${who(v)}, a Guild member, would like to be listed at your taproom:`, detail: [now, place], after: "Nothing shows on your page until you approve." };
    case "changed":
      return {
        intro: `${who(v)} changed their stop at your taproom:`,
        detail: [`${v.old_starts_at ? when(v.old_starts_at, v.old_ends_at, v.all_day, tz) : ""} → ${now}`, place],
        after: v.buttons.some((b) => b.label === "Approve") ? "It's still waiting for your approval." : "Your page already shows the new date.",
      };
    case "canceled":
      return { intro: `${who(v)} canceled their stop at your taproom:`, detail: [now, place], after: "It's off your page." };
  }
}

function subjectFor(visits: EmailVisit[], taproom: string, tz: string): string {
  if (visits.length > 1) {
    return visits.every((v) => v.kind === "request")
      ? `${visits.length} visits to approve at ${taproom}`
      : `${visits.length} Guild member visits at ${taproom}`;
  }
  const v = visits[0];
  const short = day(v.starts_at, tz, "short");
  switch (v.kind) {
    case "new":
      return `${v.guest_name} is coming to ${taproom} · ${short}`;
    case "request":
      return `Approve a visit? ${v.guest_name} · ${short}`;
    case "changed":
      return `Changed: ${v.guest_name} moved to ${short}`;
    case "canceled":
      return `Canceled: ${v.guest_name} · ${short}`;
  }
}

export function buildGuestStopEmail(args: {
  taproomName: string;
  street: string | null;
  timezone: string;
  visits: EmailVisit[];
  pageUrl: string;
  eventsUrl: string;
  staging: boolean;
}): { subject: string; html: string; text: string } {
  const { taproomName, street, timezone, visits, pageUrl, eventsUrl } = args;
  const footer = `You get this because you're an owner or editor of ${taproomName} on the ${ORG_SHORT_NAME} site. Choose Show right away or Ask me first on your Events page.`;
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  for (const v of visits) {
    const l = lines(v, taproomName, street, timezone);
    const buttons = [{ label: "See your page", href: pageUrl }, ...v.buttons];
    textParts.push([l.intro, ...l.detail, l.after, ...buttons.map((b) => `${b.label}: ${b.href}`)].join("\n"));
    htmlParts.push(
      `<div style="margin: 0 0 24px;"><p>${escapeHtml(l.intro)}</p><p><strong>${l.detail.map(escapeHtml).join("<br>")}</strong></p><p>${escapeHtml(l.after)}</p><p>${buttons
        .map((b, i) =>
          i === 0
            ? `<a href="${escapeHtml(b.href)}" style="margin-right: 12px;">${escapeHtml(b.label)}</a>`
            : `<a href="${escapeHtml(b.href)}" style="display: inline-block; margin-right: 8px; padding: 10px 18px; background: #BE5A0A; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600;">${escapeHtml(b.label)}</a>`,
        )
        .join("")}</p></div>`,
    );
  }
  const events = `Your Events page: ${eventsUrl}`;
  return {
    subject: `${args.staging ? "[Staging] " : ""}${subjectFor(visits, taproomName, timezone)}`,
    text: [...textParts, events, footer].join("\n\n"),
    html: `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${htmlParts.join("")}<p style="color: #6B6156; font-size: 13px;"><a href="${escapeHtml(eventsUrl)}">Your Events page</a><br>${escapeHtml(footer)}</p></div>`,
  };
}
