import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { sendBroadcastEmails } from "@/lib/guild/broadcast-send";
import type { BroadcastAudience } from "@/lib/guild/broadcast-audience";
import {
  addBroadcastAttachment,
  AUDIENCE_LOOKUP_FAILED,
  BROADCAST_ATTACHMENT_URL_SECONDS,
  BROADCAST_FROM,
  collectUserEmails,
  continueBroadcastCore,
  COULDNT_START,
  LOST_CONTACT,
  loadBroadcastPage,
  previewBroadcastAudienceCore,
  removeBroadcastAttachmentCore,
  saveBroadcastDraftCore,
  sendBroadcastTestCore,
  startBroadcastCore,
  stopBroadcastCore,
  type BroadcastAttachment,
  type BroadcastAttachmentRef,
  type BroadcastAudiencePreview,
  type BroadcastContinueResult,
  type BroadcastDraftRow,
  type BroadcastGate,
  type BroadcastJobRow,
  type BroadcastMailer,
  type BroadcastPage,
  type BroadcastRecentRow,
  type BroadcastSendRequest,
  type BroadcastStartResult,
  type BroadcastStore,
} from "@/lib/guild/broadcast-core";

/**
 * The Broadcast email screen's server side (docs/member-profiles.md,
 * "Super admin" > "Broadcast email screen"). Every function goes through
 * gateForRequest(): the super admin check on the SESSION client first, and
 * only then the service-role store -- the broadcast tables and bucket have
 * no client write access at all. The rules live in broadcast-core.ts; this
 * file exports only createServerFn values (vite.config.ts excludeFiles).
 */

const BUCKET = "broadcast-attachments";
const DRAFT_COLUMNS =
  "audience_type, audience_filter, member_ids, subject, body_html, attachments, updated_at";
const RECENT_COLUMNS =
  "id, sent_at, subject, audience_type, audience_filter, member_ids, recipient_count, status, failed_emails, updated_at, next_index, total_recipients";
const JOB_COLUMNS =
  "id, created_at, updated_at, subject, body_html, attachments, audience_type, audience_filter, member_ids, recipient_count, failed_emails, status, pending_recipients, next_index, total_recipients";

/** Logs Supabase's own error for us, and gives the screen plain words instead. */
function fail(friendly: string, original: unknown): never {
  console.error(`Broadcast: ${friendly}`, original);
  throw new Error(friendly);
}

