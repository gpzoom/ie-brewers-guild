import { describe, expect, it, vi } from "vitest";
import {
  addBroadcastAttachment,
  BROADCAST_BATCH_SIZE,
  BROADCAST_SENDING_STALE_MS,
  collectUserEmails,
  continueBroadcastCore,
  LOST_CONTACT,
  stopBroadcastCore,
  loadBroadcastPage,
  previewBroadcastAudienceCore,
  removeBroadcastAttachmentCore,
  saveBroadcastDraftCore,
  sendBroadcastTestCore,
  startBroadcastCore,
  type BroadcastAttachment,
  type BroadcastAuditEntry,
  type BroadcastDraftRow,
  type BroadcastGate,
  type BroadcastInsertRow,
  type BroadcastMailer,
  type BroadcastProgressPatch,
  type BroadcastStore,
  type BroadcastSendRequest,
} from "@/lib/guild/broadcast-core";
import { LOST_CONTACT_MESSAGE } from "@/components/guild/broadcast-screen-helpers";
import { buildRecipients, matchMembers, type AudienceMember, type AudienceUserRow } from "@/lib/guild/broadcast-audience";
import { sendBroadcastEmails } from "@/lib/guild/broadcast-send";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const M3 = "33333333-3333-4333-8333-333333333333";
const M4 = "44444444-4444-4444-8444-444444444444";
const CAT = "c0000000-0000-4000-8000-000000000001";
const SECRET = "test-secret";
const SITE = "https://iscbrewersguild.org";

const MEMBERS: AudienceMember[] = [
  { id: M1, business_name: "Brewery B", member_type: "producer", status: "published", categoryIds: [] },
  { id: M2, business_name: "Allied A", member_type: "allied", status: "draft", categoryIds: [CAT] },
  { id: M3, business_name: "Mobile C", member_type: "mobile", status: "published", categoryIds: [CAT] },
  { id: M4, business_name: "Gone D", member_type: "producer", status: "suspended", categoryIds: [] },
];

const USER_ROWS: AudienceUserRow[] = [
  { member_id: M1, user_id: "u1", role: "owner", created_at: "2026-01-01" },
  { member_id: M1, user_id: "u2", role: "co_owner", created_at: "2026-01-02" },
  { member_id: M1, user_id: "u9", role: "editor", created_at: "2026-01-03" },
  { member_id: M2, user_id: "u3", role: "owner", created_at: "2026-01-01" },
  { member_id: M3, user_id: "u1", role: "owner", created_at: "2026-01-01" },
  { member_id: M4, user_id: "u4", role: "owner", created_at: "2026-01-01" },
];

const EMAILS: Record<string, string | null> = {
  u1: "one@example.com",
  u2: "two@example.com",
  u3: "three@example.com",
  u4: "four@example.com",
  u9: "editor@example.com",
};

const ATTACHMENT: BroadcastAttachment = {
  path: "draft/abc/agenda.pdf",
  filename: "agenda.pdf",
  size_bytes: 5,
  content_type: "application/pdf",
};

type StoredBroadcast = Omit<BroadcastInsertRow, "status"> & {
  status: "sending" | "sent" | "failed";
  sent_at: string;
  created_at: string;
  updated_at: string;
};

function memoryStore(
  seed: {
    draft?: BroadcastDraftRow | null;
    unsubscribed?: string[];
    failInsert?: boolean;
    failUpdate?: boolean;
    failSign?: boolean;
    failRemove?: boolean;
    failInUse?: boolean;
    broadcasts?: StoredBroadcast[];
  } = {},
) {
  const calls: string[] = [];
  const state = {
    draft: seed.draft ?? null,
    inserted: [] as BroadcastInsertRow[],
    broadcasts: (seed.broadcasts ?? []).map((b) => structuredClone(b)),
    updates: [] as { id: string; from: number; patch: BroadcastProgressPatch }[],
    audits: [] as BroadcastAuditEntry[],
    objects: new Map<string, Uint8Array>([[ATTACHMENT.path, new TextEncoder().encode("hello")]]),
    removed: [] as string[],
    unsubscribed: new Set(seed.unsubscribed ?? []),
  };
  const track = <T extends (...args: never[]) => unknown>(name: string, fn: T): T =>
    ((...args: Parameters<T>) => {
      calls.push(name);
      return fn(...args);
    }) as T;
  const store: BroadcastStore = {
    getDraft: track("getDraft", async () => state.draft),
    saveDraft: track("saveDraft", async (row: BroadcastDraftRow) => {
      state.draft = row;
    }),
    clearDraftIfSavedBy: track("clearDraftIfSavedBy", async (savedBy: string) => {
      if (!state.draft?.updated_at || state.draft.updated_at <= savedBy) state.draft = null;
    }),
    attachmentInUse: track("attachmentInUse", async (path: string) => {
      if (seed.failInUse) throw new Error("db down");
      return state.broadcasts.some((b) => b.attachments.some((a) => a.path === path));
    }),
    unsubscribedAmong: track("unsubscribedAmong", async (ids: string[]) =>
      new Set(ids.filter((id) => state.unsubscribed.has(id))),
    ),
    listRecent: track("listRecent", async () => [
      {
        id: "b-old",
        sent_at: "2026-11-01T00:00:00Z",
        subject: "Old",
        audience_type: "members",
        audience_filter: null,
        member_ids: [M1, M2],
        recipient_count: 3,
        status: "sent",
        failed_emails: ["x@example.com"],
        updated_at: "2026-11-01T00:01:00Z",
        next_index: 4,
        total_recipients: 4,
      },
      {
        id: "b-new",
        sent_at: "2026-11-10T00:00:00Z",
        subject: "New",
        audience_type: "type_or_category",
        audience_filter: { member_type: "allied", category_id: CAT },
        member_ids: null,
        recipient_count: 1,
        status: "failed",
        failed_emails: [],
        updated_at: "2026-11-10T00:01:00Z",
        next_index: 1,
        total_recipients: 1,
      },
    ]),
    listMembers: track("listMembers", async () => MEMBERS),
    listCategories: track("listCategories", async () => [{ id: CAT, name: "Food trucks" }]),
    listMemberUsers: track("listMemberUsers", async (ids: string[]) =>
      USER_ROWS.filter((r) => ids.includes(r.member_id)),
    ),
    emailsFor: track("emailsFor", async (ids: string[]) => new Map(ids.map((id) => [id, EMAILS[id] ?? null]))),
    unsubscribedUserIds: track("unsubscribedUserIds", async () => new Set(state.unsubscribed)),
    uploadAttachment: track("uploadAttachment", async (path: string, bytes: Uint8Array) => {
      state.objects.set(path, bytes);
    }),
    removeAttachment: track("removeAttachment", async (path: string) => {
      if (seed.failRemove) throw new Error("storage down");
      state.removed.push(path);
      state.objects.delete(path);
    }),
    signAttachmentUrl: track("signAttachmentUrl", async (path: string) => {
      if (seed.failSign || !state.objects.has(path)) {
        throw new Error("Couldn't read an attachment. Remove it and attach it again.");
      }
      return `https://storage.example/signed/${path}?token=t`;
    }),
    hasSendingSince: track("hasSendingSince", async (sinceIso: string) =>
      state.broadcasts.some((b) => b.status === "sending" && b.updated_at >= sinceIso),
    ),
    insertBroadcast: track("insertBroadcast", async (row: BroadcastInsertRow) => {
      if (seed.failInsert) throw new Error("db down");
      state.inserted.push(structuredClone(row));
      const now = new Date().toISOString();
      state.broadcasts.push({ ...structuredClone(row), sent_at: now, created_at: now, updated_at: now });
    }),
    getBroadcast: track("getBroadcast", async (id: string) => {
      const row = state.broadcasts.find((b) => b.id === id);
      return row ? structuredClone(row) : null;
    }),
    advanceBroadcast: track("advanceBroadcast", async (id: string, from: number, patch: BroadcastProgressPatch) => {
      if (seed.failUpdate) throw new Error("db down");
      const row = state.broadcasts.find((b) => b.id === id);
      if (!row || row.status !== "sending" || row.next_index !== from) return false;
      state.updates.push({ id, from, patch: structuredClone(patch) });
      Object.assign(row, structuredClone(patch), { updated_at: new Date().toISOString() });
      return true;
    }),
    audit: track("audit", async (entry: BroadcastAuditEntry) => {
      state.audits.push(entry);
    }),
  };
  return { store, state, calls };
}

