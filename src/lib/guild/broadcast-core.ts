import {
  audienceLabel,
  buildRecipients,
  matchMembers,
  type AudienceMember,
  type AudienceUserRow,
  type BroadcastAudience,
} from "@/lib/guild/broadcast-audience";
import { checkAttachmentAdd } from "@/lib/guild/broadcast-attachments";
import { buildBroadcastEmail, htmlToText, sanitizeBroadcastHtml } from "@/lib/guild/broadcast-html";
import type { BroadcastRecipient, OutgoingAttachment } from "@/lib/guild/broadcast-send";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";

/**
 * The Broadcast email screen's rules (docs/member-profiles.md, "Super
 * admin" > "Broadcast email screen", decisions 1-9), against a small
 * storage interface so they're testable without Supabase. broadcast.server.ts
 * supplies the real store (service-role client) through a gate that runs the
 * super admin check FIRST: every function here calls gate.requireSuperAdmin
 * before gate.openStore, so a refused caller never reaches the store.
 *
 * Inputs arrive from the browser, so every one is validated here: the
 * audience shape (uuids only), subject trimmed and at most 200 characters,
 * the body sanitized, and attachments limited to files already in the saved
 * draft (under draft/), with the draft's own metadata used, never the
 * client's.
 */

export const BROADCAST_FROM = "ISC Brewers Guild <hello@iscbrewersguild.org>";
export const BROADCAST_SUBJECT_MAX = 200;
export const BROADCAST_RECENT_LIMIT = 20;

export type BroadcastAttachment = {
  path: string;
  filename: string;
  size_bytes: number;
  content_type: string;
};

export type BroadcastDraft = {
  audience: BroadcastAudience;
  subject: string;
  bodyHtml: string;
  attachments: BroadcastAttachment[];
  updatedAt: string | null;
};

type AudienceColumns = {
  audience_type: BroadcastAudience["type"];
  audience_filter: { member_type: string | null; category_id: string | null } | null;
  member_ids: string[] | null;
};

/** broadcast_draft's columns (the single row, id = true). */
export type BroadcastDraftRow = AudienceColumns & {
  subject: string;
  body_html: string;
  attachments: BroadcastAttachment[];
  updated_at?: string | null;
};

export type BroadcastInsertRow = AudienceColumns & {
  id: string;
  sent_by_user_id: string;
  subject: string;
  body_html: string;
  attachments: BroadcastAttachment[];
  recipient_count: number;
  failed_emails: string[];
  status: "sent" | "failed";
};

export type BroadcastRecentRow = {
  id: string;
  sent_at: string;
  subject: string;
  audience_type: string;
  audience_filter: unknown;
  member_ids: string[] | null;
  recipient_count: number;
  status: string;
  failed_emails: string[] | null;
};

export type BroadcastAuditEntry = {
  actorUserId: string;
  tableName: "broadcast_emails";
  rowId: string;
  action: "insert";
  details: {
    subject: string;
    recipient_count: number;
    failed_count: number;
    failed_emails: string[];
    audience: string;
  };
};

