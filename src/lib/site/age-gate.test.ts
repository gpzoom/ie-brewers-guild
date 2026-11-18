import { describe, expect, it } from "vitest";
import {
  AGE_COOKIE,
  AGE_COOKIE_MAX_AGE,
  ageCookieString,
  ageGateApplies,
  checkBirthDate,
  isCrawler,
} from "./age-gate";

const today = new Date(2026, 10, 17); // November 17, 2026

describe("checkBirthDate", () => {
  it("21 today counts; one day short doesn't", () => {
    expect(checkBirthDate({ month: "11", day: "17", year: "2005" }, today)).toBe("ok");
    expect(checkBirthDate({ month: "11", day: "18", year: "2005" }, today)).toBe("under");
    expect(checkBirthDate({ month: "1", day: "1", year: "1970" }, today)).toBe("ok");
    expect(checkBirthDate({ month: "6", day: "1", year: "2015" }, today)).toBe("under");
  });

  it("a date that doesn't exist, a future date or a missing field is invalid", () => {
    expect(checkBirthDate({ month: "2", day: "30", year: "1990" }, today)).toBe("invalid");
    expect(checkBirthDate({ month: "13", day: "1", year: "1990" }, today)).toBe("invalid");
    expect(checkBirthDate({ month: "1", day: "1", year: "2030" }, today)).toBe("invalid");
    expect(checkBirthDate({ month: "", day: "1", year: "1990" }, today)).toBe("invalid");
    expect(checkBirthDate({ month: "1", day: "1", year: "90" }, today)).toBe("invalid");
    expect(checkBirthDate({ month: "1", day: "1", year: "1890" }, today)).toBe("invalid");
  });

  it("a Feb 29 birthday turns 21 on March 1 in a non-leap year", () => {
    expect(checkBirthDate({ month: "2", day: "29", year: "2004" }, new Date(2025, 1, 28))).toBe("under");
    expect(checkBirthDate({ month: "2", day: "29", year: "2004" }, new Date(2025, 2, 1))).toBe("ok");
  });
});

describe("ageGateApplies", () => {
  const visitor = { confirmed: false, crawler: false };

  it("public pages ask a new visitor", () => {
    for (const path of ["/", "/members", "/members/hop-house", "/events", "/jobs", "/join", "/contact"]) {
      expect(ageGateApplies(path, visitor)).toBe(true);
    }
  });

  it("not once confirmed, and never for search engines", () => {
    expect(ageGateApplies("/", { confirmed: true, crawler: false })).toBe(false);
    expect(ageGateApplies("/", { confirmed: false, crawler: true })).toBe(false);
  });

  it("member, Guild, email-link and policy pages never ask", () => {
    for (const path of [
      "/signin",
      "/signin/help",
      "/portal",
      "/admin/basics",
      "/guild/roster",
      "/auth/callback",
      "/send/abc",
      "/visit/abc",
      "/unsubscribe/abc",
      "/api/confirm-hours/abc",
      "/join/finish",
      "/maintenance",
      "/terms",
      "/privacy",
    ]) {
      expect(ageGateApplies(path, visitor)).toBe(false);
    }
    expect(ageGateApplies("/signing", visitor)).toBe(true);
  });

  it("Tap Card: bar-device setup never asks; the card page asks customers", () => {
    expect(ageGateApplies("/scanner", visitor)).toBe(false);
    expect(ageGateApplies("/scanner/abc123", visitor)).toBe(false);
    expect(ageGateApplies("/p/ABCD2345", visitor)).toBe(true);
    expect(ageGateApplies("/p/ABCD2345", { confirmed: true, crawler: false })).toBe(false);
    expect(ageGateApplies("/t/ABCD2345", visitor)).toBe(true);
    expect(ageGateApplies("/t/ABCD2345", { confirmed: true, crawler: false })).toBe(false);
    expect(ageGateApplies("/card/login/abc", visitor)).toBe(false);
    expect(ageGateApplies("/card", visitor)).toBe(true);
  });
});

describe("isCrawler", () => {
  it("search engines and link previews skip the check; browsers don't", () => {
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isCrawler("facebookexternalhit/1.1")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});

describe("the cookie", () => {
  it("remembers for one year, site-wide, and only says yes", () => {
    expect(AGE_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
    expect(ageCookieString(true)).toBe(`${AGE_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure`);
    expect(ageCookieString(false)).toBe(`${AGE_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax`);
  });
});
