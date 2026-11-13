import {
  audienceLabel,
  buildRecipients,
  matchMembers,
  type AudienceMember,
  type AudienceUserRow,
  type BroadcastAudience,
} from "@/lib/guild/broadcast-audience";
import { checkAttachmentAdd } from "@/lib/guild/broadcast-attachments";
import {
  broadcastEmailBuilder,
  buildBroadcastEmail,
  htmlToText,
  sanitizeBroadcastHtml,
} from "@/lib/guild/broadcast-html";
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

export const BROADCAST_FROM = "ISC Brewers Guild <hello@mail.iscbrewersguild.org>";
export const BROADCAST_SUBJECT_MAX = 200;
export const BROADCAST_RECENT_LIMIT = 20;
/**
 * A 'sending' row not touched (updated_at) for this long was cut off: the
 * screen sends a batch every few seconds while it's open, so it's
 * interrupted and can be finished with Finish sending.
 */
export const BROADCAST_SENDING_STALE_MS = 15 * 60 * 1000;
/**
 * People per continueBroadcast request. The site is on the Cloudflare
 * Workers Free plan: at most 50 subrequests (every fetch -- Supabase,
 * Resend, signed URLs) per request, so a send is split into batches, each
 * its own request, driven by the browser. See continueBroadcastCore for the
 * count.
 */
export const BROADCAST_BATCH_SIZE = 10;
/** Signed attachment links Resend fetches; an hour covers any send. */
export const BROADCAST_ATTACHMENT_URL_SECONDS = 3600;

export const STILL_SENDING =
  "A broadcast is still sending. Wait a few minutes and check Recent broadcasts.";
export const COULDNT_START = "Couldn't start the send. Nothing was sent.";
export const AUDIENCE_LOOKUP_FAILED = "Couldn't look up who gets this email. Try again.";
export const BROADCAST_NOT_FOUND = "That broadcast wasn't found.";
/** The sanitized body's limit (bytes): every email carries it, 10 per request. */
export const BROADCAST_BODY_MAX_BYTES = 100 * 1024;
export const BODY_TOO_LONG = "That message is too long. Shorten it or attach a file instead.";
export const ATTACHMENT_MISSING =
  "An attachment for this broadcast is missing, so it can't be finished. Use Mark as stopped.";
export const STILL_GOING = "That broadcast is still sending. Wait a few minutes and check again.";
/** Same words as the screen's LOST_CONTACT_MESSAGE (broadcast-screen-helpers.ts). */
export const LOST_CONTACT =
  "We lost contact while sending. Check Recent broadcasts and the Audit log before sending again.";

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

/** One person a broadcast goes to, resolved when the send starts. */
export type BroadcastPendingRecipient = { userId: string; email: string };

export type BroadcastInsertRow = AudienceColumns & {
  id: string;
  sent_by_user_id: string;
  subject: string;
  body_html: string;
  attachments: BroadcastAttachment[];
  recipient_count: number;
  failed_emails: string[];
  status: "sending";
  /** Everyone it goes to, in order; batches walk it from next_index. */
  pending_recipients: BroadcastPendingRecipient[];
  next_index: number;
  /** pending_recipients' length, so Recent broadcasts can say "N of M" without loading the list. */
  total_recipients: number;
};

/** What a batch needs from the broadcast_emails row. */
export type BroadcastJobRow = AudienceColumns & {
  id: string;
  created_at: string;
  updated_at: string;
  total_recipients: number;
  subject: string;
  body_html: string;
  attachments: BroadcastAttachment[];
  recipient_count: number;
  failed_emails: string[];
  status: string;
  pending_recipients: BroadcastPendingRecipient[];
  next_index: number;
};

/** After a batch: how far the send got (and, on the last batch, its final status). */
export type BroadcastProgressPatch = {
  next_index: number;
  recipient_count: number;
  failed_emails: string[];
  status?: "sent" | "failed";
  /** Emptied when the send ends: the list is only needed while sending. */
  pending_recipients?: [];
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
  updated_at: string;
  next_index: number;
  total_recipients: number;
};

export type BroadcastAuditEntry = {
  actorUserId: string;
  tableName: "broadcast_emails";
  rowId: string;
} & (
  | {
      /** Written before the first email: the send has started. */
      action: "insert";
      details: { subject: string; audience: string; planned_count: number; status: "sending" };
    }
  | {
      /** Written once the send finished: what Resend accepted and refused. */
      action: "update";
      details: {
        subject: string;
        recipient_count: number;
        failed_count: number;
        failed_emails: string[];
        audience: string;
      };
    }
  | {
      /** An interrupted send the super admin gave up on (Mark as stopped). */
      action: "update";
      details: {
        stopped: true;
        subject: string;
        recipient_count: number;
        failed_count: number;
        stopped_after: number;
        planned_count: number;
      };
    }
);