export interface BroadcastStore {
  getDraft(): Promise<BroadcastDraftRow | null>;
  /** Upserts the single draft row. */
  saveDraft(row: BroadcastDraftRow, userId: string): Promise<void>;
  clearDraft(): Promise<void>;
  /** Newest first. */
  listRecent(limit: number): Promise<BroadcastRecentRow[]>;
  /** Every member with its category ids (the core keeps the active ones). */
  listMembers(): Promise<AudienceMember[]>;
  listCategories(): Promise<{ id: string; name: string }[]>;
  listMemberUsers(memberIds: string[]): Promise<AudienceUserRow[]>;
  emailsFor(userIds: string[]): Promise<Map<string, string | null>>;
  unsubscribedUserIds(): Promise<Set<string>>;
  uploadAttachment(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  removeAttachment(path: string): Promise<void>;
  downloadAttachment(path: string): Promise<Uint8Array>;
  insertBroadcast(row: BroadcastInsertRow): Promise<void>;
  /** Never throws: a logging failure is reported, not undone. */
  audit(entry: BroadcastAuditEntry): Promise<void>;
}

export type BroadcastActor = { userId: string; email: string | null };

export type BroadcastGate = {
  requireSuperAdmin(action: string): Promise<BroadcastActor>;
  openStore(): Promise<BroadcastStore>;
};

export type BroadcastMailer = {
  siteUrl: string;
  unsubscribeSecret: string;
  sendEmails(p: {
    replyTo: string;
    subject: string;
    recipients: BroadcastRecipient[];
    attachments: OutgoingAttachment[];
  }): Promise<{ sent: string[]; failed: string[] }>;
};

export type BroadcastAttachmentRef = { path: string };

export type BroadcastSendRequest = {
  audience: BroadcastAudience;
  subject: string;
  bodyHtml: string;
  attachments: BroadcastAttachmentRef[];
};

export type BroadcastRecentView = {
  id: string;
  sent_at: string;
  subject: string;
  audienceLabel: string;
  recipient_count: number;
  status: string;
  failedCount: number;
};

export type BroadcastPage = {
  draft: BroadcastDraft | null;
  recent: BroadcastRecentView[];
  members: { id: string; business_name: string; member_type: string }[];
  categories: { id: string; name: string }[];
  superAdminEmail: string;
};

export type BroadcastAudiencePreview = { memberCount: number; peopleCount: number; unsubscribedCount: number };

// ---------------------------------------------------------------- validation

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_TYPES = new Set(["producer", "mobile", "allied"]);
const AUDIENCE_ERROR = "Choose who gets this email.";
const NOT_IN_DRAFT = "That attachment isn't in the draft anymore.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAudience(value: unknown): BroadcastAudience {
  if (!isRecord(value)) throw new Error(AUDIENCE_ERROR);
  switch (value.type) {
    case "all":
      return { type: "all" };
    case "type_or_category": {
      const memberType = value.memberType ?? null;
      const categoryId = value.categoryId ?? null;
      if (memberType !== null && !(typeof memberType === "string" && MEMBER_TYPES.has(memberType))) {
        throw new Error(AUDIENCE_ERROR);
      }
      if (categoryId !== null && !(typeof categoryId === "string" && UUID.test(categoryId))) {
        throw new Error(AUDIENCE_ERROR);
      }
      return {
        type: "type_or_category",
        memberType: memberType as "producer" | "mobile" | "allied" | null,
        categoryId: categoryId as string | null,
      };
    }
    case "members": {
      const ids = value.memberIds;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
        throw new Error(AUDIENCE_ERROR);
      }
      return { type: "members", memberIds: [...new Set(ids as string[])] };
    }
    default:
      throw new Error(AUDIENCE_ERROR);
  }
}

function parseSubject(value: unknown): string {
  const subject = typeof value === "string" ? value.trim() : "";
  if (subject.length > BROADCAST_SUBJECT_MAX) throw new Error("The subject can be 200 characters at most.");
  return subject;
}

function parseBody(value: unknown): string {
  return sanitizeBroadcastHtml(typeof value === "string" ? value : "");
}

function bodyIsEmpty(sanitized: string): boolean {
  return htmlToText(sanitized).trim() === "";
}

/** The requested attachments, each resolved to the draft's own record (under draft/ only). */
function pickDraftAttachments(requested: unknown, draft: BroadcastDraftRow | null): BroadcastAttachment[] {
  if (requested === undefined || requested === null) return [];
  if (!Array.isArray(requested)) throw new Error(NOT_IN_DRAFT);
  const inDraft = draft?.attachments ?? [];
  const picked: BroadcastAttachment[] = [];
  for (const ref of requested) {
    const path = isRecord(ref) ? ref.path : undefined;
    if (typeof path !== "string" || !path.startsWith("draft/")) throw new Error(NOT_IN_DRAFT);
    const match = inDraft.find((a) => a.path === path);
    if (!match) throw new Error(NOT_IN_DRAFT);
    if (!picked.some((a) => a.path === path)) picked.push(match);
  }
  return picked;
}

