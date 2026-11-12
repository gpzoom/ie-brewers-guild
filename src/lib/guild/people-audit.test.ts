import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClientForRequest: vi.fn(),
  getSupabaseServiceRoleClient: vi.fn(async () => ({ from: () => ({ insert }) })),
}));
vi.mock("@/lib/guild/impersonation.server", () => ({
  readImpersonationState: vi.fn(),
  touchImpersonationActivity: vi.fn(),
}));

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { recordPeopleAudit } from "@/lib/guild/audit-log.server";

const params = {
  actorUserId: "u1",
  memberId: "m1",
  tableName: "member_users" as const,
  rowId: null,
  action: "delete" as const,
  details: { kind: "remove" as const, email: "a@b.com", role: "editor" },
  impersonating: false,
};

describe("recordPeopleAudit", () => {
  beforeEach(() => insert.mockReset());

  it("inserts the row with the real actor and the details", async () => {
    insert.mockResolvedValue({ error: null });
    await recordPeopleAudit(params);
    expect(insert).toHaveBeenCalledWith({
      actor_user_id: "u1",
      member_id: "m1",
      table_name: "member_users",
      row_id: null,
      action: "delete",
      details: { ...params.details, impersonating: false },
    });
  });

  it("stores whether a Guild admin was editing as the member", async () => {
    insert.mockResolvedValue({ error: null });
    await recordPeopleAudit({ ...params, impersonating: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ details: { ...params.details, impersonating: true } }),
    );
  });

  it("never throws when the insert fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockResolvedValue({ error: { message: "nope" } });
    await expect(recordPeopleAudit(params)).resolves.toBeUndefined();
    vi.mocked(getSupabaseServiceRoleClient).mockImplementationOnce(() => {
      throw new Error("no client");
    });
    await expect(recordPeopleAudit(params)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
