import { describe, expect, it } from "vitest";
import { supportAreaForPath, validateSupportMessage } from "./support-message";

describe("validateSupportMessage", () => {
  const good = {
    kind: "bug",
    firstName: " Sam ",
    email: " sam@example.com ",
    message: " It broke. ",
    pagePath: "/portal/basics",
  };

  it("trims and accepts a complete form", () => {
    expect(validateSupportMessage(good)).toEqual({
      ok: true,
      value: {
        kind: "bug",
        firstName: "Sam",
        email: "sam@example.com",
        message: "It broke.",
        pagePath: "/portal/basics",
      },
    });
  });

  it("names every missing field", () => {
    const result = validateSupportMessage({
      kind: "other",
      firstName: "",
      email: "nope",
      message: "  ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(["email", "firstName", "kind", "message"]);
  });

  it("refuses a message that's too long", () => {
    expect(validateSupportMessage({ ...good, message: "x".repeat(5001) }).ok).toBe(false);
  });

  it("keeps only a path on this site", () => {
    for (const pagePath of ["https://evil.example/x", "//evil.example", 42]) {
      const result = validateSupportMessage({ ...good, pagePath });
      expect(result.ok && result.value.pagePath).toBe("");
    }
  });
});

describe("supportAreaForPath", () => {
  it("shows on the portal, /admin and the Guild screens", () => {
    expect(supportAreaForPath("/portal")).toBe("portal");
    expect(supportAreaForPath("/portal/setup/basics")).toBe("portal");
    expect(supportAreaForPath("/admin/media")).toBe("admin");
    expect(supportAreaForPath("/guild/roster/")).toBe("guild");
  });

  it("stays off the public site, sign-in and the draft previews", () => {
    for (const path of [
      "/",
      "/members/x",
      "/signin",
      "/send/abc",
      "/portalx",
      "/portal/preview",
      "/admin/preview",
      "/portal/setup/preview",
    ]) {
      expect(supportAreaForPath(path)).toBeNull();
    }
  });
});
