import { describe, expect, it } from "vitest";
import { writeThenRefresh } from "@/lib/guild/write-then-refresh";

describe("writeThenRefresh", () => {
  it("returns the write's value and no failure when both work", async () => {
    expect(await writeThenRefresh(async () => 7, async () => {})).toEqual({ value: 7, refreshFailed: false });
  });
  it("does not throw when only the refresh fails", async () => {
    const out = await writeThenRefresh(
      async () => ({ id: "a1" }),
      async () => {
        throw new Error("network");
      },
    );
    expect(out).toEqual({ value: { id: "a1" }, refreshFailed: true });
  });
  it("throws when the write fails, and never refreshes", async () => {
    let refreshed = false;
    await expect(
      writeThenRefresh(
        async () => {
          throw new Error("denied");
        },
        async () => {
          refreshed = true;
        },
      ),
    ).rejects.toThrow("denied");
    expect(refreshed).toBe(false);
  });
});