export interface BroadcastStore {
  getDraft(): Promise<BroadcastDraftRow | null>;
  /** Upserts the single draft row. */
  saveDraft(row: BroadcastDraftRow, userId: string): Promise<void>;
  /**
   * Deletes the draft only if it wasn't saved after savedBy (a newer draft,
   * written while a send was paused, is kept).
   */
  clearDraftIfSavedBy(savedBy: string): Promise<void>;
  /** Does any broadcast_emails row (sending or sent) list this attachment path? */
  attachmentInUse(path: string): Promise<boolean>;
  /** Which of these users have unsubscribed (one query per batch). */
  unsubscribedAmong(userIds: string[]): Promise<Set<string>>;
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
  /** A short-lived signed URL Resend can fetch the file from. */
  signAttachmentUrl(path: string): Promise<string>;
  /** Is there a broadcast_emails row with status 'sending' and updated_at >= sinceIso? */
  hasSendingSince(sinceIso: string): Promise<boolean>;
  insertBroadcast(row: BroadcastInsertRow): Promise<void>;
  getBroadcast(id: string): Promise<BroadcastJobRow | null>;
  /**
   * Applies the patch (and updated_at = now) only while the row is still
   * 'sending' at next_index = fromIndex; false when it had already moved on
   * (another tab finished that batch), so counts are never double-added.
   */
  advanceBroadcast(id: string, fromIndex: number, patch: BroadcastProgressPatch): Promise<boolean>;
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
  /** sent, failed, sending (still going), or interrupted (a 'sending' row untouched for 15 minutes). */
  status: string;
  failedCount: number;
  /** People tried so far (sent or refused) and in all; "interrupted after N of M". */
  processedCount: number;
  totalCount: number;
  /** Interrupted: Finish sending can pick it up where it stopped. */
  canResume: boolean;
};

export type BroadcastStartResult = { id: string; total: number; memberCount: number };
export type BroadcastContinueResult = {
  done: boolean;
  /** People tried or skipped so far (next_index): the progress bar. */
  processed: number;
  sentSoFar: number;
  failedSoFar: number;
  total: number;
  /** Every address refused so far. */
  failed: string[];
};

export type BroadcastPage = {
  draft: BroadcastDraft | null;
  recent: BroadcastRecentView[];
  members: { id: string; business_name: string; member_type: string }[];
  categories: { id: string; name: string }[];
  superAdminEmail: string;
};

export type BroadcastAudiencePreview = {
  memberCount: number;
  peopleCount: number;
  unsubscribedCount: number;
};

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
      if (
        memberType !== null &&
        !(typeof memberType === "string" && MEMBER_TYPES.has(memberType))
      ) {
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
  if (subject.length > BROADCAST_SUBJECT_MAX)
    throw new Error("The subject can be 200 characters at most.");
  return subject;
}

function parseBody(value: unknown): string {
  return sanitizeBroadcastHtml(typeof value === "string" ? value : "");
}

function bodyIsEmpty(sanitized: string): boolean {
  return htmlToText(sanitized).trim() === "";
}

/** The requested attachments, each resolved to the draft's own record (under draft/ only). */
function pickDraftAttachments(
  requested: unknown,
  draft: BroadcastDraftRow | null,
): BroadcastAttachment[] {
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
        .filter(
          (r) => (r.role === "owner" || r.role === "co_owner") && !unsubscribed.has(r.user_id),
        )
        .map((r) => r.user_id),
    ),
  ];
  const emails =
    ownerLevel.length > 0 ? await store.emailsFor(ownerLevel) : new Map<string, string | null>();
  return buildRecipients(matched, userRows, emails, unsubscribed);
}

/**
 * One signed URL per file, once per request (the start check, or a batch),
 * reused for every recipient in it: Resend fetches the file itself, so the
 * Worker never holds the bytes.
 */
async function signAttachments(
  store: BroadcastStore,
  attachments: BroadcastAttachment[],
): Promise<OutgoingAttachment[]> {
  return Promise.all(
    attachments.map(async (a) => ({
      filename: a.filename,
      path: await store.signAttachmentUrl(a.path),
    })),
  );
}

type UserPage = { users: { id: string; email?: string | null }[]; error: unknown };

