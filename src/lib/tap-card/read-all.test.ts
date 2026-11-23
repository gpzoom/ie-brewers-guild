import { describe, expect, it } from "vitest";
import { readAll } from "./read-all";

function source(total: number) {
  const all = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: all.slice(from, to + 1), error: null };
  };
  return { all, calls, page };
}

describe("readAll", () => {
  it.each([0, 999, 1000, 1001, 2500])("returns all %i rows", async (n) => {
    const { all, page } = source(n);
    expect(await readAll(page)).toEqual(all);
  });

  it("asks for 1,000 rows at a time", async () => {
    const { calls, page } = source(2500);
    await readAll(page);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws on an error", async () => {
    await expect(readAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
