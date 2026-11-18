import { describe, expect, it } from "vitest";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import {
  SIGNIN_CODE_MAX_TRIES,
  generateSignInCode,
  normalizeSignInCode,
  signInCodeHash,
  verifySignInCode,
  type SignInCodeStore,
} from "@/lib/tap-card/signin-code";

describe("generateSignInCode", () => {
  it("is always 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(generateSignInCode()).toMatch(/^[0-9]{6}$/);
  });
});

describe("normalizeSignInCode", () => {
  it("takes 6 digits, ignoring spaces and dashes", () => {
    expect(normalizeSignInCode(" 123 456 ")).toBe("123456");
    expect(normalizeSignInCode("123-456")).toBe("123456");
    for (const bad of ["12345", "1234567", "12a456", "", null]) expect(normalizeSignInCode(bad)).toBeNull();
  });
});

describe("signInCodeHash", () => {
  it("ties the code to its sign-in row", async () => {
    expect(await signInCodeHash("row1", "123456")).toBe(await hashUploadToken("row1:123456"));
    expect(await signInCodeHash("row2", "123456")).not.toBe(await signInCodeHash("row1", "123456"));
  });
});

function memoryStore(row: { id: string; codeHash: string; tries: number } | null) {
  const state = { row: row ? { ...row } : null, claimed: false, burned: false };
  const store: SignInCodeStore = {
    async latest() {
      return state.row && !state.claimed && !state.burned ? { ...state.row } : null;
    },
    async addTry(id, seen) {
      if (!state.row || state.row.id !== id || state.row.tries !== seen) return false;
      state.row.tries = seen + 1;
      return true;
    },
    async claim(id) {
      if (state.claimed || state.row?.id !== id) return false;
      state.claimed = true;
      return true;
    },
    async burn() {
      state.burned = true;
    },
  };
  return { store, state };
}

describe("verifySignInCode", () => {
  it("signs in with the right code, once", async () => {
    const { store, state } = memoryStore({ id: "r1", codeHash: await signInCodeHash("r1", "123456"), tries: 0 });
    expect(await verifySignInCode(store, "123456")).toEqual({ kind: "ok" });
    expect(state.claimed).toBe(true);
    expect(await verifySignInCode(store, "123456")).toEqual({ kind: "expired" });
  });

  it("counts wrong codes and says how many tries are left", async () => {
    const { store } = memoryStore({ id: "r1", codeHash: await signInCodeHash("r1", "123456"), tries: 0 });
    expect(await verifySignInCode(store, "000000")).toEqual({ kind: "wrong", triesLeft: SIGNIN_CODE_MAX_TRIES - 1 });
  });

  it(`stops the code for good after ${SIGNIN_CODE_MAX_TRIES} wrong tries`, async () => {
    const { store, state } = memoryStore({ id: "r1", codeHash: await signInCodeHash("r1", "123456"), tries: SIGNIN_CODE_MAX_TRIES - 1 });
    expect(await verifySignInCode(store, "000000")).toEqual({ kind: "too-many" });
    expect(state.burned).toBe(true);
    expect(await verifySignInCode(store, "123456")).toEqual({ kind: "expired" });
  });

  it("doesn't check a code when another try got in first", async () => {
    const { store, state } = memoryStore({ id: "r1", codeHash: await signInCodeHash("r1", "123456"), tries: 0 });
    const stale: SignInCodeStore = { ...store, latest: async () => ({ id: "r1", codeHash: state.row!.codeHash, tries: 0 }) };
    state.row!.tries = 1;
    expect(await verifySignInCode(stale, "123456")).toEqual({ kind: "busy" });
    expect(state.claimed).toBe(false);
  });

  it("says expired when there's no code waiting", async () => {
    const { store } = memoryStore(null);
    expect(await verifySignInCode(store, "123456")).toEqual({ kind: "expired" });
  });
});
