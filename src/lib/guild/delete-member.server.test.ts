import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMemberCore } from "./delete-member.server";

type Action = "select" | "insert" | "update" | "delete";
type Op = {
  table: string;
  action: Action;
  payload?: unknown;
  filters: Record<string, unknown>;
  returning: boolean;
};
type Result = { data: unknown; error: { message: string } | null };
type Responder = (op: Op) => Result;

/** Minimal chainable stand-in for supabase-js's query builder. */
function makeFrom(log: Op[], respond: Responder) {
  return (table: string) => {
    const op: Op = { table, action: "select", filters: {}, returning: false };
    const run = () => {
      log.push(op);
      return respond(op);
    };
    const q = {
      select() {
        if (op.action !== "select") op.returning = true;
        return q;
      },
      insert(payload: unknown) {
        op.action = "insert";
        op.payload = payload;
        return q;
      },
      update(payload: unknown) {
        op.action = "update";
        op.payload = payload;
        return q;
      },
      delete() {
        op.action = "delete";
        return q;
      },
      eq(col: string, val: unknown) {
        op.filters[col] = val;
        return q;
      },
      limit() {
        return q;
      },
      async maybeSingle() {
        const r = run();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return q;
  };
}

function fakeSessionClient(isAdmin: boolean): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
    from: makeFrom([], (op) => {
      if (op.table !== "profiles") throw new Error(`unexpected session table ${op.table}`);
      return { data: { is_guild_admin: isAdmin }, error: null };
    }),
  } as unknown as SupabaseClient;
}

type StorageState = Record<string, string[]>; // bucket -> full object paths

