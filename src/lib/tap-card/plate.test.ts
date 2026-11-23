import { describe, expect, it } from "vitest";
import {
  PLATE_MAX_MISSES,
  signedOutButtons,
  plateUrl,
  safeHolderNext,
  staffCodeGate,
  triesLeft,
  validateStaffCode,
  type AttemptStore,
} from "@/lib/tap-card/plate";

describe("validateStaffCode", () => {
  it("takes exactly 4 digits", () => {
    expect(validateStaffCode(" 0420 ")).toEqual({ ok: true, code: "0420" });
    for (const bad of ["420", "12a4", "12345", ""]) expect(validateStaffCode(bad)).toEqual({ ok: false, message: "Use 4 digits." });
  });
});

describe("plateUrl", () => {
  it("is the site's /t/ link", () => {
    expect(plateUrl("https://x.org", "ABCD2345")).toBe("https://x.org/t/ABCD2345");
  });
});

describe("triesLeft", () => {
  it("counts down from 5 wrong codes", () => {
    expect(PLATE_MAX_MISSES).toBe(5);
    expect(triesLeft(1)).toBe(4);
    expect(triesLeft(5)).toBe(0);
    expect(triesLeft(9)).toBe(0);
  });
});

describe("safeHolderNext", () => {
  it("only allows a plate page or the card page after signing in", () => {
    expect(safeHolderNext("/t/ABCD2345")).toBe("/t/ABCD2345");
    expect(safeHolderNext("/card")).toBe("/card");
    expect(safeHolderNext("https://evil.example/t/ABCD2345")).toBeNull();
    expect(safeHolderNext("//evil.example")).toBeNull();
    expect(safeHolderNext("/t/ABCD2345/../../admin")).toBeNull();
    expect(safeHolderNext(undefined)).toBeNull();
  });
});

describe("staffCodeGate", () => {
  function attempts() {
    const rows: string[] = [];
    let n = 0;
    const store: AttemptStore = {
      async record() {
        const id = `a${++n}`;
        rows.push(id);
        return id;
      },
      async recent() {
        return rows.length;
      },
      async clear(id) {
        rows.splice(rows.indexOf(id), 1);
      },
    };
    return { store, rows };
  }

  const matcher = (entered: string, stored: string | null) => () => (entered === stored ? "yes" : null);

  it("lets the right code through, hands back the match and forgets the try", async () => {
    const { store, rows } = attempts();
    expect(await staffCodeGate(store, matcher("0420", "0420"))).toEqual({ kind: "ok", match: "yes" });
    expect(rows).toHaveLength(0);
  });

  it("counts wrong codes down, then locks", async () => {
    const { store } = attempts();
    expect(await staffCodeGate(store, matcher("1111", "0420"))).toEqual({ kind: "wrong-code", triesLeft: 4 });
    for (let i = 0; i < 3; i++) await staffCodeGate(store, matcher("1111", "0420"));
    expect(await staffCodeGate(store, matcher("1111", "0420"))).toEqual({ kind: "locked" });
    expect(await staffCodeGate(store, matcher("0420", "0420"))).toEqual({ kind: "locked" });
  });

  it("does not call match when locked", async () => {
    const { store } = attempts();
    for (let i = 0; i < 5; i++) await staffCodeGate(store, () => null);
    let calls = 0;
    const result = await staffCodeGate(store, () => {
      calls++;
      return "yes";
    });
    expect(result).toEqual({ kind: "locked" });
    expect(calls).toBe(0);
  });

  it("doesn't take undefined as a match", async () => {
    const { store, rows } = attempts();
    expect(await staffCodeGate(store, () => undefined as unknown as string | null)).toEqual({ kind: "wrong-code", triesLeft: 4 });
    expect(rows).toHaveLength(1);
  });

  it("guesses sent all at once can't slip past the limit", async () => {
    const { store } = attempts();
    const guesses = Array.from({ length: 50 }, (_, i) => String(i).padStart(4, "0"));
    guesses.push("0420");
    const results = await Promise.all(guesses.map((g) => staffCodeGate(store, matcher(g, "0420"))));
    expect(results.filter((r) => r.kind === "ok")).toHaveLength(0);
  });

  it("refuses everything when the brewery has no code", async () => {
    const { store } = attempts();
    expect(await staffCodeGate(store, matcher("0420", null))).toEqual({ kind: "wrong-code", triesLeft: 4 });
  });
});

describe("signedOutButtons", () => {
  it("a trail stop leads with the Beer Trail, then the free card", () => {
    expect(signedOutButtons({ trailStop: true, canJoinTrail: true })).toEqual({ primary: "join-trail", secondary: ["free-card"] });
  });
  it("other members lead with the free card, then the Beer Trail", () => {
    expect(signedOutButtons({ trailStop: false, canJoinTrail: true })).toEqual({ primary: "free-card", secondary: ["join-trail"] });
  });
  it("with no pass on sale, only the free card", () => {
    expect(signedOutButtons({ trailStop: true, canJoinTrail: false })).toEqual({ primary: "free-card", secondary: [] });
    expect(signedOutButtons({ trailStop: false, canJoinTrail: false })).toEqual({ primary: "free-card", secondary: [] });
  });
});