// ------------------------------------------------------------ audience <-> columns

export function audienceToColumns(audience: BroadcastAudience): AudienceColumns {
  switch (audience.type) {
    case "all":
      return { audience_type: "all", audience_filter: null, member_ids: null };
    case "type_or_category":
      return {
        audience_type: "type_or_category",
        audience_filter: { member_type: audience.memberType, category_id: audience.categoryId },
        member_ids: null,
      };
    case "members":
      return { audience_type: "members", audience_filter: null, member_ids: audience.memberIds };
  }
}

/** Stored columns back to an audience; anything unreadable reads as All members. */
export function columnsToAudience(row: {
  audience_type: string;
  audience_filter: unknown;
  member_ids: string[] | null;
}): BroadcastAudience {
  try {
    switch (row.audience_type) {
      case "type_or_category": {
        const filter = isRecord(row.audience_filter) ? row.audience_filter : {};
        return parseAudience({
          type: "type_or_category",
          memberType: filter.member_type ?? null,
          categoryId: filter.category_id ?? null,
        });
      }
      case "members":
        return parseAudience({ type: "members", memberIds: row.member_ids ?? [] });
      default:
        return { type: "all" };
    }
  } catch {
    return { type: "all" };
  }
}

function draftView(row: BroadcastDraftRow): BroadcastDraft {
  return {
    audience: columnsToAudience(row),
    subject: row.subject,
    bodyHtml: row.body_html,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    updatedAt: row.updated_at ?? null,
  };
}

const EMPTY_DRAFT: BroadcastDraftRow = {
  audience_type: "all",
  audience_filter: null,
  member_ids: null,
  subject: "",
  body_html: "",
  attachments: [],
};

// ------------------------------------------------------------------ helpers

async function gated(gate: BroadcastGate, action: string) {
  const actor = await gate.requireSuperAdmin(action);
  return { actor, store: await gate.openStore() };
}

async function resolveAudience(store: BroadcastStore, audience: BroadcastAudience) {
  const matched = matchMembers(await store.listMembers(), audience);
  const userRows = matched.length > 0 ? await store.listMemberUsers(matched.map((m) => m.id)) : [];
  const unsubscribed = await store.unsubscribedUserIds();
  // Only owner-level users can be recipients; look up just those addresses.
  const ownerLevel = [
    ...new Set(
      userRows
        .filter((r) => (r.role === "owner" || r.role === "co_owner") && !unsubscribed.has(r.user_id))
        .map((r) => r.user_id),
    ),
  ];
  const emails = ownerLevel.length > 0 ? await store.emailsFor(ownerLevel) : new Map<string, string | null>();
  return buildRecipients(matched, userRows, emails, unsubscribed);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Downloaded and base64'd once, reused for every recipient. */
async function loadAttachments(store: BroadcastStore, attachments: BroadcastAttachment[]): Promise<OutgoingAttachment[]> {
  return Promise.all(
    attachments.map(async (a) => ({ filename: a.filename, content: toBase64(await store.downloadAttachment(a.path)) })),
  );
}

/** [A-Za-z0-9._-] only, at most 100 characters. */
export function sanitizeAttachmentFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  return cleaned.replace(/^\.+/, "_") || "file";
}

function validateMessage(input: { subject: unknown; bodyHtml: unknown }) {
  const subject = parseSubject(input.subject);
  if (!subject) throw new Error("Add a subject.");
  const bodyHtml = parseBody(input.bodyHtml);
  if (bodyIsEmpty(bodyHtml)) throw new Error("Write a message.");
  return { subject, bodyHtml };
}

function requireActorEmail(actor: BroadcastActor): string {
  if (!actor.email) throw new Error("Your account has no email address to send from.");
  return actor.email;
}

// --------------------------------------------------------------- the actions