const ACTOR = { userId: "u-super", email: "boss@example.com" };

function gateFor(store: BroadcastStore, opts: { superAdmin?: boolean } = {}) {
  const openStore = vi.fn(async () => store);
  const gate: BroadcastGate = {
    requireSuperAdmin: async (action) => {
      if (opts.superAdmin === false) throw new Error(`Only the super admin can ${action}.`);
      return ACTOR;
    },
    openStore,
  };
  return { gate, openStore };
}

function fakeMailer(
  result?: (emails: string[]) => { sent: string[]; failed: string[] },
  onSend?: (p: Parameters<BroadcastMailer["sendEmails"]>[0]) => Promise<void> | void,
) {
  const sends: Parameters<BroadcastMailer["sendEmails"]>[0][] = [];
  const mailer: BroadcastMailer = {
    siteUrl: SITE,
    unsubscribeSecret: SECRET,
    async sendEmails(p) {
      sends.push(p);
      await onSend?.(p);
      const emails = p.recipients.map((r) => r.email);
      return result ? result(emails) : { sent: emails, failed: [] };
    },
  };
  return { mailer, sends, openMailer: vi.fn(async () => mailer) };
}

const DRAFT_WITH_ATTACHMENT: BroadcastDraftRow = {
  audience_type: "all",
  audience_filter: null,
  member_ids: null,
  subject: "Hi",
  body_html: "<p>Hi</p>",
  attachments: [ATTACHMENT],
  updated_at: "2026-11-11T00:00:00Z",
};

const SENDING_ROW_ID = "5e000000-0000-4000-8000-000000000001";
const SENDING_ROW: StoredBroadcast = {
  id: SENDING_ROW_ID,
  sent_by_user_id: "u-super",
  subject: "Earlier",
  body_html: "<p>x</p>",
  attachments: [],
  audience_type: "all",
  audience_filter: null,
  member_ids: null,
  recipient_count: 0,
  failed_emails: [],
  status: "sending",
  pending_recipients: [],
  next_index: 0,
  total_recipients: 0,
  sent_at: "",
  created_at: "",
  updated_at: "",
};

const SEND: BroadcastSendRequest = {
  audience: { type: "all" },
  subject: "  Meeting Thursday  ",
  bodyHtml: '<p onclick="x()">Come <script>alert(1)</script><span style="color:red">along</span></p>',
  attachments: [],
};

describe("super admin gate", () => {
  const actions: [string, (gate: BroadcastGate) => Promise<unknown>][] = [
    ["page", (g) => loadBroadcastPage(g)],
    ["preview", (g) => previewBroadcastAudienceCore(g, { audience: { type: "all" } })],
    ["save", (g) => saveBroadcastDraftCore(g, { audience: { type: "all" }, subject: "", bodyHtml: "", attachments: [] })],
    ["upload", (g) => addBroadcastAttachment(g, { name: "a.pdf", type: "application/pdf", bytes: new Uint8Array(3) })],
    ["remove", (g) => removeBroadcastAttachmentCore(g, { path: ATTACHMENT.path })],
    ["test", (g) => sendBroadcastTestCore(g, SEND, fakeMailer().openMailer)],
    ["start", (g) => startBroadcastCore(g, SEND, fakeMailer().openMailer)],
    ["continue", (g) => continueBroadcastCore(g, { id: SENDING_ROW_ID }, fakeMailer().openMailer)],
    ["stop", (g) => stopBroadcastCore(g, { id: SENDING_ROW_ID })],
  ];
  for (const [name, run] of actions) {
    it(`refuses a non-super-admin before any store call (${name})`, async () => {
      const { store, calls } = memoryStore();
      const { gate, openStore } = gateFor(store, { superAdmin: false });
      await expect(run(gate)).rejects.toThrow(/Only the super admin can/);
      expect(openStore).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });
  }
});

