import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveRecipient } = vi.hoisted(() => ({ resolveRecipient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServiceRoleClient: async () => ({}) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    throw new Error("no request");
  },
}));
vi.mock("@/lib/email/resolve-recipient.server", () => ({ resolveRecipient }));
vi.mock("@/lib/email/build-email-content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/build-email-content")>()),
  buildEmailContent: () => ({ subject: "Subject", html: "<p>Hi</p>", text: "Hi" }),
}));
vi.mock("cloudflare:workers", () => ({ env: { RESEND_API_KEY: "test-key" } }));

const { sendTransactionalEmail } = await import("./send");

const payload = { trigger: "hours_stale", memberId: "m1", confirmUrl: "https://x/confirm" } as const;

const fetchMock = vi.fn();
const ok = () => new Response("{}", { status: 200 });
const bad = () => new Response("nope", { status: 422, statusText: "Unprocessable" });
const sentTo = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).to);

describe("sendTransactionalEmail, several recipients", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    fetchMock.mockReset();
    resolveRecipient.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends one separate email to each recipient", async () => {
    resolveRecipient.mockResolvedValue(["a@x.co", "b@x.co", "c@x.co"]);
    fetchMock.mockImplementation(async () => ok());
    const result = await sendTransactionalEmail(payload);
    expect(sentTo()).toEqual([["a@x.co"], ["b@x.co"], ["c@x.co"]]);
    expect(result).toEqual({ sent: ["a@x.co", "b@x.co", "c@x.co"], failed: [] });
  });

  it("skips the send when there is no one to email", async () => {
    resolveRecipient.mockResolvedValue([]);
    const result = await sendTransactionalEmail(payload);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: [], failed: [] });
  });

  it("tries every recipient and reports the ones that failed", async () => {
    resolveRecipient.mockResolvedValue(["a@x.co", "b@x.co", "c@x.co"]);
    fetchMock
      .mockImplementationOnce(async () => bad())
      .mockImplementationOnce(async () => {
        throw new Error("network down");
      })
      .mockImplementationOnce(async () => ok());
    const result = await sendTransactionalEmail(payload);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ sent: ["c@x.co"], failed: ["a@x.co", "b@x.co"] });
    expect(console.error).toHaveBeenCalled();
  });

  it("throws when every recipient fails", async () => {
    resolveRecipient.mockResolvedValue(["a@x.co", "b@x.co"]);
    fetchMock.mockImplementation(async () => bad());
    await expect(sendTransactionalEmail(payload)).rejects.toThrow(/2 of 2 recipients/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still throws when a single recipient fails", async () => {
    resolveRecipient.mockResolvedValue(["a@x.co"]);
    fetchMock.mockImplementation(async () => bad());
    await expect(sendTransactionalEmail(payload)).rejects.toThrow(/Resend request failed/);
  });
});
