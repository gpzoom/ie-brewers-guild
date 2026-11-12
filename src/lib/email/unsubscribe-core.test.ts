import { describe, expect, it } from "vitest";
import { signUnsubscribeToken } from "./unsubscribe-token";
import {
  checkUnsubscribeCore,
  oneClickUnsubscribeCore,
  setSubscriptionCore,
  type UnsubscribeStore,
} from "./unsubscribe-core";

const SECRET = "test-secret";

function fakeStore(initial: string[] = []) {
  const rows = new Set(initial);
  const calls: string[] = [];
  const store: UnsubscribeStore = {
    async isUnsubscribed(id) {
      calls.push(`read:${id}`);
      return rows.has(id);
    },
    async addUnsubscribe(id) {
      calls.push(`add:${id}`);
      rows.add(id);
    },
    async removeUnsubscribe(id) {
      calls.push(`remove:${id}`);
      rows.delete(id);
    },
  };
  return { store, rows, calls };
}

const form = (s: string) => ({ contentType: "application/x-www-form-urlencoded", text: async () => s });

describe("unsubscribe core", () => {
  it("unsubscribes with a valid token", async () => {
    const { store, rows } = fakeStore();
    const token = await signUnsubscribeToken("u1", SECRET);
    expect(await setSubscriptionCore({ token, subscribed: false, secret: SECRET, store })).toEqual({ ok: true });
    expect(rows.has("u1")).toBe(true);
  });

  it("resubscribes by deleting the row", async () => {
    const { store, rows } = fakeStore(["u1"]);
    const token = await signUnsubscribeToken("u1", SECRET);
    await setSubscriptionCore({ token, subscribed: true, secret: SECRET, store });
    expect(rows.has("u1")).toBe(false);
  });

  it("invalid token makes no store call", async () => {
    const { store, calls } = fakeStore();
    expect(await setSubscriptionCore({ token: "bad.token", subscribed: false, secret: SECRET, store })).toEqual({ ok: false });
    expect(await checkUnsubscribeCore({ token: "bad.token", secret: SECRET, store })).toEqual({ valid: false, unsubscribed: false });
    const other = await signUnsubscribeToken("u1", "other-secret");
    expect(await setSubscriptionCore({ token: other, subscribed: false, secret: SECRET, store })).toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  it("a check only reads, never writes", async () => {
    const { store, calls } = fakeStore(["u1"]);
    const token = await signUnsubscribeToken("u1", SECRET);
    expect(await checkUnsubscribeCore({ token, secret: SECRET, store })).toEqual({ valid: true, unsubscribed: true });
    expect(calls).toEqual(["read:u1"]);
  });

  it("one-click POST with the right body writes and returns 200", async () => {
    const { store, rows } = fakeStore();
    const token = await signUnsubscribeToken("u1", SECRET);
    const res = await oneClickUnsubscribeCore({ token, body: form("List-Unsubscribe=One-Click"), secret: SECRET, store });
    expect(res.status).toBe(200);
    expect(rows.has("u1")).toBe(true);
  });

  it("one-click accepts multipart", async () => {
    const { store, rows } = fakeStore();
    const token = await signUnsubscribeToken("u1", SECRET);
    const body = {
      contentType: "multipart/form-data; boundary=x",
      text: async () => '--x\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--x--\r\n',
    };
    const res = await oneClickUnsubscribeCore({ token, body, secret: SECRET, store });
    expect(res.status).toBe(200);
    expect(rows.has("u1")).toBe(true);
  });

  it("one-click with any other body returns 400 and writes nothing", async () => {
    const { store, calls } = fakeStore();
    const token = await signUnsubscribeToken("u1", SECRET);
    for (const b of ["", "foo=bar", "List-Unsubscribe=Nope"]) {
      expect((await oneClickUnsubscribeCore({ token, body: form(b), secret: SECRET, store })).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("one-click with a bad token returns 400 and writes nothing", async () => {
    const { store, calls } = fakeStore();
    const res = await oneClickUnsubscribeCore({ token: "nope", body: form("List-Unsubscribe=One-Click"), secret: SECRET, store });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