describe("loadBroadcastPage", () => {
  it("returns the draft, recent sends newest first, active members by name, categories and the super admin's email", async () => {
    const { store } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const page = await loadBroadcastPage(gateFor(store).gate);
    expect(page.draft).toEqual({
      audience: { type: "all" },
      subject: "Hi",
      bodyHtml: "<p>Hi</p>",
      attachments: [ATTACHMENT],
      updatedAt: "2026-11-11T00:00:00Z",
    });
    expect(page.recent).toEqual([
      {
        id: "b-new",
        sent_at: "2026-11-10T00:00:00Z",
        subject: "New",
        audienceLabel: "Affiliate Members · Food trucks",
        recipient_count: 1,
        status: "failed",
        failedCount: 0,
        processedCount: 1,
        totalCount: 1,
        canResume: false,
      },
      {
        id: "b-old",
        sent_at: "2026-11-01T00:00:00Z",
        subject: "Old",
        audienceLabel: "2 picked members",
        recipient_count: 3,
        status: "sent",
        failedCount: 1,
        processedCount: 4,
        totalCount: 4,
        canResume: false,
      },
    ]);
    expect(page.members).toEqual([
      { id: M2, business_name: "Allied A", member_type: "allied" },
      { id: M1, business_name: "Brewery B", member_type: "producer" },
      { id: M3, business_name: "Mobile C", member_type: "mobile" },
    ]);
    expect(page.categories).toEqual([{ id: CAT, name: "Food trucks" }]);
    expect(page.superAdminEmail).toBe("boss@example.com");
  });
});

describe("loadBroadcastPage: sends in progress", () => {
  it("labels a 'sending' row by when a batch last moved it: fresh is sending, 15+ minutes is interrupted and resumable", async () => {
    const { store } = memoryStore();
    const fresh = new Date(Date.now() - 60_000).toISOString();
    const stale = new Date(Date.now() - BROADCAST_SENDING_STALE_MS - 60_000).toISOString();
    const longAgo = new Date(Date.now() - 3 * BROADCAST_SENDING_STALE_MS).toISOString();
    const row = { subject: "A", audience_type: "all", audience_filter: null, member_ids: null, sent_at: longAgo, status: "sending" };
    store.listRecent = async () => [
      // Started long ago, but a batch moved it a minute ago: still sending.
      { ...row, id: "s-fresh", updated_at: fresh, recipient_count: 4, failed_emails: [], next_index: 4, total_recipients: 40 },
      { ...row, id: "s-stale", updated_at: stale, recipient_count: 20, failed_emails: ["x@example.com"], next_index: 21, total_recipients: 40 },
    ];
    const page = await loadBroadcastPage(gateFor(store).gate);
    expect(
      page.recent.map((r) => [r.id, r.status, r.recipient_count, r.failedCount, r.processedCount, r.totalCount, r.canResume]),
    ).toEqual([
      ["s-fresh", "sending", 4, 0, 4, 40, false],
      ["s-stale", "interrupted", 20, 1, 21, 40, true],
    ]);
  });
});

describe("collectUserEmails", () => {
  it("pages through the users 1000 at a time and maps only the wanted ids", async () => {
    const pages: number[] = [];
    const users = Array.from({ length: 1500 }, (_v, i) => ({ id: `u${i}`, email: `u${i}@example.com` }));
    const emails = await collectUserEmails(["u3", "u1203", "missing"], async (page, perPage) => {
      pages.push(page);
      return { users: users.slice((page - 1) * perPage, page * perPage), error: null };
    });
    expect(pages).toEqual([1, 2]);
    expect(emails).toEqual(
      new Map([
        ["u3", "u3@example.com"],
        ["u1203", "u1203@example.com"],
        ["missing", null],
      ]),
    );
  });

  it("stops early once every wanted id is found", async () => {
    const pages: number[] = [];
    await collectUserEmails(["u1"], async (page) => {
      pages.push(page);
      return { users: Array.from({ length: 1000 }, (_v, i) => ({ id: `u${i}`, email: null })), error: null };
    });
    expect(pages).toEqual([1]);
  });

  it("refuses when a lookup call errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      collectUserEmails(["u1"], async () => ({ users: [], error: new Error("auth down") })),
    ).rejects.toThrow("Couldn't look up who gets this email. Try again.");
    error.mockRestore();
  });
});

describe("previewBroadcastAudienceCore", () => {
  it("counts match buildRecipients", async () => {
    const { store } = memoryStore({ unsubscribed: ["u2"] });
    const result = await previewBroadcastAudienceCore(gateFor(store).gate, { audience: { type: "all" } });
    const matched = matchMembers(MEMBERS, { type: "all" });
    const expected = buildRecipients(
      matched,
      USER_ROWS,
      new Map(Object.entries(EMAILS)),
      new Set(["u2"]),
    );
    expect(result).toEqual({
      memberCount: expected.memberCount,
      peopleCount: expected.recipients.length,
      unsubscribedCount: expected.unsubscribedCount,
    });
    expect(result).toEqual({ memberCount: 3, peopleCount: 2, unsubscribedCount: 1 });
  });

  it("refuses a malformed audience", async () => {
    const { store } = memoryStore();
    await expect(
      previewBroadcastAudienceCore(gateFor(store).gate, { audience: { type: "members", memberIds: [1] } }),
    ).rejects.toThrow("Choose who gets this email.");
    await expect(
      previewBroadcastAudienceCore(gateFor(store).gate, { audience: { type: "everyone" } }),
    ).rejects.toThrow("Choose who gets this email.");
  });
});

describe("saveBroadcastDraftCore", () => {
  it("round-trips a picked-members audience, sanitizes the body and trims the subject", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { gate } = gateFor(store);
    await saveBroadcastDraftCore(gate, {
      audience: { type: "members", memberIds: [M1, M3] },
      subject: "  Draft subject ",
      bodyHtml: "<p>Hello <script>bad()</script><b>there</b></p>",
      attachments: [{ path: ATTACHMENT.path }],
    });
    expect(state.draft?.audience_type).toBe("members");
    expect(state.draft?.member_ids).toEqual([M1, M3]);
    const page = await loadBroadcastPage(gate);
    expect(page.draft?.audience).toEqual({ type: "members", memberIds: [M1, M3] });
    expect(page.draft?.subject).toBe("Draft subject");
    expect(page.draft?.bodyHtml).toBe("<p>Hello <b>there</b></p>");
    expect(page.draft?.attachments).toEqual([ATTACHMENT]);
  });

  it("round-trips a type-or-category audience", async () => {
    const { store } = memoryStore();
    const { gate } = gateFor(store);
    const audience = { type: "type_or_category" as const, memberType: "mobile" as const, categoryId: CAT };
    await saveBroadcastDraftCore(gate, { audience, subject: "", bodyHtml: "", attachments: [] });
    expect((await loadBroadcastPage(gate)).draft?.audience).toEqual(audience);
  });

  it("refuses an attachment path that isn't in the draft", async () => {
    const { store, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    await expect(
      saveBroadcastDraftCore(gateFor(store).gate, {
        audience: { type: "all" },
        subject: "",
        bodyHtml: "",
        attachments: [{ path: "draft/other/evil.pdf" }],
      }),
    ).rejects.toThrow("That attachment isn't in the draft anymore.");
    expect(calls).not.toContain("saveDraft");
  });

  it("refuses a subject over 200 characters", async () => {
    const { store } = memoryStore();
    await expect(
      saveBroadcastDraftCore(gateFor(store).gate, {
        audience: { type: "all" },
        subject: "x".repeat(201),
        bodyHtml: "",
        attachments: [],
      }),
    ).rejects.toThrow("The subject can be 200 characters at most.");
  });
});