const LOAD = "Couldn't load the broadcast screen. Try again.";
const AUDIENCE = AUDIENCE_LOOKUP_FAILED;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function supabaseBroadcastStore(service: SupabaseClient): BroadcastStore {
  return {
    async getDraft() {
      const { data, error } = await service
        .from("broadcast_draft")
        .select(DRAFT_COLUMNS)
        .eq("id", true)
        .maybeSingle();
      if (error) fail("Couldn't load the draft. Try again.", error);
      return (data as BroadcastDraftRow | null) ?? null;
    },

    async saveDraft(row, userId) {
      const { error } = await service.from("broadcast_draft").upsert(
        {
          id: true,
          audience_type: row.audience_type,
          audience_filter: row.audience_filter,
          member_ids: row.member_ids,
          subject: row.subject,
          body_html: row.body_html,
          attachments: row.attachments,
          updated_at: new Date().toISOString(),
          updated_by_user_id: userId,
        },
        { onConflict: "id" },
      );
      if (error) fail("Couldn't save the draft. Try again.", error);
    },

    async clearDraftIfSavedBy(savedBy) {
      const { error } = await service
        .from("broadcast_draft")
        .delete()
        .eq("id", true)
        .lte("updated_at", savedBy);
      if (error) fail("Couldn't clear the draft.", error);
    },

    async attachmentInUse(path) {
      const { data, error } = await service
        .from("broadcast_emails")
        .select("id")
        .contains("attachments", [{ path }])
        .limit(1);
      if (error) fail("Couldn't check that file. Try again.", error);
      return (data ?? []).length > 0;
    },

    async unsubscribedAmong(userIds) {
      const { data, error } = await service
        .from("broadcast_unsubscribes")
        .select("user_id")
        .in("user_id", userIds);
      if (error) fail(LOST_CONTACT, error);
      return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
    },

    async listRecent(limit) {
      const { data, error } = await service
        .from("broadcast_emails")
        .select(RECENT_COLUMNS)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) fail(LOAD, error);
      return (data ?? []) as BroadcastRecentRow[];
    },

    async listMembers() {
      const { data, error } = await service
        .from("members")
        .select("id, business_name, member_type, status")
        .in("status", ["published", "draft"]);
      if (error) fail(AUDIENCE, error);
      const members = (data ?? []) as {
        id: string;
        business_name: string;
        member_type: string;
        status: string;
      }[];
      const { data: links, error: linkError } = await service
        .from("member_categories")
        .select("member_id, category_id");
      if (linkError) fail(AUDIENCE, linkError);
      const byMember = new Map<string, string[]>();
      for (const link of (links ?? []) as { member_id: string; category_id: string }[]) {
        const list = byMember.get(link.member_id) ?? [];
        list.push(link.category_id);
        byMember.set(link.member_id, list);
      }
      return members.map((m) => ({ ...m, categoryIds: byMember.get(m.id) ?? [] }));
    },

    async listCategories() {
      const { data, error } = await service.from("categories").select("id, name");
      if (error) fail(LOAD, error);
      return (data ?? []) as { id: string; name: string }[];
    },

    async listMemberUsers(memberIds) {
      const rows = [];
      for (const ids of chunks(memberIds, 100)) {
        const { data, error } = await service
          .from("member_users")
          .select("member_id, user_id, role, created_at")
          .in("member_id", ids)
          .order("created_at", { ascending: true });
        if (error) fail(AUDIENCE, error);
        rows.push(
          ...((data ?? []) as {
            member_id: string;
            user_id: string;
            role: string | null;
            created_at: string;
          }[]),
        );
      }
      return rows;
    },

    // One listUsers call per 1000 accounts instead of one call per person:
    // keeps a send well under the Worker's subrequest limit.
    async emailsFor(userIds) {
      return collectUserEmails(userIds, async (page, perPage) => {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage });
        return { users: data?.users ?? [], error };
      });
    },

    async unsubscribedUserIds() {
      const { data, error } = await service.from("broadcast_unsubscribes").select("user_id");
      if (error) fail(AUDIENCE, error);
      return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
    },

    async uploadAttachment(path, bytes, contentType) {
      const { error } = await service.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) fail("Couldn't upload that file. Try again.", error);
    },

    async removeAttachment(path) {
      const { error } = await service.storage.from(BUCKET).remove([path]);
      if (error) fail("Couldn't remove that file. Try again.", error);
    },

    async signAttachmentUrl(path) {
      const { data, error } = await service.storage
        .from(BUCKET)
        .createSignedUrl(path, BROADCAST_ATTACHMENT_URL_SECONDS);
      if (error || !data?.signedUrl)
        fail("Couldn't read an attachment. Remove it and attach it again.", error);
      return data.signedUrl;
    },

    async hasSendingSince(sinceIso) {
      const { data, error } = await service
        .from("broadcast_emails")
        .select("id")
        .eq("status", "sending")
        .gte("updated_at", sinceIso)
        .limit(1);
      if (error) fail(COULDNT_START, error);
      return (data ?? []).length > 0;
    },

    async insertBroadcast(row) {
      const { error } = await service.from("broadcast_emails").insert(row);
      if (error) fail(COULDNT_START, error);
    },

    async getBroadcast(id) {
      const { data, error } = await service
        .from("broadcast_emails")
        .select(JOB_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Couldn't load that broadcast. Try again.", error);
      return (data as BroadcastJobRow | null) ?? null;
    },

    // Conditional on the row still being at fromIndex, so a batch is counted once.
    async advanceBroadcast(id, fromIndex, patch) {
      const { data, error } = await service
        .from("broadcast_emails")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "sending")
        .eq("next_index", fromIndex)
        .select("id");
      if (error) fail(LOST_CONTACT, error);
      return (data ?? []).length > 0;
    },

    async audit(entry) {
      const { error } = await service.from("audit_log").insert({
        actor_user_id: entry.actorUserId,
        member_id: null,
        table_name: entry.tableName,
        row_id: entry.rowId,
        action: entry.action,
        details: entry.details,
      });
      // The send already happened; a logging failure is reported, never undone.
      if (error) console.error("Broadcast: couldn't write the audit row", error);
    },
  };
}

