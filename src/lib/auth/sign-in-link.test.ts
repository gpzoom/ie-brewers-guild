import { describe, expect, it } from "vitest";
import { confirmPageHref, normalizeEmailCode, signInRedirectUrl } from "./sign-in-link";

describe("signInRedirectUrl (where the email's link returns to; always has a query, so the template can add &token_hash=...)", () => {
  it("with a next path", () => {
    expect(signInRedirectUrl("https://iscbrewersguild.org", "/portal")).toBe("https://iscbrewersguild.org/auth/callback?next=%2Fportal");
  });
  it("without one", () => {
    expect(signInRedirectUrl("https://iscbrewersguild.org")).toBe("https://iscbrewersguild.org/auth/callback?from=email");
  });
});

describe("confirmPageHref (a link with a token goes to the Confirm sign-in page; nothing is used up by just opening it)", () => {
  it("carries the token, type and next", () => {
    const p = new URLSearchParams("next=%2Fportal&token_hash=abc123&type=magiclink");
    expect(confirmPageHref(p)).toBe("/auth/confirm?token_hash=abc123&type=magiclink&next=%2Fportal");
  });
  it("an unknown type becomes email; no next stays off", () => {
    expect(confirmPageHref(new URLSearchParams("token_hash=abc&type=weird"))).toBe("/auth/confirm?token_hash=abc&type=email");
  });
  it("no token -> null (the old code flow handles it)", () => {
    expect(confirmPageHref(new URLSearchParams("code=xyz"))).toBeNull();
  });
});

describe("normalizeEmailCode", () => {
  it.each([
    ["123456", "123456"],
    [" 123 456 ", "123456"],
    ["123-456", "123456"],
    ["12345678", "12345678"],
  ])("%j -> %s", (input, out) => {
    expect(normalizeEmailCode(input)).toBe(out);
  });
  it.each(["", "12345", "abcdef", "12345678901"])("%j is not a code", (input) => {
    expect(normalizeEmailCode(input)).toBeNull();
  });
});