function fakeStorage(files: StorageState, log: Op[], opts: { failList?: boolean }) {
  const removed: Record<string, string[]> = {};
  return {
    removed,
    api: {
      from(bucket: string) {
        return {
          async list(prefix: string, { limit, offset }: { limit: number; offset: number }) {
            if (opts.failList) return { data: null, error: { message: "storage down" } };
            const children = new Map<string, boolean>(); // name -> isFolder
            for (const path of files[bucket] ?? []) {
              if (!path.startsWith(`${prefix}/`)) continue;
              const rest = path.slice(prefix.length + 1).split("/");
              children.set(rest[0], rest.length > 1 || children.get(rest[0]) === true);
            }
            const entries = [...children.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` }));
            return { data: entries.slice(offset, offset + limit), error: null };
          },
          async remove(paths: string[]) {
            log.push({ table: `storage:${bucket}`, action: "delete", payload: paths, filters: {}, returning: false });
            removed[bucket] = [...(removed[bucket] ?? []), ...paths];
            return { data: [], error: null };
          },
        };
      },
    },
  };
}

function fakeServiceClient(opts: {
  memberUserIds?: string[];
  guildAdminUserIds?: string[];
  otherLinkedUserIds?: string[];
  deletedRows?: number;
  files?: StorageState;
  failStorageList?: boolean;
  failAuditInsert?: boolean;
}) {
  const log: Op[] = [];
  const deletedUsers: string[] = [];
  const storage = fakeStorage(opts.files ?? {}, log, { failList: opts.failStorageList });
  const respond: Responder = (op) => {
    if (op.table === "member_users" && op.filters.member_id) {
      return { data: (opts.memberUserIds ?? []).map((user_id) => ({ user_id })), error: null };
    }
    if (op.table === "member_users" && op.filters.user_id) {
      const linked = (opts.otherLinkedUserIds ?? []).includes(op.filters.user_id as string);
      return { data: linked ? [{ member_id: "other-member" }] : [], error: null };
    }
    if (op.table === "profiles") {
      return { data: { is_guild_admin: (opts.guildAdminUserIds ?? []).includes(op.filters.id as string) }, error: null };
    }
    if (op.table === "audit_log" && op.action === "insert" && opts.failAuditInsert) {
      return { data: null, error: { message: "audit insert denied" } };
    }
    if (op.table === "members" && op.action === "delete") {
      return { data: Array.from({ length: opts.deletedRows ?? 1 }, () => ({ id: "member-1" })), error: null };
    }
    return { data: null, error: null };
  };
  const client = {
    from: makeFrom(log, respond),
    storage: storage.api,
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          log.push({ table: "auth.users", action: "delete", payload: id, filters: {}, returning: false });
          deletedUsers.push(id);
          return { data: {}, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;
  return { client, log, deletedUsers, removed: storage.removed };
}

const writes = (log: Op[]) => log.filter((op) => op.action !== "select");

describe("deleteMemberCore", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a non-admin without touching anything", async () => {
    const service = fakeServiceClient({ memberUserIds: ["user-1"] });
    await expect(deleteMemberCore("member-1", fakeSessionClient(false), service.client)).rejects.toThrow(
      "Only a Guild admin can delete a member.",
    );
    expect(service.log).toHaveLength(0);
    expect(service.deletedUsers).toHaveLength(0);
  });

  it("detaches history, deletes slides then the member, then cleans storage and the sign-in account, in order", async () => {
    const service = fakeServiceClient({
      memberUserIds: ["user-1"],
      files: {
        "member-media": ["member-1/a.jpg", "member-1/carousel/b.jpg", "member-1/carousel/deep/c.jpg", "member-2/x.jpg"],
        "member-logos": ["member-1/logo.png"],
      },
    });
    const result = await deleteMemberCore("member-1", fakeSessionClient(true), service.client);
    expect(result).toEqual({ ok: true });

    expect(writes(service.log).map((op) => `${op.action} ${op.table}`)).toEqual([
      "update audit_log",
      "insert audit_log",
      "update inquiries",
      "delete carousel_slides",
      "delete members",
      "delete storage:member-media",
      "delete storage:member-logos",
      "delete auth.users",
    ]);
    const [audit, auditRow, inquiries, slides, member] = writes(service.log);
    expect(audit).toMatchObject({ payload: { member_id: null }, filters: { member_id: "member-1" } });
    expect(auditRow.payload).toEqual({
      actor_user_id: "admin-1",
      member_id: null,
      table_name: "members",
      row_id: "member-1",
      action: "delete",
    });
    expect(inquiries).toMatchObject({
      payload: { converted_member_id: null },
      filters: { converted_member_id: "member-1" },
    });
    expect(slides.filters).toEqual({ member_id: "member-1" });
    expect(member).toMatchObject({ filters: { id: "member-1" }, returning: true });

    // member_users were read before the member delete cascaded them away.
    const linksRead = service.log.findIndex((op) => op.table === "member_users" && op.filters.member_id);
    expect(linksRead).toBeLessThan(service.log.indexOf(audit));

    expect(service.removed["member-media"]?.sort()).toEqual(
      ["member-1/a.jpg", "member-1/carousel/b.jpg", "member-1/carousel/deep/c.jpg"].sort(),
    );
    expect(service.removed["member-logos"]).toEqual(["member-1/logo.png"]);
    expect(service.deletedUsers).toEqual(["user-1"]);
  });

  it("aborts before deleting anything when the audit row can't be written", async () => {
    const service = fakeServiceClient({
      memberUserIds: ["user-1"],
      files: { "member-media": ["member-1/a.jpg"] },
      failAuditInsert: true,
    });
    await expect(deleteMemberCore("member-1", fakeSessionClient(true), service.client)).rejects.toThrow(
      "audit insert denied",
    );
    expect(writes(service.log).map((op) => `${op.action} ${op.table}`)).toEqual([
      "update audit_log",
      "insert audit_log",
    ]);
    expect(service.removed["member-media"]).toBeUndefined();
    expect(service.deletedUsers).toHaveLength(0);
  });

  it("pages through large folders and removes files in batches", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `member-1/f${String(i).padStart(3, "0")}.jpg`);
    const service = fakeServiceClient({ files: { "member-media": many } });
    await deleteMemberCore("member-1", fakeSessionClient(true), service.client);
    expect(service.removed["member-media"]).toHaveLength(250);
    const batches = service.log.filter((op) => op.table === "storage:member-media");
    expect(batches.map((op) => (op.payload as string[]).length)).toEqual([100, 100, 50]);
  });

  it("does not delete a sign-in account that belongs to a Guild admin or is still linked to another member", async () => {
    const service = fakeServiceClient({
      memberUserIds: ["admin-user", "shared-user", "solo-user"],
      guildAdminUserIds: ["admin-user"],
      otherLinkedUserIds: ["shared-user"],
    });
    await deleteMemberCore("member-1", fakeSessionClient(true), service.client);
    expect(service.deletedUsers).toEqual(["solo-user"]);
  });

  it("throws when no member row was actually deleted, and cleans nothing up", async () => {
    const service = fakeServiceClient({
      memberUserIds: ["user-1"],
      deletedRows: 0,
      files: { "member-media": ["member-1/a.jpg"] },
    });
    await expect(deleteMemberCore("member-1", fakeSessionClient(true), service.client)).rejects.toThrow(
      "could not be found",
    );
    expect(service.removed["member-media"]).toBeUndefined();
    expect(service.deletedUsers).toHaveLength(0);
  });

  it("still succeeds (and still removes the account) when storage cleanup fails", async () => {
    const service = fakeServiceClient({
      memberUserIds: ["user-1"],
      files: { "member-media": ["member-1/a.jpg"] },
      failStorageList: true,
    });
    await expect(deleteMemberCore("member-1", fakeSessionClient(true), service.client)).resolves.toEqual({ ok: true });
    expect(service.deletedUsers).toEqual(["user-1"]);
    expect(console.error).toHaveBeenCalled();
  });
});