describe("addBroadcastAttachment", () => {
  it("stores the file under draft/<uuid>/<sanitized name> and adds it to the draft", async () => {
    const { store, state } = memoryStore();
    const added = await addBroadcastAttachment(gateFor(store).gate, {
      name: "Meeting notes (final)!.pdf",
      type: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(added.path).toMatch(/^draft\/[0-9a-f-]{36}\/Meeting_notes__final__.pdf$/);
    expect(added).toMatchObject({ filename: "Meeting_notes__final__.pdf", size_bytes: 3, content_type: "application/pdf" });
    expect(state.objects.get(added.path)).toEqual(new Uint8Array([1, 2, 3]));
    expect(state.draft?.attachments).toEqual([added]);
    expect(state.draft?.audience_type).toBe("all");
  });

  it("refuses a file checkAttachmentAdd rejects, with its message", async () => {
    const { store, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    await expect(
      addBroadcastAttachment(gateFor(store).gate, { name: "x.exe", type: "application/x-msdownload", bytes: new Uint8Array(3) }),
    ).rejects.toThrow("That file type can't be attached. Use PDF, an image, Word or Excel.");
    expect(calls).not.toContain("uploadAttachment");
  });

  it("caps the stored filename at 100 characters", async () => {
    const { store } = memoryStore();
    const added = await addBroadcastAttachment(gateFor(store).gate, {
      name: `${"a".repeat(150)}.pdf`,
      type: "application/pdf",
      bytes: new Uint8Array(1),
    });
    expect(added.filename.length).toBe(100);
  });
});

describe("removeBroadcastAttachmentCore", () => {
  it("saves the draft without the entry first, then deletes the object", async () => {
    const { store, state, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    await removeBroadcastAttachmentCore(gateFor(store).gate, { path: ATTACHMENT.path });
    expect(state.removed).toEqual([ATTACHMENT.path]);
    expect(state.draft?.attachments).toEqual([]);
    expect(calls.indexOf("saveDraft")).toBeLessThan(calls.indexOf("removeAttachment"));
  });

  it("a failed file delete only orphans the file: the draft is saved and nothing throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, failRemove: true });
    await expect(removeBroadcastAttachmentCore(gateFor(store).gate, { path: ATTACHMENT.path })).resolves.toEqual({ ok: true });
    expect(state.draft?.attachments).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("keeps the file when a broadcast row (a paused send) uses it: only the draft drops it", async () => {
    const { store, state } = memoryStore({
      draft: DRAFT_WITH_ATTACHMENT,
      broadcasts: [jobRow(30, { attachments: [ATTACHMENT], next_index: 10 })],
    });
    await removeBroadcastAttachmentCore(gateFor(store).gate, { path: ATTACHMENT.path });
    expect(state.draft?.attachments).toEqual([]);
    expect(state.removed).toEqual([]);
    expect(state.objects.has(ATTACHMENT.path)).toBe(true);
  });

  it("keeps the file when it can't tell whether a broadcast uses it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, failInUse: true });
    await removeBroadcastAttachmentCore(gateFor(store).gate, { path: ATTACHMENT.path });
    expect(state.draft?.attachments).toEqual([]);
    expect(state.removed).toEqual([]);
    error.mockRestore();
  });

  it("refuses paths outside draft/ or not in the draft (a sent broadcast's file stays)", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    await expect(removeBroadcastAttachmentCore(gateFor(store).gate, { path: "../x" })).rejects.toThrow(
      "That attachment isn't in the draft anymore.",
    );
    await expect(
      removeBroadcastAttachmentCore(gateFor(store).gate, { path: "draft/sent-already/a.pdf" }),
    ).rejects.toThrow("That attachment isn't in the draft anymore.");
    expect(state.removed).toEqual([]);
  });
});

/** A started broadcast to n people (p0..p{n-1}@example.com, users u0..), nothing sent yet. */
function jobRow(n: number, over: Partial<StoredBroadcast> = {}): StoredBroadcast {
  const now = new Date().toISOString();
  return {
    ...SENDING_ROW,
    subject: "Batch news",
    body_html: "<p>News</p>",
    pending_recipients: Array.from({ length: n }, (_v, i) => ({ userId: `u${i}`, email: `p${i}@example.com` })),
    total_recipients: n,
    sent_at: now,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

/** Calls continue until it says done (as the screen does); returns every response. */
async function finish(gate: BroadcastGate, id: string, openMailer: () => Promise<BroadcastMailer>) {
  const responses = [];
  for (let i = 0; i < 100; i++) {
    const r = await continueBroadcastCore(gate, { id }, openMailer);
    responses.push(r);
    if (r.done) return responses;
  }
  throw new Error("never finished");
}

describe("startBroadcastCore", () => {
  it("validates subject, body and recipients", async () => {
    const { store, calls } = memoryStore();
    const { gate } = gateFor(store);
    const { openMailer, sends } = fakeMailer();
    await expect(startBroadcastCore(gate, { ...SEND, subject: "   " }, openMailer)).rejects.toThrow("Add a subject.");
    await expect(
      startBroadcastCore(gate, { ...SEND, bodyHtml: "<p> <script>x</script></p>" }, openMailer),
    ).rejects.toThrow("Write a message.");
    await expect(
      startBroadcastCore(gate, { ...SEND, audience: { type: "members", memberIds: [M4] } }, openMailer),
    ).rejects.toThrow("No one to send to.");
    expect(sends).toEqual([]);
    expect(calls).not.toContain("insertBroadcast");
    expect(calls).not.toContain("audit");
  });

  it("refuses a message over 100 KB (after sanitizing) before anything is written", async () => {
    const { store, calls } = memoryStore();
    const big = `<p>${"x".repeat(100 * 1024)}</p>`;
    await expect(
      startBroadcastCore(gateFor(store).gate, { ...SEND, bodyHtml: big }, fakeMailer().openMailer),
    ).rejects.toThrow("That message is too long. Shorten it or attach a file instead.");
    await expect(
      sendBroadcastTestCore(gateFor(store).gate, { ...SEND, bodyHtml: big }, fakeMailer().openMailer),
    ).rejects.toThrow("That message is too long. Shorten it or attach a file instead.");
    expect(calls).not.toContain("insertBroadcast");
    // Just under the limit is fine.
    const ok = `<p>${"x".repeat(100 * 1024 - 7)}</p>`;
    await expect(
      startBroadcastCore(gateFor(store).gate, { ...SEND, bodyHtml: ok }, fakeMailer().openMailer),
    ).resolves.toMatchObject({ total: 3 });
  });

  it("sends nothing: writes the 'sending' row with the recipient list and its audit row, and keeps the draft", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { sends, openMailer } = fakeMailer();
    const result = await startBroadcastCore(
      gateFor(store).gate,
      { ...SEND, attachments: [{ path: ATTACHMENT.path }] },
      openMailer,
    );

    expect(sends).toEqual([]);
    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0];
    expect(result).toEqual({ id: row.id, total: 3, memberCount: 3 });
    expect(row).toMatchObject({
      sent_by_user_id: "u-super",
      subject: "Meeting Thursday",
      body_html: "<p>Come along</p>",
      attachments: [ATTACHMENT],
      audience_type: "all",
      audience_filter: null,
      member_ids: null,
      recipient_count: 0,
      failed_emails: [],
      status: "sending",
      next_index: 0,
      total_recipients: 3,
      pending_recipients: [
        { userId: "u1", email: "one@example.com" },
        { userId: "u2", email: "two@example.com" },
        { userId: "u3", email: "three@example.com" },
      ],
    });
    expect(state.audits).toEqual([
      {
        actorUserId: "u-super",
        tableName: "broadcast_emails",
        rowId: row.id,
        action: "insert",
        details: { subject: "Meeting Thursday", audience: "All members", planned_count: 3, status: "sending" },
      },
    ]);
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
  });

  it("refuses an attachment that isn't in the draft or isn't under draft/", async () => {
    const { store } = memoryStore({ draft: { ...DRAFT_WITH_ATTACHMENT, attachments: [{ ...ATTACHMENT, path: "other/a.pdf" }] } });
    const { openMailer } = fakeMailer();
    await expect(
      startBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: "other/a.pdf" }] }, openMailer),
    ).rejects.toThrow("That attachment isn't in the draft anymore.");
    await expect(
      startBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, openMailer),
    ).rejects.toThrow("That attachment isn't in the draft anymore.");
  });

  it("refuses while another broadcast is 'sending' and was moved on in the last 15 minutes", async () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const { store, calls } = memoryStore({ broadcasts: [jobRow(30, { updated_at: recent })] });
    await expect(startBroadcastCore(gateFor(store).gate, SEND, fakeMailer().openMailer)).rejects.toThrow(
      "A broadcast is still sending. Wait a few minutes and check Recent broadcasts.",
    );
    expect(calls).not.toContain("insertBroadcast");
    expect(calls).not.toContain("audit");
  });

  it("allows a start when the only 'sending' row hasn't moved for 15 minutes (interrupted)", async () => {
    const old = new Date(Date.now() - BROADCAST_SENDING_STALE_MS - 60_000).toISOString();
    const { store, state } = memoryStore({ broadcasts: [jobRow(30, { sent_at: old, updated_at: old })] });
    const result = await startBroadcastCore(gateFor(store).gate, SEND, fakeMailer().openMailer);
    expect(result.total).toBe(3);
    expect(state.inserted).toHaveLength(1);
  });

  it("a failed row insert refuses with nothing audited and the draft kept", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, failInsert: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(startBroadcastCore(gateFor(store).gate, SEND, fakeMailer().openMailer)).rejects.toThrow(
      "Couldn't start the send. Nothing was sent.",
    );
    expect(state.audits).toEqual([]);
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
    error.mockRestore();
  });

  it("an attachment that can't be signed refuses before the row is written", async () => {
    const { store, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, failSign: true });
    await expect(
      startBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, fakeMailer().openMailer),
    ).rejects.toThrow("Couldn't read an attachment. Remove it and attach it again.");
    expect(calls).not.toContain("insertBroadcast");
  });

  it("refuses when email isn't set up, before the row is written", async () => {
    const { store, calls } = memoryStore();
    const openMailer = async (): Promise<BroadcastMailer> => {
      throw new Error("Email isn't set up on this site. Nothing was sent.");
    };
    await expect(startBroadcastCore(gateFor(store).gate, SEND, openMailer)).rejects.toThrow(
      "Email isn't set up on this site. Nothing was sent.",
    );
    expect(calls).not.toContain("insertBroadcast");
  });
});

