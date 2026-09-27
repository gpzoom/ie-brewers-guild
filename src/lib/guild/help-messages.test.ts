import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseHelpMessageShow,
  setHelpMessageStatusCore,
  validateHelpStatusInput,
} from "./help-messages";

const ID = "f4000000-0000-4000-8000-000000000001";

function fakeSession(isSuperAdmin: boolean) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "me@example.com" } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { is_guild_admin: true, is_super_admin: isSuperAdmin },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function fakeService(found = true) {
  const updates: Array<{ values: Record<string, unknown>; id: unknown }> = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("support_messages");
      return {
        update: (values: Record<string, unknown>) => ({
          eq: (_column: string, id: unknown) => ({
            select: async () => {
              updates.push({ values, id });
              return { data: found ? [{ id }] : [], error: null };
            },
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

const now = new Date("2026-09-27T20:00:00Z");

describe("setHelpMessageStatusCore", () => {
  it("refuses a Guild admin before the service key is ever opened", async () => {
    const openService = vi.fn();
    await expect(
      setHelpMessageStatusCore(fakeSession(false), openService, { id: ID, done: true }, now),
    ).rejects.toThrow("Only the super admin can mark Help messages.");
    expect(openService).not.toHaveBeenCalled();
  });

  it("marks a message done, with who and when", async () => {
    const service = fakeService();
    await setHelpMessageStatusCore(
      fakeSession(true),
      async () => service.client,
      { id: ID, done: true },
      now,
    );
    expect(service.updates).toEqual([
      {
        id: ID,
        values: {
          status: "done",
          handled_at: "2026-09-27T20:00:00.000Z",
          handled_by_user_id: "user-1",
        },
      },
    ]);
  });

  it("moves a message back to waiting", async () => {
    const service = fakeService();
    await setHelpMessageStatusCore(
      fakeSession(true),
      async () => service.client,
      { id: ID, done: false },
      now,
    );
    expect(service.updates[0].values).toEqual({
      status: "waiting",
      handled_at: null,
      handled_by_user_id: null,
    });
  });

  it("says so when the message is gone", async () => {
    const service = fakeService(false);
    await expect(
      setHelpMessageStatusCore(
        fakeSession(true),
        async () => service.client,
        { id: ID, done: true },
        now,
      ),
    ).rejects.toThrow("That message wasn't found.");
  });
});

describe("inputs", () => {
  it("shows Waiting unless Done or All is asked for", () => {
    expect(parseHelpMessageShow(undefined)).toBe("waiting");
    expect(parseHelpMessageShow("nonsense")).toBe("waiting");
    expect(parseHelpMessageShow("done")).toBe("done");
    expect(parseHelpMessageShow("all")).toBe("all");
  });

  it("needs a message id and done: true or false", () => {
    expect(validateHelpStatusInput({ id: ID, done: true })).toEqual({ id: ID, done: true });
    expect(() => validateHelpStatusInput({ id: "x", done: true })).toThrow();
    expect(() => validateHelpStatusInput({ id: ID, done: "yes" })).toThrow();
  });
});
