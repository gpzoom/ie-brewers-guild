import { describe, expect, it } from "vitest";
import { generateUploadToken, hashUploadToken } from "./upload-tokens";

describe("generateUploadToken", () => {
  it("generates a URL-safe token with no padding characters", () => {
    const token = generateUploadToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(32);
  });

  it("generates a different token on every call", () => {
    expect(generateUploadToken()).not.toBe(generateUploadToken());
  });
});

describe("hashUploadToken", () => {
  it("is deterministic for the same input", async () => {
    expect(await hashUploadToken("abc123")).toBe(await hashUploadToken("abc123"));
  });

  it("produces different hashes for different tokens", async () => {
    expect(await hashUploadToken("token-a")).not.toBe(await hashUploadToken("token-b"));
  });

  it("never returns the raw token itself", async () => {
    expect(await hashUploadToken("my-raw-token")).not.toBe("my-raw-token");
  });
});