describe("continueBroadcastCore", () => {
  it(`sends exactly the next ${BROADCAST_BATCH_SIZE} people, each with their own unsubscribe link, and moves next_index on`, async () => {
    const { store, state } = memoryStore({ broadcasts: [jobRow(25, { attachments: [ATTACHMENT] })] });
    const { mailer, sends, openMailer } = fakeMailer();
    const gate = gateFor(store).gate;

    const first = await continueBroadcastCore(gate, { id: SENDING_ROW_ID }, openMailer);
    expect(first).toEqual({ done: false, processed: 10, sentSoFar: 10, failedSoFar: 0, total: 25, failed: [] });
    expect(sends).toHaveLength(1);
    expect(sends[0].recipients.map((r) => r.email)).toEqual(Array.from({ length: 10 }, (_v, i) => `p${i}@example.com`));
    expect(sends[0].subject).toBe("Batch news");
    expect(sends[0].replyTo).toBe("boss@example.com");
    expect(sends[0].attachments).toEqual([
      { filename: "agenda.pdf", path: `https://storage.example/signed/${ATTACHMENT.path}?token=t` },
    ]);
    for (const [i, r] of sends[0].recipients.entries()) {
      expect(r.html).toContain("<p>News</p>");
      expect(r.html).toContain(r.unsubscribeUrl!);
      const token = r.unsubscribeUrl!.split("/unsubscribe/")[1];
      expect(r.oneClickUrl).toBe(`${SITE}/api/unsubscribe/${token}`);
      expect(await verifyUnsubscribeToken(token, mailer.unsubscribeSecret)).toEqual({ valid: true, userId: `u${i}` });
    }
    expect(state.broadcasts[0]).toMatchObject({ status: "sending", next_index: 10, recipient_count: 10 });
    expect(state.updates).toEqual([
      { id: SENDING_ROW_ID, from: 0, patch: { next_index: 10, recipient_count: 10, failed_emails: [] } },
    ]);
    expect(state.audits).toEqual([]);

    const second = await continueBroadcastCore(gate, { id: SENDING_ROW_ID }, openMailer);
    expect(second.done).toBe(false);
    expect(sends[1].recipients.map((r) => r.email)).toEqual(Array.from({ length: 10 }, (_v, i) => `p${i + 10}@example.com`));
    expect(state.broadcasts[0].next_index).toBe(20);
  });

  it("the last batch sets 'sent', writes the second audit row and clears the draft", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, broadcasts: [jobRow(25)] });
    const { sends, openMailer } = fakeMailer();
    const responses = await finish(gateFor(store).gate, SENDING_ROW_ID, openMailer);
    expect(responses.map((r) => [r.done, r.sentSoFar])).toEqual([
      [false, 10],
      [false, 20],
      [true, 25],
    ]);
    expect(sends.map((s) => s.recipients.length)).toEqual([10, 10, 5]);
    expect(state.broadcasts[0]).toMatchObject({ status: "sent", next_index: 25, recipient_count: 25, failed_emails: [] });
    // The list is only needed while sending: emptied with the final status.
    expect(state.updates.at(-1)!.patch).toEqual({
      next_index: 25,
      recipient_count: 25,
      failed_emails: [],
      status: "sent",
      pending_recipients: [],
    });
    expect(state.broadcasts[0].pending_recipients).toEqual([]);
    expect(state.broadcasts[0].total_recipients).toBe(25);
    expect(state.audits).toEqual([
      {
        actorUserId: "u-super",
        tableName: "broadcast_emails",
        rowId: SENDING_ROW_ID,
        action: "update",
        details: { subject: "Batch news", recipient_count: 25, failed_count: 0, failed_emails: [], audience: "All members" },
      },
    ]);
    expect(state.draft).toBeNull();
  });

  it("start then continue: the whole send end to end (3 people, one batch)", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { sends, openMailer } = fakeMailer();
    const gate = gateFor(store).gate;
    const { id, total } = await startBroadcastCore(gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, openMailer);
    expect(sends).toEqual([]);
    const result = await continueBroadcastCore(gate, { id }, openMailer);
    expect(result).toEqual({ done: true, processed: 3, sentSoFar: 3, failedSoFar: 0, total, failed: [] });
    expect(sends[0].recipients.map((r) => r.email)).toEqual(["one@example.com", "two@example.com", "three@example.com"]);
    expect(state.audits.map((a) => a.action)).toEqual(["insert", "update"]);
    expect(state.broadcasts[0].status).toBe("sent");
    expect(state.draft).toBeNull();
  });

  it("a finished row sends nothing and just reports its totals (safe to call again)", async () => {
    const { store, state, calls } = memoryStore({
      // A finished row's list was emptied: the total comes from total_recipients.
      broadcasts: [
        jobRow(25, {
          status: "sent",
          next_index: 25,
          recipient_count: 24,
          failed_emails: ["p3@example.com"],
          pending_recipients: [],
        }),
      ],
    });
    const { sends, openMailer } = fakeMailer();
    const result = await continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer);
    expect(result).toEqual({
      done: true,
      processed: 25,
      sentSoFar: 24,
      failedSoFar: 1,
      total: 25,
      failed: ["p3@example.com"],
    });
    expect(sends).toEqual([]);
    expect(calls).toEqual(["getBroadcast"]);
    expect(state.audits).toEqual([]);
  });

  it("all refused: status 'failed', the audit lists every address, and the draft stays", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, broadcasts: [jobRow(12)] });
    const { openMailer } = fakeMailer((emails) => ({ sent: [], failed: emails }));
    const responses = await finish(gateFor(store).gate, SENDING_ROW_ID, openMailer);
    const all = Array.from({ length: 12 }, (_v, i) => `p${i}@example.com`);
    expect(responses.at(-1)).toEqual({ done: true, processed: 12, sentSoFar: 0, failedSoFar: 12, total: 12, failed: all });
    expect(state.broadcasts[0]).toMatchObject({ status: "failed", recipient_count: 0, failed_emails: all });
    expect(state.audits[0].details).toMatchObject({ recipient_count: 0, failed_count: 12, failed_emails: all });
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
  });

  it("refusals add up across batches; a partly refused send is still 'sent' and clears the draft", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, broadcasts: [jobRow(15)] });
    const refused = new Set(["p2@example.com", "p12@example.com"]);
    const { openMailer } = fakeMailer((emails) => ({
      sent: emails.filter((e) => !refused.has(e)),
      failed: emails.filter((e) => refused.has(e)),
    }));
    const responses = await finish(gateFor(store).gate, SENDING_ROW_ID, openMailer);
    expect(responses.map((r) => [r.sentSoFar, r.failedSoFar])).toEqual([
      [9, 1],
      [13, 2],
    ]);
    expect(responses[1].failed).toEqual(["p2@example.com", "p12@example.com"]);
    expect(state.broadcasts[0]).toMatchObject({ status: "sent", recipient_count: 13, failed_emails: ["p2@example.com", "p12@example.com"] });
    expect(state.draft).toBeNull();
  });

  it("Finish sending isn't blocked by the guard: a fresh 'sending' row blocks a new start but can still be continued", async () => {
    const { store, state, calls } = memoryStore({ broadcasts: [jobRow(5)] });
    const { sends, openMailer } = fakeMailer();
    const gate = gateFor(store).gate;
    await expect(startBroadcastCore(gate, SEND, openMailer)).rejects.toThrow(
      "A broadcast is still sending. Wait a few minutes and check Recent broadcasts.",
    );
    calls.length = 0;
    const result = await continueBroadcastCore(gate, { id: SENDING_ROW_ID }, openMailer);
    expect(result.done).toBe(true);
    expect(sends).toHaveLength(1);
    expect(calls).not.toContain("hasSendingSince");
    expect(state.broadcasts[0].status).toBe("sent");
  });

  it("an interrupted row (untouched for 15 minutes) picks up where it stopped", async () => {
    const old = new Date(Date.now() - BROADCAST_SENDING_STALE_MS - 60_000).toISOString();
    const { store, state } = memoryStore({
      broadcasts: [jobRow(14, { updated_at: old, next_index: 10, recipient_count: 9, failed_emails: ["p4@example.com"] })],
    });
    const { sends, openMailer } = fakeMailer();
    const result = await continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer);
    expect(sends[0].recipients.map((r) => r.email)).toEqual(["p10@example.com", "p11@example.com", "p12@example.com", "p13@example.com"]);
    expect(result).toEqual({
      done: true,
      processed: 14,
      sentSoFar: 13,
      failedSoFar: 1,
      total: 14,
      failed: ["p4@example.com"],
    });
    expect(state.broadcasts[0].status).toBe("sent");
  });

  it("if the batch can't be recorded after sending, it says we lost contact (never 'try again')", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, broadcasts: [jobRow(25)], failUpdate: true });
    const { sends, openMailer } = fakeMailer();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer)).rejects.toThrow(LOST_CONTACT);
    expect(LOST_CONTACT).toBe(LOST_CONTACT_MESSAGE);
    expect(sends).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    expect(state.audits).toEqual([]);
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
    error.mockRestore();
  });

  it("if another tab already moved the row on, the batch isn't counted twice", async () => {
    const { store, state } = memoryStore({ broadcasts: [jobRow(25)] });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { openMailer } = fakeMailer(undefined, () => {
      state.broadcasts[0].next_index = 10; // the other tab's update lands first
    });
    await expect(continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer)).rejects.toThrow(LOST_CONTACT);
    expect(state.updates).toEqual([]);
    expect(state.broadcasts[0].recipient_count).toBe(0);
    error.mockRestore();
  });

  it("refuses an unknown or malformed id before sending", async () => {
    const { store } = memoryStore({ broadcasts: [jobRow(5)] });
    const { sends, openMailer } = fakeMailer();
    const gate = gateFor(store).gate;
    await expect(continueBroadcastCore(gate, { id: "not-a-uuid" }, openMailer)).rejects.toThrow("That broadcast wasn't found.");
    await expect(
      continueBroadcastCore(gate, { id: "5e000000-0000-4000-8000-0000000000ff" }, openMailer),
    ).rejects.toThrow("That broadcast wasn't found.");
    expect(sends).toEqual([]);
  });

  it("a missing attachment stops the batch before anything goes out, and says to mark it stopped", async () => {
    const { store, state } = memoryStore({ broadcasts: [jobRow(5, { attachments: [ATTACHMENT] })], failSign: true });
    const { sends, openMailer } = fakeMailer();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer)).rejects.toThrow(
      "An attachment for this broadcast is missing, so it can't be finished. Use Mark as stopped.",
    );
    error.mockRestore();
    expect(sends).toEqual([]);
    expect(state.broadcasts[0].next_index).toBe(0);
  });

  it("skips people who unsubscribed after the send started (neither sent nor failed) but moves past them", async () => {
    const { store, state } = memoryStore({ broadcasts: [jobRow(5)] });
    const { sends, openMailer } = fakeMailer();
    state.unsubscribed.add("u1");
    state.unsubscribed.add("u3");
    const result = await continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer);
    expect(sends[0].recipients.map((r) => r.email)).toEqual(["p0@example.com", "p2@example.com", "p4@example.com"]);
    expect(result).toEqual({ done: true, processed: 5, sentSoFar: 3, failedSoFar: 0, total: 5, failed: [] });
    expect(state.broadcasts[0]).toMatchObject({ status: "sent", next_index: 5, recipient_count: 3, failed_emails: [] });
  });

  it("a batch where everyone unsubscribed sends nothing and still moves on", async () => {
    const { store, state } = memoryStore({ broadcasts: [jobRow(12)] });
    const { sends, openMailer } = fakeMailer();
    for (let i = 0; i < 10; i++) state.unsubscribed.add(`u${i}`);
    const result = await continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer);
    expect(sends).toEqual([]);
    expect(result).toMatchObject({ done: false, processed: 10, sentSoFar: 0, failedSoFar: 0 });
    expect(state.broadcasts[0].next_index).toBe(10);
  });

  it("finishing keeps a draft saved after the send started (a new message), but clears an older one", async () => {
    const newer: BroadcastDraftRow = { ...DRAFT_WITH_ATTACHMENT, subject: "Next one", updated_at: new Date(Date.now() + 60_000).toISOString() };
    const a = memoryStore({ draft: newer, broadcasts: [jobRow(3)] });
    await continueBroadcastCore(gateFor(a.store).gate, { id: SENDING_ROW_ID }, fakeMailer().openMailer);
    expect(a.state.broadcasts[0].status).toBe("sent");
    expect(a.state.draft).toEqual(newer);

    const b = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, broadcasts: [jobRow(3)] });
    await continueBroadcastCore(gateFor(b.store).gate, { id: SENDING_ROW_ID }, fakeMailer().openMailer);
    expect(b.state.draft).toBeNull();
  });

  it("sends each person's copy with the same body and their own footer", async () => {
    const { store } = memoryStore({ broadcasts: [jobRow(2, { body_html: "<p>Shared <b>body</b></p>" })] });
    const { sends, openMailer } = fakeMailer();
    await continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer);
    const [a, b] = sends[0].recipients;
    expect(a.text.startsWith("Shared body")).toBe(true);
    expect(a.text.split("\n--\n")[0]).toBe(b.text.split("\n--\n")[0]);
    expect(a.text).toContain(a.unsubscribeUrl!);
    expect(b.text).toContain(b.unsubscribeUrl!);
    expect(a.unsubscribeUrl).not.toBe(b.unsubscribeUrl);
  });

  describe("stopBroadcastCore (Mark as stopped)", () => {
    const old = () => new Date(Date.now() - BROADCAST_SENDING_STALE_MS - 60_000).toISOString();

    it("marks an interrupted send failed, empties its list, audits it and leaves the draft", async () => {
      const { store, state } = memoryStore({
        draft: DRAFT_WITH_ATTACHMENT,
        broadcasts: [jobRow(30, { updated_at: old(), next_index: 20, recipient_count: 19, failed_emails: ["p5@example.com"] })],
      });
      await expect(stopBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID })).resolves.toEqual({ ok: true });
      expect(state.broadcasts[0]).toMatchObject({
        status: "failed",
        next_index: 20,
        recipient_count: 19,
        total_recipients: 30,
        pending_recipients: [],
      });
      expect(state.audits).toEqual([
        {
          actorUserId: "u-super",
          tableName: "broadcast_emails",
          rowId: SENDING_ROW_ID,
          action: "update",
          details: {
            stopped: true,
            subject: "Batch news",
            recipient_count: 19,
            failed_count: 1,
            stopped_after: 20,
            planned_count: 30,
          },
        },
      ]);
      expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
      // And it can't be continued any more.
      const { sends, openMailer } = fakeMailer();
      await expect(continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, openMailer)).resolves.toMatchObject({ done: true });
      expect(sends).toEqual([]);
    });

    it("refuses a send that's still going (moved in the last 15 minutes)", async () => {
      const { store, state } = memoryStore({ broadcasts: [jobRow(30, { next_index: 10 })] });
      await expect(stopBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID })).rejects.toThrow(
        "That broadcast is still sending. Wait a few minutes and check again.",
      );
      expect(state.broadcasts[0].status).toBe("sending");
      expect(state.audits).toEqual([]);
    });

    it("does nothing for a finished broadcast, and refuses an unknown id", async () => {
      const { store, state } = memoryStore({ broadcasts: [jobRow(3, { status: "sent", updated_at: old() })] });
      await expect(stopBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID })).resolves.toEqual({ ok: true });
      expect(state.broadcasts[0].status).toBe("sent");
      expect(state.audits).toEqual([]);
      await expect(stopBroadcastCore(gateFor(store).gate, { id: "nope" })).rejects.toThrow("That broadcast wasn't found.");
    });
  });

  describe("subrequest budget (Workers Free plan: 50 per request)", () => {
    const FIVE: BroadcastAttachment[] = Array.from({ length: 5 }, (_v, i) => ({
      ...ATTACHMENT,
      path: `draft/f${i}/file${i}.pdf`,
      filename: `file${i}.pdf`,
    }));

    async function oneContinue(row: StoredBroadcast, audience: Partial<StoredBroadcast> = {}) {
      const { store, state, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, broadcasts: [{ ...row, ...audience }] });
      for (const a of FIVE) state.objects.set(a.path, new Uint8Array(1));
      const requests: string[] = [];
      const keys: string[] = [];
      const fetchImpl = (async (url: string, init: RequestInit) => {
        requests.push(String(url));
        keys.push((init.headers as Record<string, string>)["Idempotency-Key"]);
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;
      const mailer: BroadcastMailer = {
        siteUrl: SITE,
        unsubscribeSecret: SECRET,
        sendEmails: (p) => sendBroadcastEmails({ ...p, apiKey: "k", from: "x <hello@example.com>", fetchImpl, sleep: async () => {} }),
      };
      const result = await continueBroadcastCore(gateFor(store).gate, { id: SENDING_ROW_ID }, async () => mailer);
      return { result, requests, calls, keys };
    }

    it("a middle batch with 5 attachments: 10 mail requests (each with its idempotency key) and 8 store calls", async () => {
      const { result, requests, calls, keys } = await oneContinue(
        jobRow(40, { attachments: FIVE, next_index: 20, recipient_count: 20 }),
      );
      expect(result.done).toBe(false);
      expect(requests).toHaveLength(BROADCAST_BATCH_SIZE);
      expect(requests.length).toBeLessThanOrEqual(10);
      expect(keys).toEqual(Array.from({ length: 10 }, (_v, i) => `bc-${SENDING_ROW_ID}-${20 + i}`));
      expect(calls).toEqual([
        "getBroadcast",
        "unsubscribedAmong",
        ...Array(5).fill("signAttachmentUrl"),
        "advanceBroadcast",
      ]);
    });

    it("the last batch (category audience) adds at most 3 store calls: label, audit, draft", async () => {
      const { result, requests, calls } = await oneContinue(jobRow(10, { attachments: FIVE }), {
        audience_type: "type_or_category",
        audience_filter: { member_type: null, category_id: CAT },
      });
      expect(result.done).toBe(true);
      expect(requests).toHaveLength(10);
      expect(calls).toEqual([
        "getBroadcast",
        "unsubscribedAmong",
        ...Array(5).fill("signAttachmentUrl"),
        "advanceBroadcast",
        "listCategories",
        "audit",
        "clearDraftIfSavedBy",
      ]);
      // Plus 2-3 for the super admin check: well under 50 even if every email is retried once after a 429.
      expect(2 * requests.length + calls.length + 3).toBeLessThanOrEqual(50);
    });
  });
});

