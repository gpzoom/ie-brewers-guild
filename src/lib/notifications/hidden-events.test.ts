import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHiddenEventIds, withoutHidden } from "./hidden-events";

function client(result: { data: unknown; error: unknown } | Error) {
  const rpc = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("withoutHidden", () => {
  it("drops listed ids and keeps the order", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(withoutHidden(rows, new Set(["b", "d"]))).toEqual([{ id: "a" }, { id: "c" }]);
  });
  it("returns everything for an empty set", () => {
    const rows = [{ id: "a" }];
    expect(withoutHidden(rows, new Set())).toEqual(rows);
  });
});

describe("loadHiddenEventIds", () => {
  it("returns the RPC ids", async () => {
    const { client: c, rpc } = client({ data: ["b", "d"], error: null });
    const out = await loadHiddenEventIds(c, ["a", "b", "d"]);
    expect([...out].sort()).toEqual(["b", "d"]);
    expect(rpc).toHaveBeenCalledWith("open_conflict_event_ids", { p_event_ids: ["a", "b", "d"] });
  });
  it("skips the call for no ids", async () => {
    const { client: c, rpc } = client({ data: [], error: null });
    expect((await loadHiddenEventIds(c, [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns an empty set on an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client: c } = client({ data: null, error: { message: "boom" } });
    expect((await loadHiddenEventIds(c, ["a"])).size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("returns an empty set when the call throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client: c } = client(new Error("network"));
    expect((await loadHiddenEventIds(c, ["a"])).size).toBe(0);
    spy.mockRestore();
  });
});
