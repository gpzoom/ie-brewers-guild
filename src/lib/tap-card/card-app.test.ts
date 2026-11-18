import { describe, expect, it } from "vitest";
import { homeScreenKind, scannedTapCardPath, successLinks } from "@/lib/tap-card/card-app";

const TOKEN = "a".repeat(40) + "_-9";

describe("scannedTapCardPath", () => {
  it("opens a counter plate or a bartender QR code, on this site", () => {
    expect(scannedTapCardPath("https://iscbrewersguild.org/t/ABCD2345")).toBe("/t/ABCD2345");
    expect(scannedTapCardPath(`https://ie-brewers-guild-staging.boblelle77.workers.dev/s/${TOKEN}`)).toBe(`/s/${TOKEN}`);
    expect(scannedTapCardPath("/t/ABCD2345")).toBe("/t/ABCD2345");
  });
  it("ignores every other code", () => {
    for (const bad of ["https://example.com/", "https://iscbrewersguild.org/card", "https://iscbrewersguild.org/t/abc", "hello", "", `/s/${TOKEN}x`, "javascript:alert(1)"]) {
      expect(scannedTapCardPath(bad)).toBeNull();
    }
  });
});

describe("homeScreenKind", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const iphoneChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

  it("hides the button when the card is already on the Home Screen", () => {
    expect(homeScreenKind({ userAgent: iphone, standalone: true, canPrompt: false })).toBe("hidden");
  });
  it("uses the real install prompt when the browser offers one", () => {
    expect(homeScreenKind({ userAgent: android, standalone: false, canPrompt: true })).toBe("prompt");
  });
  it("shows iPhone steps on iPhone, Safari or Chrome", () => {
    expect(homeScreenKind({ userAgent: iphone, standalone: false, canPrompt: false })).toBe("iphone");
    expect(homeScreenKind({ userAgent: iphoneChrome, standalone: false, canPrompt: false })).toBe("iphone");
  });
  it("shows browser-menu steps everywhere else", () => {
    expect(homeScreenKind({ userAgent: android, standalone: false, canPrompt: false })).toBe("menu");
  });
});

describe("successLinks", () => {
  it("offers the card, the brewery's profile and the homepage -- never Sign out", () => {
    expect(successLinks({ memberName: "Sample Brewery", memberSlug: "sample-brewery" })).toEqual([
      { label: "Go to my account", href: "/card" },
      { label: "Go to Sample Brewery's profile", href: "/members/sample-brewery" },
      { label: "Go to the homepage", href: "/" },
    ]);
  });
  it("encodes the slug", () => {
    expect(successLinks({ memberName: "A", memberSlug: "a b" })[1].href).toBe("/members/a%20b");
  });
});
