import { describe, expect, it, vi } from "vitest";
import { sendBroadcastEmails } from "./broadcast-send";

type Call = { url: string; init: RequestInit };

function recipient(email: string, oneClickUrl: string | null = null) {
  return { email, html: `<p>Hi ${email}</p>`, text: `Hi ${email}`, unsubscribeUrl: null, oneClickUrl };
}

function setup(responder: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return responder(call, calls.length);
  }) as unknown as typeof fetch;
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  return { calls, sleeps, fetchImpl, sleep };
}

const base = { apiKey: "re_key", from: "ISC Brewers Guild <hello@mail.iscbrewersguild.org>", replyTo: "admin@example.com", subject: "News" };
const ok = () => new Response("{}", { status: 200 });
const body = (c: Call) => JSON.parse(String(c.init.body));

describe("sendBroadcastEmails", () => {
  it("posts one request per recipient with the right body and auth", async () => {
    const s = setup(ok);
    const r = await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com"), recipient("b@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(r).toEqual({ sent: ["a@x.com", "b@x.com"], failed: [] });
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0].url).toBe("https://api.resend.com/emails");
    expect(s.calls[0].init.method).toBe("POST");
    expect((s.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(body(s.calls[0])).toEqual({
      from: base.from,
      to: ["a@x.com"],
      subject: "News",
      html: "<p>Hi a@x.com</p>",
      text: "Hi a@x.com",
      reply_to: "admin@example.com",
    });
  });

  it("includes attachments when present and one-click headers when set", async () => {
    const s = setup(ok);
    await sendBroadcastEmails({
      ...base,
      recipients: [recipient("a@x.com", "https://site/u/abc")],
      attachments: [{ filename: "f.pdf", path: "https://storage.example/signed/f.pdf?token=abc" }],
      fetchImpl: s.fetchImpl,
      sleep: s.sleep,
    });
    const b = body(s.calls[0]);
    expect(b.attachments).toEqual([{ filename: "f.pdf", path: "https://storage.example/signed/f.pdf?token=abc" }]);
    expect(b.attachments[0].content).toBeUndefined();
    expect(b.headers).toEqual({ "List-Unsubscribe": "<https://site/u/abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("each of two recipients' bodies parses to the full object with attachments, and response bodies are read", async () => {
    const responses: Response[] = [];
    const s = setup(() => {
      const res = ok();
      responses.push(res);
      return res;
    });
    const attachments = [
      { filename: "f.pdf", path: "https://storage.example/signed/f.pdf?t=1" },
      { filename: "g\"h.png", path: "https://storage.example/signed/g.png?t=2" },
    ];
    await sendBroadcastEmails({
      ...base,
      recipients: [recipient("a@x.com", "https://site/u/a"), recipient("b@x.com")],
      attachments,
      fetchImpl: s.fetchImpl,
      sleep: s.sleep,
    });
    expect(body(s.calls[0])).toEqual({
      from: base.from,
      to: ["a@x.com"],
      subject: "News",
      html: "<p>Hi a@x.com</p>",
      text: "Hi a@x.com",
      reply_to: "admin@example.com",
      headers: { "List-Unsubscribe": "<https://site/u/a>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      attachments,
    });
    expect(body(s.calls[1])).toEqual({
      from: base.from,
      to: ["b@x.com"],
      subject: "News",
      html: "<p>Hi b@x.com</p>",
      text: "Hi b@x.com",
      reply_to: "admin@example.com",
      attachments,
    });
    expect(responses.every((r) => r.bodyUsed)).toBe(true);
  });

  it("logs a refused address with the response text, never the API key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup(() => new Response(`{"message":"invalid ${"x".repeat(300)}"}`, { status: 422 }));
    await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    const logged = error.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("a@x.com");
    expect(logged).toContain("422");
    expect(logged).toContain('{"message":"invalid');
    expect(logged).not.toContain("x".repeat(250));
    expect(logged).not.toContain("re_key");
    error.mockRestore();
  });

  it("sleeps gapMs between requests only", async () => {
    const s = setup(ok);
    await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com"), recipient("b@x.com"), recipient("c@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(s.sleeps).toEqual([550, 550]);
  });

  it("honors a custom gapMs", async () => {
    const s = setup(ok);
    await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com"), recipient("b@x.com")], attachments: [], gapMs: 100, fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(s.sleeps).toEqual([100]);
  });

  it("records a 422 as failed and keeps sending", async () => {
    const s = setup((c) => (body(c).to[0] === "bad@x.com" ? new Response("{}", { status: 422 }) : ok()));
    const r = await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com"), recipient("bad@x.com"), recipient("c@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(r).toEqual({ sent: ["a@x.com", "c@x.com"], failed: ["bad@x.com"] });
  });

  it("retries a 429 once after 1000 ms", async () => {
    const s = setup((_c, n) => (n === 1 ? new Response("{}", { status: 429 }) : ok()));
    const r = await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(r).toEqual({ sent: ["a@x.com"], failed: [] });
    expect(s.calls).toHaveLength(2);
    expect(s.sleeps).toEqual([1000]);
  });

  it("fails after a second 429", async () => {
    const s = setup(() => new Response("{}", { status: 429 }));
    const r = await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(r).toEqual({ sent: [], failed: ["a@x.com"] });
    expect(s.calls).toHaveLength(2);
  });

  it("records a network throw as failed and continues", async () => {
    const s = setup((_c, n) => {
      if (n === 1) throw new Error("network down");
      return ok();
    });
    const r = await sendBroadcastEmails({ ...base, recipients: [recipient("a@x.com"), recipient("b@x.com")], attachments: [], fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(r).toEqual({ sent: ["b@x.com"], failed: ["a@x.com"] });
  });

  it("sends the Idempotency-Key header only when the recipient has one", async () => {
    const s = setup(ok);
    await sendBroadcastEmails({
      ...base,
      recipients: [{ ...recipient("a@x.com"), idempotencyKey: "bc-1-0" }, recipient("b@x.com")],
      attachments: [],
      fetchImpl: s.fetchImpl,
      sleep: s.sleep,
    });
    expect((s.calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("bc-1-0");
    expect((s.calls[1].init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  it("counts a 409 on an idempotency key as sent (Resend already has that email), but not without a key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup(() => new Response('{"name":"invalid_idempotent_request"}', { status: 409 }));
    const r = await sendBroadcastEmails({
      ...base,
      recipients: [{ ...recipient("a@x.com"), idempotencyKey: "bc-1-0" }, recipient("b@x.com")],
      attachments: [],
      fetchImpl: s.fetchImpl,
      sleep: s.sleep,
    });
    expect(r).toEqual({ sent: ["a@x.com"], failed: ["b@x.com"] });
    error.mockRestore();
  });
});