export async function loadBroadcastPage(gate: BroadcastGate): Promise<BroadcastPage> {
  const { actor, store } = await gated(gate, "send broadcast emails");
  const [draft, recent, members, categories] = await Promise.all([
    store.getDraft(),
    store.listRecent(BROADCAST_RECENT_LIMIT),
    store.listMembers(),
    store.listCategories(),
  ]);
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const active = matchMembers(members, { type: "all" });
  return {
    draft: draft ? draftView(draft) : null,
    recent: [...recent]
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
      .slice(0, BROADCAST_RECENT_LIMIT)
      .map((row) => ({
        id: row.id,
        sent_at: row.sent_at,
        subject: row.subject,
        audienceLabel: audienceLabel(columnsToAudience(row), new Map(), categoryNames),
        recipient_count: row.recipient_count,
        status: row.status,
        failedCount: row.failed_emails?.length ?? 0,
      })),
    members: active
      .map((m) => ({ id: m.id, business_name: m.business_name, member_type: m.member_type }))
      .sort((a, b) => a.business_name.localeCompare(b.business_name)),
    categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    superAdminEmail: actor.email ?? "",
  };
}

export async function previewBroadcastAudienceCore(
  gate: BroadcastGate,
  input: { audience: unknown },
): Promise<BroadcastAudiencePreview> {
  const { store } = await gated(gate, "send broadcast emails");
  const audience = parseAudience(input?.audience);
  const result = await resolveAudience(store, audience);
  return {
    memberCount: result.memberCount,
    peopleCount: result.recipients.length,
    unsubscribedCount: result.unsubscribedCount,
  };
}

export async function saveBroadcastDraftCore(
  gate: BroadcastGate,
  input: { audience: unknown; subject: unknown; bodyHtml: unknown; attachments: unknown },
): Promise<{ ok: true }> {
  const { actor, store } = await gated(gate, "save a broadcast draft");
  const audience = parseAudience(input?.audience);
  const subject = parseSubject(input?.subject);
  const bodyHtml = parseBody(input?.bodyHtml);
  const current = await store.getDraft();
  const attachments = pickDraftAttachments(input?.attachments, current);
  await store.saveDraft(
    { ...audienceToColumns(audience), subject, body_html: bodyHtml, attachments },
    actor.userId,
  );
  return { ok: true };
}