describe("sendBroadcastTestCore", () => {
  it("goes only to the super admin, with no footer, no row and no audit", async () => {
    const { store, state, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { sends, openMailer } = fakeMailer();
    const result = await sendBroadcastTestCore(
      gateFor(store).gate,
      { ...SEND, attachments: [{ path: ATTACHMENT.path }] },
      openMailer,
    );
    expect(result).toEqual({ sentTo: "boss@example.com" });
    expect(sends).toHaveLength(1);
    expect(sends[0].recipients).toHaveLength(1);
    const [r] = sends[0].recipients;
    expect(r.email).toBe("boss@example.com");
    expect(r.unsubscribeUrl).toBeNull();
    expect(r.oneClickUrl).toBeNull();
    expect(r.html).not.toContain("Unsubscribe");
    expect(r.html).toContain("<p>Come along</p>");
    expect(sends[0].replyTo).toBe("boss@example.com");
    expect(sends[0].attachments).toHaveLength(1);
    expect(state.inserted).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
    expect(calls).not.toContain("listMembers");
  });

  it("carries no List-Unsubscribe headers on the wire", async () => {
    const { store } = memoryStore();
    const bodies: Record<string, unknown>[] = [];
    const wireHeaders: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      bodies.push(JSON.parse(init.body));
      wireHeaders.push(init.headers);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const mailer: BroadcastMailer = {
      siteUrl: SITE,
      unsubscribeSecret: SECRET,
      sendEmails: (p) =>
        sendBroadcastEmails({ ...p, apiKey: "k", from: "x <hello@example.com>", fetchImpl, sleep: async () => {} }),
    };
    await sendBroadcastTestCore(gateFor(store).gate, SEND, async () => mailer);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].headers).toBeUndefined();
    expect(wireHeaders[0]["Idempotency-Key"]).toBeUndefined();
  });

  it("throws when the test email isn't accepted", async () => {
    const { store } = memoryStore();
    const { openMailer } = fakeMailer((emails) => ({ sent: [], failed: emails }));
    await expect(sendBroadcastTestCore(gateFor(store).gate, SEND, openMailer)).rejects.toThrow(
      "Couldn't send the test email. Try again.",
    );
  });
});