/** Super admin check on the session client, then (only then) the service-role store. */
async function gateForRequest(): Promise<BroadcastGate> {
  const sessionClient = await getSupabaseServerClientForRequest();
  return {
    requireSuperAdmin: (action) => requireSuperAdmin(sessionClient, action),
    openStore: async () => supabaseBroadcastStore(await getSupabaseServiceRoleClient()),
  };
}

function currentRequestUrl(): string | null {
  try {
    return getRequest().url;
  } catch {
    return null;
  }
}

// `cloudflare:workers` env resolves reliably only inside a createServerFn
// handler; openMailer is called from inside one, after the super admin check.
async function openMailer(): Promise<BroadcastMailer> {
  const { env } = await import("cloudflare:workers");
  const { RESEND_API_KEY: apiKey, HOURS_CONFIRM_SECRET: secret } = env as {
    RESEND_API_KEY?: string;
    HOURS_CONFIRM_SECRET?: string;
  };
  if (!apiKey) fail("Email isn't set up on this site. Nothing was sent.", "missing RESEND_API_KEY");
  if (!secret)
    fail("Email isn't set up on this site. Nothing was sent.", "missing HOURS_CONFIRM_SECRET");
  return {
    siteUrl: resolveEmailSiteUrl(currentRequestUrl()),
    unsubscribeSecret: secret,
    sendEmails: (p) => sendBroadcastEmails({ ...p, apiKey, from: BROADCAST_FROM }),
  };
}

export type BroadcastDraftInput = BroadcastSendRequest;
export type {
  BroadcastAttachment,
  BroadcastAttachmentRef,
  BroadcastAudiencePreview,
  BroadcastContinueResult,
  BroadcastPage,
  BroadcastStartResult,
};

export const getBroadcastPage = createServerFn({ method: "GET" }).handler(
  async (): Promise<BroadcastPage> => loadBroadcastPage(await gateForRequest()),
);

export const previewBroadcastAudience = createServerFn({ method: "POST" })
  .inputValidator((data: { audience: BroadcastAudience }) => ({ audience: data?.audience }))
  .handler(
    async ({ data }): Promise<BroadcastAudiencePreview> =>
      previewBroadcastAudienceCore(await gateForRequest(), data),
  );

export const saveBroadcastDraft = createServerFn({ method: "POST" })
  .inputValidator((data: BroadcastSendRequest) => data)
  .handler(
    async ({ data }): Promise<{ ok: true }> => saveBroadcastDraftCore(await gateForRequest(), data),
  );

export const uploadBroadcastAttachment = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }): Promise<BroadcastAttachment> => {
    const gate = await gateForRequest();
    // Gate before touching the upload, so a refused caller learns nothing.
    const actor = await gate.requireSuperAdmin("attach files to a broadcast");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    return addBroadcastAttachment(
      { requireSuperAdmin: async () => actor, openStore: gate.openStore },
      { name: file.name, type: file.type, bytes },
    );
  });

export const removeBroadcastAttachment = createServerFn({ method: "POST" })
  .inputValidator((data: { path: string }) => ({ path: data?.path }))
  .handler(
    async ({ data }): Promise<{ ok: true }> =>
      removeBroadcastAttachmentCore(await gateForRequest(), data),
  );

export const sendBroadcastTest = createServerFn({ method: "POST" })
  .inputValidator((data: Omit<BroadcastSendRequest, "audience">) => data)
  .handler(
    async ({ data }): Promise<{ sentTo: string }> =>
      sendBroadcastTestCore(await gateForRequest(), data, openMailer),
  );

// Sending is split across requests (Workers Free plan: 50 subrequests per
// request): start writes the record and sends nothing; the screen then calls
// continue, 10 people at a time, until it says done.
export const startBroadcast = createServerFn({ method: "POST" })
  .inputValidator((data: BroadcastSendRequest) => data)
  .handler(
    async ({ data }): Promise<BroadcastStartResult> =>
      startBroadcastCore(await gateForRequest(), data, openMailer),
  );

export const continueBroadcast = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: data?.id }))
  .handler(
    async ({ data }): Promise<BroadcastContinueResult> =>
      continueBroadcastCore(await gateForRequest(), data, openMailer),
  );

// Mark as stopped: give up on an interrupted send (it can't be finished after this).
export const stopBroadcast = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: data?.id }))
  .handler(
    async ({ data }): Promise<{ ok: true }> => stopBroadcastCore(await gateForRequest(), data),
  );