export async function addBroadcastAttachment(
  gate: BroadcastGate,
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<BroadcastAttachment> {
  const { actor, store } = await gated(gate, "attach files to a broadcast");
  if (file.bytes.length === 0) throw new Error("That file is empty.");
  const current = await store.getDraft();
  const existing = current?.attachments ?? [];
  const check = checkAttachmentAdd(existing, { size: file.bytes.length, type: file.type });
  if (!check.ok) throw new Error(check.message);

  const filename = sanitizeAttachmentFilename(file.name);
  const attachment: BroadcastAttachment = {
    path: `draft/${crypto.randomUUID()}/${filename}`,
    filename,
    size_bytes: file.bytes.length,
    content_type: file.type,
  };
  await store.uploadAttachment(attachment.path, file.bytes, file.type);
  try {
    await store.saveDraft(
      { ...(current ?? EMPTY_DRAFT), attachments: [...existing, attachment] },
      actor.userId,
    );
  } catch (err) {
    await store.removeAttachment(attachment.path).catch(() => {});
    throw err;
  }
  return attachment;
}

export async function removeBroadcastAttachmentCore(
  gate: BroadcastGate,
  input: { path: unknown },
): Promise<{ ok: true }> {
  const { actor, store } = await gated(gate, "remove a broadcast attachment");
  const current = await store.getDraft();
  // Only a file still in the draft: a sent broadcast's files (also under
  // draft/) are referenced by its row and must stay.
  const [attachment] = pickDraftAttachments([{ path: input?.path }], current);
  await store.removeAttachment(attachment.path);
  await store.saveDraft(
    { ...current!, attachments: current!.attachments.filter((a) => a.path !== attachment.path) },
    actor.userId,
  );
  return { ok: true };
}

export async function sendBroadcastTestCore(
  gate: BroadcastGate,
  input: { subject: unknown; bodyHtml: unknown; attachments: unknown },
  openMailer: () => Promise<BroadcastMailer>,
): Promise<{ sentTo: string }> {
  const { actor, store } = await gated(gate, "send a broadcast test");
  const to = requireActorEmail(actor);
  const { subject, bodyHtml } = validateMessage(input ?? {});
  const attachments = pickDraftAttachments(input?.attachments, await store.getDraft());
  const outgoing = await loadAttachments(store, attachments);
  const mailer = await openMailer();
  const { html, text } = buildBroadcastEmail({ bodyHtml, unsubscribeUrl: "" });
  const result = await mailer.sendEmails({
    replyTo: to,
    subject,
    recipients: [{ email: to, html, text, unsubscribeUrl: null, oneClickUrl: null }],
    attachments: outgoing,
  });
  if (result.sent.length === 0) throw new Error("Couldn't send the test email. Try again.");
  return { sentTo: to };
}

export async function sendBroadcastCore(
  gate: BroadcastGate,
  input: { audience: unknown; subject: unknown; bodyHtml: unknown; attachments: unknown },
  openMailer: () => Promise<BroadcastMailer>,
): Promise<{ sent: number; failed: string[]; memberCount: number }> {
  const { actor, store } = await gated(gate, "send a broadcast email");
  const replyTo = requireActorEmail(actor);
  const audience = parseAudience(input?.audience);
  const { subject, bodyHtml } = validateMessage(input ?? {});
  const attachments = pickDraftAttachments(input?.attachments, await store.getDraft());

  // Fresh at send time, never the preview's numbers.
  const { recipients, memberCount } = await resolveAudience(store, audience);
  if (recipients.length === 0) throw new Error("No one to send to.");

  const outgoing = await loadAttachments(store, attachments);
  const mailer = await openMailer();
  const personal: BroadcastRecipient[] = await Promise.all(
    recipients.map(async (r) => {
      const token = await signUnsubscribeToken(r.userId, mailer.unsubscribeSecret);
      const unsubscribeUrl = `${mailer.siteUrl}/unsubscribe/${token}`;
      const { html, text } = buildBroadcastEmail({ bodyHtml, unsubscribeUrl });
      return { email: r.email, html, text, unsubscribeUrl, oneClickUrl: `${mailer.siteUrl}/api/unsubscribe/${token}` };
    }),
  );
  const result = await mailer.sendEmails({ replyTo, subject, recipients: personal, attachments: outgoing });

  const categories = audience.type === "type_or_category" && audience.categoryId ? await store.listCategories() : [];
  const label = audienceLabel(audience, new Map(), new Map(categories.map((c) => [c.id, c.name])));
  const rowId = crypto.randomUUID();
  // The emails already went out: from here on a failure is logged, never
  // thrown, so the super admin isn't invited to send it all again.
  try {
    await store.insertBroadcast({
      id: rowId,
      sent_by_user_id: actor.userId,
      subject,
      body_html: bodyHtml,
      attachments,
      ...audienceToColumns(audience),
      recipient_count: result.sent.length,
      failed_emails: result.failed,
      status: result.sent.length > 0 ? "sent" : "failed",
    });
  } catch (err) {
    console.error("Broadcast: couldn't save the broadcast_emails row", err);
  }
  await store.audit({
    actorUserId: actor.userId,
    tableName: "broadcast_emails",
    rowId,
    action: "insert",
    details: {
      subject,
      recipient_count: result.sent.length,
      failed_count: result.failed.length,
      failed_emails: result.failed,
      audience: label,
    },
  });
  // Nothing accepted (bad key, Resend down): keep the draft so the composed
  // message isn't lost and can be sent again.
  if (result.sent.length > 0) {
    try {
      await store.clearDraft();
    } catch (err) {
      console.error("Broadcast: couldn't clear the draft", err);
    }
  }
  return { sent: result.sent.length, failed: result.failed, memberCount };
}