/**
 * Every wanted user id mapped to its email (null when missing), paging
 * through the auth users 1000 at a time instead of one lookup per person.
 * A failed page refuses the whole lookup rather than silently dropping people.
 */
export async function collectUserEmails(
  userIds: string[],
  listPage: (page: number, perPage: number) => Promise<UserPage>,
): Promise<Map<string, string | null>> {
  const PER_PAGE = 1000;
  const MAX_PAGES = 200;
  const wanted = new Set(userIds);
  const emails = new Map<string, string | null>();
  for (let page = 1; page <= MAX_PAGES && emails.size < wanted.size; page++) {
    const { users, error } = await listPage(page, PER_PAGE);
    if (error) {
      console.error("Broadcast: couldn't list users", error);
      throw new Error(AUDIENCE_LOOKUP_FAILED);
    }
    for (const u of users) if (wanted.has(u.id)) emails.set(u.id, u.email ?? null);
    if (users.length < PER_PAGE) break;
  }
  for (const id of wanted) if (!emails.has(id)) emails.set(id, null);
  return emails;
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
  if (new TextEncoder().encode(bodyHtml).length > BROADCAST_BODY_MAX_BYTES)
    throw new Error(BODY_TOO_LONG);
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
      .map((row) => {
        const interrupted =
          row.status === "sending" &&
          Date.now() - Date.parse(row.updated_at) > BROADCAST_SENDING_STALE_MS;
        return {
          id: row.id,
          sent_at: row.sent_at,
          subject: row.subject,
          audienceLabel: audienceLabel(columnsToAudience(row), new Map(), categoryNames),
          recipient_count: row.recipient_count,
          status: interrupted ? "interrupted" : row.status,
          failedCount: row.failed_emails?.length ?? 0,
          processedCount: row.next_index ?? 0,
          totalCount: row.total_recipients ?? 0,
          canResume: interrupted,
        };
      }),
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
  // Only a file still in the draft.
  const [attachment] = pickDraftAttachments([{ path: input?.path }], current);
  // Draft first: if the file delete then fails, it only orphans a file,
  // never leaves the draft pointing at a file that's gone.
  await store.saveDraft(
    { ...current!, attachments: current!.attachments.filter((a) => a.path !== attachment.path) },
    actor.userId,
  );
  // A broadcast row (a paused send, or a sent one) using the same file keeps
  // it: deleting it would make a paused send impossible to finish. When we
  // can't tell, keep the file (an unused file is harmless).
  let inUse: boolean;
  try {
    inUse = await store.attachmentInUse(attachment.path);
  } catch (err) {
    console.error("Broadcast: couldn't check whether a broadcast uses the file; kept it", err);
    inUse = true;
  }
  if (inUse) return { ok: true };
  try {
    await store.removeAttachment(attachment.path);
  } catch (err) {
    console.error(
      "Broadcast: couldn't delete a removed attachment's file (orphaned)",
      attachment.path,
      err,
    );
  }
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
  const outgoing = await signAttachments(store, attachments);
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

/**
 * Each person's own copy: the email is built once per batch and only their
 * footer (unsubscribe links, signed locally, no subrequest) is added. The
 * idempotency key (broadcast id + their place in the list) lets Resend drop
 * a repeat if a batch is sent again after a lost connection.
 */
async function personalize(
  people: { person: BroadcastPendingRecipient; index: number }[],
  broadcastId: string,
  bodyHtml: string,
  mailer: BroadcastMailer,
): Promise<BroadcastRecipient[]> {
  const build = broadcastEmailBuilder(bodyHtml);
  return Promise.all(
    people.map(async ({ person, index }) => {
      const token = await signUnsubscribeToken(person.userId, mailer.unsubscribeSecret);
      const unsubscribeUrl = `${mailer.siteUrl}/unsubscribe/${token}`;
      const { html, text } = build(unsubscribeUrl);
      return {
        email: person.email,
        html,
        text,
        unsubscribeUrl,
        oneClickUrl: `${mailer.siteUrl}/api/unsubscribe/${token}`,
        idempotencyKey: `bc-${broadcastId}-${index}`,
      };
    }),
  );
}

async function labelFor(store: BroadcastStore, audience: BroadcastAudience): Promise<string> {
  const categories =
    audience.type === "type_or_category" && audience.categoryId ? await store.listCategories() : [];
  return audienceLabel(audience, new Map(), new Map(categories.map((c) => [c.id, c.name])));
}

/**
 * Starts a broadcast WITHOUT sending anything: validates, resolves who gets
 * it (fresh, never the preview's numbers), and writes the broadcast_emails
 * row ('sending', with the full recipient list) and its first audit row.
 * The browser then calls continueBroadcastCore until it says done. The
 * draft stays until the last batch.
 */
export async function startBroadcastCore(
  gate: BroadcastGate,
  input: { audience: unknown; subject: unknown; bodyHtml: unknown; attachments: unknown },
  openMailer: () => Promise<BroadcastMailer>,
): Promise<BroadcastStartResult> {
  const { actor, store } = await gated(gate, "send a broadcast email");
  requireActorEmail(actor);
  const audience = parseAudience(input?.audience);
  const { subject, bodyHtml } = validateMessage(input ?? {});
  const attachments = pickDraftAttachments(input?.attachments, await store.getDraft());

  const { recipients, memberCount } = await resolveAudience(store, audience);
  if (recipients.length === 0) throw new Error("No one to send to.");

  // Everything that can refuse does so before the row is written: an
  // unreadable attachment, or email not set up on this site.
  await signAttachments(store, attachments);
  await openMailer();
  const label = await labelFor(store, audience);

  // Server-side double-submit guard: a second tab, a double click, or a
  // retry after a dropped connection while another send is still going.
  // (Finish sending continues a row; it never comes through here.)
  let busy: boolean;
  try {
    busy = await store.hasSendingSince(
      new Date(Date.now() - BROADCAST_SENDING_STALE_MS).toISOString(),
    );
  } catch (err) {
    console.error("Broadcast: couldn't check for a send in progress", err);
    throw new Error(COULDNT_START);
  }
  if (busy) throw new Error(STILL_SENDING);

  const rowId = crypto.randomUUID();
  const pending = recipients.map((r) => ({ userId: r.userId, email: r.email }));
  try {
    await store.insertBroadcast({
      id: rowId,
      sent_by_user_id: actor.userId,
      subject,
      body_html: bodyHtml,
      attachments,
      ...audienceToColumns(audience),
      recipient_count: 0,
      failed_emails: [],
      status: "sending",
      pending_recipients: pending,
      next_index: 0,
      total_recipients: pending.length,
    });
  } catch (err) {
    console.error("Broadcast: couldn't save the broadcast_emails row", err);
    throw new Error(COULDNT_START);
  }
  await store.audit({
    actorUserId: actor.userId,
    tableName: "broadcast_emails",
    rowId,
    action: "insert",
    details: { subject, audience: label, planned_count: pending.length, status: "sending" },
  });
  return { id: rowId, total: pending.length, memberCount };
}

/**
 * Sends the next BROADCAST_BATCH_SIZE people of a started broadcast, then
 * records how far it got. On the last batch it sets 'sent' (or 'failed' when
 * no one was accepted), writes the second audit row and clears the draft
 * (only if at least one email was accepted). A finished row sends nothing.
 *
 * Subrequests per call (Workers Free plan limit: 50), at most:
 *   gate: auth getUser + profiles select ............. 2 (3 with a token refresh)
 *   load the row ...................................... 1
 *   unsubscribes among this batch ..................... 1
 *   sign attachment URLs (5 files at most) ............ 5
 *   Resend, one per person ........................... 10 (20 if every one is retried after a 429)
 *   record progress ................................... 1
 *   last batch only: categories (label), audit, draft . 3
 *   total ............................................ 23 (34 worst case)
 * Nothing per person touches Supabase: unsubscribe tokens are signed locally.
 */
export async function continueBroadcastCore(
  gate: BroadcastGate,
  input: { id: unknown },
  openMailer: () => Promise<BroadcastMailer>,
): Promise<BroadcastContinueResult> {
  const { actor, store } = await gated(gate, "send a broadcast email");
  const replyTo = requireActorEmail(actor);
  const id = typeof input?.id === "string" && UUID.test(input.id) ? input.id : null;
  if (!id) throw new Error(BROADCAST_NOT_FOUND);
  const row = await store.getBroadcast(id);
  if (!row) throw new Error(BROADCAST_NOT_FOUND);

  const pending = Array.isArray(row.pending_recipients) ? row.pending_recipients : [];
  const total = row.total_recipients;
  const previousFailed = row.failed_emails ?? [];
  if (row.status !== "sending") {
    // Already finished (a repeated call, or another tab): nothing to send.
    return {
      done: true,
      processed: row.next_index,
      sentSoFar: row.recipient_count,
      failedSoFar: previousFailed.length,
      total,
      failed: previousFailed,
    };
  }

  const from = row.next_index;
  const batch = pending
    .slice(from, from + BROADCAST_BATCH_SIZE)
    .map((person, i) => ({ person, index: from + i }));
  let result: { sent: string[]; failed: string[] } = { sent: [], failed: [] };
  if (batch.length > 0) {
    // Someone who unsubscribed after the send started is skipped (counted
    // neither sent nor failed).
    const unsubscribed = await store.unsubscribedAmong(batch.map((b) => b.person.userId));
    const toSend = batch.filter((b) => !unsubscribed.has(b.person.userId));
    if (toSend.length > 0) {
      let outgoing: OutgoingAttachment[];
      try {
        outgoing = await signAttachments(
          store,
          Array.isArray(row.attachments) ? row.attachments : [],
        );
      } catch (err) {
        console.error("Broadcast: an attachment of a started send can't be read", id, err);
        throw new Error(ATTACHMENT_MISSING);
      }
      const mailer = await openMailer();
      result = await mailer.sendEmails({
        replyTo,
        subject: row.subject,
        recipients: await personalize(toSend, id, row.body_html, mailer),
        attachments: outgoing,
      });
    }
  }

  const nextIndex = from + batch.length;
  const sentSoFar = row.recipient_count + result.sent.length;
  const failed = [...previousFailed, ...result.failed];
  const done = nextIndex >= pending.length;
  const status = done ? (sentSoFar > 0 ? ("sent" as const) : ("failed" as const)) : undefined;

  // This batch's emails already went out: if the record can't be updated,
  // say so plainly rather than inviting a resend.
  let advanced: boolean;
  try {
    advanced = await store.advanceBroadcast(id, from, {
      next_index: nextIndex,
      recipient_count: sentSoFar,
      failed_emails: failed,
      ...(status ? { status, pending_recipients: [] as [] } : {}),
    });
  } catch (err) {
    console.error("Broadcast: couldn't record a batch that was sent", id, from, err);
    throw new Error(LOST_CONTACT);
  }
  if (!advanced) {
    console.error(
      "Broadcast: the row moved on while this batch was sending (another tab?)",
      id,
      from,
    );
    throw new Error(LOST_CONTACT);
  }

  if (done) {
    const label = await labelFor(store, columnsToAudience(row)).catch(() => "");
    await store.audit({
      actorUserId: actor.userId,
      tableName: "broadcast_emails",
      rowId: id,
      action: "update",
      details: {
        subject: row.subject,
        recipient_count: sentSoFar,
        failed_count: failed.length,
        failed_emails: failed,
        audience: label,
      },
    });
    // Nothing accepted (bad key, Resend down): keep the draft so the composed
    // message isn't lost and can be sent again. A draft saved after this
    // send started is a new message, so it stays too.
    if (sentSoFar > 0) {
      try {
        await store.clearDraftIfSavedBy(row.created_at);
      } catch (err) {
        console.error("Broadcast: couldn't clear the draft", err);
      }
    }
  }
  return { done, processed: nextIndex, sentSoFar, failedSoFar: failed.length, total, failed };
}

/**
 * Mark as stopped: an interrupted send (a 'sending' row no batch has moved
 * for 15 minutes) the super admin gives up on. It becomes 'failed' and can't
 * be finished any more; the draft is left alone.
 */
export async function stopBroadcastCore(
  gate: BroadcastGate,
  input: { id: unknown },
): Promise<{ ok: true }> {
  const { actor, store } = await gated(gate, "stop a broadcast");
  const id = typeof input?.id === "string" && UUID.test(input.id) ? input.id : null;
  if (!id) throw new Error(BROADCAST_NOT_FOUND);
  const row = await store.getBroadcast(id);
  if (!row) throw new Error(BROADCAST_NOT_FOUND);
  if (row.status !== "sending") return { ok: true };
  if (Date.now() - Date.parse(row.updated_at) <= BROADCAST_SENDING_STALE_MS) {
    throw new Error(STILL_GOING);
  }
  const failed = row.failed_emails ?? [];
  const stopped = await store.advanceBroadcast(id, row.next_index, {
    next_index: row.next_index,
    recipient_count: row.recipient_count,
    failed_emails: failed,
    status: "failed",
    pending_recipients: [],
  });
  // It moved on meanwhile (a Finish sending in another tab): leave it be.
  if (!stopped) throw new Error(STILL_GOING);
  await store.audit({
    actorUserId: actor.userId,
    tableName: "broadcast_emails",
    rowId: id,
    action: "update",
    details: {
      stopped: true,
      subject: row.subject,
      recipient_count: row.recipient_count,
      failed_count: failed.length,
      stopped_after: row.next_index,
      planned_count: row.total_recipients,
    },
  });
  return { ok: true };
}
