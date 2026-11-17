import { describe, expect, it } from "vitest";
import { stashFillSummary, takeFillSummary } from "./fill-summary-carry";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("fill summary carried across the reload", () => {
  it("is read back once, for the same member only", () => {
    const store = memoryStore();
    stashFillSummary(
      "m1",
      { filled: ["address", "hours"], kept: ["phone"], permanentlyClosed: false },
      store,
    );
    expect(takeFillSummary("m2", store)).toBeNull();
    expect(takeFillSummary("m1", store)).toEqual({
      filled: ["address", "hours"],
      kept: ["phone"],
      permanentlyClosed: false,
    });
    expect(takeFillSummary("m1", store)).toBeNull();
  });

  it("no storage or bad data gives no summary instead of an error", () => {
    expect(takeFillSummary("m1", null)).toBeNull();
    const store = memoryStore();
    store.setItem("fill-from-google-summary:m1", "{not json");
    expect(takeFillSummary("m1", store)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(() =>
      stashFillSummary("m1", { filled: [], kept: [], permanentlyClosed: false }, throwing),
    ).not.toThrow();
    expect(takeFillSummary("m1", throwing)).toBeNull();
  });
});
