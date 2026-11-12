import { describe, expect, it, vi } from "vitest";
import {
  addBroadcastAttachment,
  BROADCAST_SENDING_STALE_MS,
  collectUserEmails,
  loadBroadcastPage,
  previewBroadcastAudienceCore,
  removeBroadcastAttachmentCore,
  saveBroadcastDraftCore,
  sendBroadcastCore,
  sendBroadcastTestCore,
  type BroadcastAttachment,
  type BroadcastAuditEntry,
  type BroadcastDraftRow,
  type BroadcastGate,
  type BroadcastInsertRow,
  type BroadcastMailer,
  type BroadcastStore,
  type BroadcastSendRequest,
  type BroadcastUpdatePatch,
} from "@/lib/guild/broadcast-core";
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

type StoredBroadcast = BroadcastInsertRow & { sent_at: string };

function memoryStore(
  seed: {
    draft?: BroadcastDraftRow | null;
    unsubscribed?: string[];
    failInsert?: boolean;
    failUpdate?: boolean;
    failSign?: boolean;
    failRemove?: boolean;
    broadcasts?: StoredBroadcast[];
  } = {},
) {
  const calls: string[] = [];
  const state = {
    draft: seed.draft ?? null,
    inserted: [] as BroadcastInsertRow[],
    broadcasts: [...(seed.broadcasts ?? [])] as StoredBroadcast[],
    updates: [] as { id: string; patch: BroadcastUpdatePatch }[],
    audits: [] as BroadcastAuditEntry[],
    objects: new Map<string, Uint8Array>([[ATTACHMENT.path, new TextEncoder().encode("hello")]]),
    removed: [] as string[],
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
    clearDraft: track("clearDraft", async () => {
      state.draft = null;
    }),
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
      },
    ]),
    listMembers: track("listMembers", async () => MEMBERS),
    listCategories: track("listCategories", async () => [{ id: CAT, name: "Food trucks" }]),
    listMemberUsers: track("listMemberUsers", async (ids: string[]) =>
      USER_ROWS.filter((r) => ids.includes(r.member_id)),
    ),
    emailsFor: track("emailsFor", async (ids: string[]) => new Map(ids.map((id) => [id, EMAILS[id] ?? null]))),
    unsubscribedUserIds: track("unsubscribedUserIds", async () => new Set(seed.unsubscribed ?? [])),
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
      state.broadcasts.some((b) => b.status === "sending" && b.sent_at >= sinceIso),
    ),
    insertBroadcast: track("insertBroadcast", async (row: BroadcastInsertRow) => {
      if (seed.failInsert) throw new Error("db down");
      state.inserted.push({ ...row });
      state.broadcasts.push({ ...row, sent_at: new Date().toISOString() });
    }),
    updateBroadcast: track("updateBroadcast", async (id: string, patch: BroadcastUpdatePatch) => {
      if (seed.failUpdate) throw new Error("db down");
      state.updates.push({ id, patch: { ...patch, failed_emails: [...patch.failed_emails] } });
      const row = state.inserted.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
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

const SENDING_ROW: StoredBroadcast = {
  id: "b-sending",
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
  sent_at: "",
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
    ["send", (g) => sendBroadcastCore(g, SEND, fakeMailer().openMailer)],
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
      },
      {
        id: "b-old",
        sent_at: "2026-11-01T00:00:00Z",
        subject: "Old",
        audienceLabel: "2 picked members",
        recipient_count: 3,
        status: "sent",
        failedCount: 1,
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
  it("labels a fresh 'sending' row sending and an old one interrupted", async () => {
    const { store } = memoryStore();
    const fresh = new Date(Date.now() - 60_000).toISOString();
    const stale = new Date(Date.now() - BROADCAST_SENDING_STALE_MS - 60_000).toISOString();
    store.listRecent = async () => [
      { id: "s-fresh", sent_at: fresh, subject: "A", audience_type: "all", audience_filter: null, member_ids: null, recipient_count: 4, status: "sending", failed_emails: [] },
      { id: "s-stale", sent_at: stale, subject: "B", audience_type: "all", audience_filter: null, member_ids: null, recipient_count: 20, status: "sending", failed_emails: ["x@example.com"] },
    ];
    const page = await loadBroadcastPage(gateFor(store).gate);
    expect(page.recent.map((r) => [r.id, r.status, r.recipient_count, r.failedCount])).toEqual([
      ["s-fresh", "sending", 4, 0],
      ["s-stale", "interrupted", 20, 1],
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

describe("sendBroadcastCore", () => {
  it("validates subject, body and recipients", async () => {
    const { store, calls } = memoryStore();
    const { gate } = gateFor(store);
    const { openMailer, sends } = fakeMailer();
    await expect(sendBroadcastCore(gate, { ...SEND, subject: "   " }, openMailer)).rejects.toThrow("Add a subject.");
    await expect(
      sendBroadcastCore(gate, { ...SEND, bodyHtml: "<p> <script>x</script></p>" }, openMailer),
    ).rejects.toThrow("Write a message.");
    await expect(
      sendBroadcastCore(gate, { ...SEND, audience: { type: "members", memberIds: [M4] } }, openMailer),
    ).rejects.toThrow("No one to send to.");
    expect(sends).toEqual([]);
    expect(calls).not.toContain("insertBroadcast");
    expect(calls).not.toContain("audit");
  });

  it("sends the sanitized body with a per-recipient unsubscribe link, writes the row and audit, and clears the draft", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { mailer, sends, openMailer } = fakeMailer();
    const result = await sendBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, openMailer);

    expect(result).toEqual({ sent: 3, failed: [], memberCount: 3 });
    expect(sends).toHaveLength(1);
    const send = sends[0];
    expect(send.subject).toBe("Meeting Thursday");
    expect(send.replyTo).toBe("boss@example.com");
    expect(send.attachments).toEqual([
      { filename: "agenda.pdf", path: `https://storage.example/signed/${ATTACHMENT.path}?token=t` },
    ]);
    expect(send.recipients.map((r) => r.email)).toEqual(["one@example.com", "two@example.com", "three@example.com"]);

    const ids = ["u1", "u2", "u3"];
    for (const [i, r] of send.recipients.entries()) {
      expect(r.html).toContain("<p>Come along</p>");
      expect(r.html).not.toMatch(/script|onclick|style="color:red"/);
      expect(r.unsubscribeUrl).toMatch(new RegExp(`^${SITE}/unsubscribe/`));
      expect(r.html).toContain(r.unsubscribeUrl!);
      const token = r.unsubscribeUrl!.split("/unsubscribe/")[1];
      expect(r.oneClickUrl).toBe(`${SITE}/api/unsubscribe/${token}`);
      expect(await verifyUnsubscribeToken(token, mailer.unsubscribeSecret)).toEqual({ valid: true, userId: ids[i] });
    }
    expect(new Set(send.recipients.map((r) => r.unsubscribeUrl)).size).toBe(3);

    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0];
    expect(row).toMatchObject({
      sent_by_user_id: "u-super",
      subject: "Meeting Thursday",
      body_html: "<p>Come along</p>",
      attachments: [ATTACHMENT],
      audience_type: "all",
      audience_filter: null,
      member_ids: null,
      recipient_count: 3,
      failed_emails: [],
      status: "sent",
    });
    expect(state.audits).toEqual([
      {
        actorUserId: "u-super",
        tableName: "broadcast_emails",
        rowId: row.id,
        action: "insert",
        details: { subject: "Meeting Thursday", audience: "All members", planned_count: 3, status: "sending" },
      },
      {
        actorUserId: "u-super",
        tableName: "broadcast_emails",
        rowId: row.id,
        action: "update",
        details: {
          subject: "Meeting Thursday",
          recipient_count: 3,
          failed_count: 0,
          failed_emails: [],
          audience: "All members",
        },
      },
    ]);
    expect(state.draft).toBeNull();
    expect(state.removed).toEqual([]);
  });

  it("marks the row failed when nothing was accepted, lists the failures, and keeps the draft", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { openMailer } = fakeMailer((emails) => ({ sent: [], failed: emails }));
    const result = await sendBroadcastCore(gateFor(store).gate, SEND, openMailer);
    expect(result).toEqual({
      sent: 0,
      failed: ["one@example.com", "two@example.com", "three@example.com"],
      memberCount: 3,
    });
    expect(state.inserted[0]).toMatchObject({
      status: "failed",
      recipient_count: 0,
      failed_emails: ["one@example.com", "two@example.com", "three@example.com"],
    });
    expect(state.audits[1].details).toMatchObject({
      recipient_count: 0,
      failed_count: 3,
      failed_emails: ["one@example.com", "two@example.com", "three@example.com"],
    });
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
  });

  it("partial failure is still 'sent' and clears the draft", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { openMailer } = fakeMailer((emails) => ({ sent: emails.slice(1), failed: emails.slice(0, 1) }));
    const result = await sendBroadcastCore(gateFor(store).gate, SEND, openMailer);
    expect(result.sent).toBe(2);
    expect(state.inserted[0]).toMatchObject({ status: "sent", recipient_count: 2, failed_emails: ["one@example.com"] });
    expect(state.audits[1].details).toMatchObject({ failed_count: 1, failed_emails: ["one@example.com"] });
    expect(state.draft).toBeNull();
  });

  it("refuses an attachment that isn't in the draft or isn't under draft/", async () => {
    const { store } = memoryStore({ draft: { ...DRAFT_WITH_ATTACHMENT, attachments: [{ ...ATTACHMENT, path: "other/a.pdf" }] } });
    const { openMailer, sends } = fakeMailer();
    await expect(
      sendBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: "other/a.pdf" }] }, openMailer),
    ).rejects.toThrow("That attachment isn't in the draft anymore.");
    await expect(
      sendBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, openMailer),
    ).rejects.toThrow("That attachment isn't in the draft anymore.");
    expect(sends).toEqual([]);
  });

  it("writes the 'sending' row and its audit row before the first email goes out", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    let seen: { rows: BroadcastInsertRow[]; audits: number } | null = null;
    const { openMailer } = fakeMailer(undefined, () => {
      seen = { rows: state.inserted.map((r) => ({ ...r })), audits: state.audits.length };
    });
    await sendBroadcastCore(gateFor(store).gate, SEND, openMailer);
    expect(seen!.rows).toHaveLength(1);
    expect(seen!.rows[0]).toMatchObject({ status: "sending", recipient_count: 0, failed_emails: [], subject: "Meeting Thursday" });
    expect(seen!.audits).toBe(1);
    expect(state.updates.at(-1)).toEqual({
      id: seen!.rows[0].id,
      patch: { status: "sent", recipient_count: 3, failed_emails: [] },
    });
  });

  it("refuses while another send started in the last 15 minutes is still 'sending'", async () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const { store, calls } = memoryStore({ broadcasts: [{ ...SENDING_ROW, sent_at: recent }] });
    const { openMailer, sends } = fakeMailer();
    await expect(sendBroadcastCore(gateFor(store).gate, SEND, openMailer)).rejects.toThrow(
      "A broadcast is still sending. Wait a few minutes and check Recent broadcasts.",
    );
    expect(sends).toEqual([]);
    expect(calls).not.toContain("insertBroadcast");
  });

  it("allows a send when the only 'sending' row is older than 15 minutes (interrupted)", async () => {
    const old = new Date(Date.now() - BROADCAST_SENDING_STALE_MS - 60_000).toISOString();
    const { store } = memoryStore({ broadcasts: [{ ...SENDING_ROW, sent_at: old }] });
    const { openMailer, sends } = fakeMailer();
    const result = await sendBroadcastCore(gateFor(store).gate, SEND, openMailer);
    expect(result.sent).toBe(3);
    expect(sends).toHaveLength(1);
  });

  it("a failed 'sending' row insert refuses before anything is sent", async () => {
    const { store, state } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, failInsert: true });
    const { openMailer, sends } = fakeMailer();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendBroadcastCore(gateFor(store).gate, SEND, openMailer)).rejects.toThrow(
      "Couldn't start the send. Nothing was sent.",
    );
    expect(sends).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.draft).toEqual(DRAFT_WITH_ATTACHMENT);
    error.mockRestore();
  });

  it("an attachment that can't be signed refuses before anything is written or sent", async () => {
    const { store, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT, failSign: true });
    const { openMailer, sends } = fakeMailer();
    await expect(
      sendBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, openMailer),
    ).rejects.toThrow("Couldn't read an attachment. Remove it and attach it again.");
    expect(sends).toEqual([]);
    expect(calls).not.toContain("insertBroadcast");
  });

  it("signs each attachment once per send, not per recipient", async () => {
    const { store, calls } = memoryStore({ draft: DRAFT_WITH_ATTACHMENT });
    const { openMailer } = fakeMailer();
    await sendBroadcastCore(gateFor(store).gate, { ...SEND, attachments: [{ path: ATTACHMENT.path }] }, openMailer);
    expect(calls.filter((c) => c === "signAttachmentUrl")).toHaveLength(1);
  });

  it("progress updates the row's count and failures while still 'sending'", async () => {
    const { store, state } = memoryStore();
    const { openMailer } = fakeMailer(undefined, async (p) => {
      await p.onProgress?.(["one@example.com"], ["two@example.com"]);
    });
    await sendBroadcastCore(gateFor(store).gate, SEND, openMailer);
    expect(state.updates[0]).toEqual({
      id: state.inserted[0].id,
      patch: { recipient_count: 1, failed_emails: ["two@example.com"] },
    });
    expect(state.updates).toHaveLength(2);
    expect(state.inserted[0].status).toBe("sent");
  });

  it("a failed final update after sending is logged, not thrown (the emails already went out)", async () => {
    const { store, state } = memoryStore({ failUpdate: true });
    const { openMailer } = fakeMailer();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendBroadcastCore(gateFor(store).gate, SEND, openMailer);
    expect(result.sent).toBe(3);
    expect(error).toHaveBeenCalled();
    expect(state.audits.map((a) => a.action)).toEqual(["insert", "update"]);
    expect(state.draft).toBeNull();
    error.mockRestore();
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
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
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
  });

  it("throws when the test email isn't accepted", async () => {
    const { store } = memoryStore();
    const { openMailer } = fakeMailer((emails) => ({ sent: [], failed: emails }));
    await expect(sendBroadcastTestCore(gateFor(store).gate, SEND, openMailer)).rejects.toThrow(
      "Couldn't send the test email. Try again.",
    );
  });
});
