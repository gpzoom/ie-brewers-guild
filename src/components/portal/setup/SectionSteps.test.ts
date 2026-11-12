import { describe, expect, it } from "vitest";
import { canConnectCalendar } from "@/components/portal/setup/SectionSteps";

describe("canConnectCalendar", () => {
  it("lets the owner and a co-owner connect a calendar", () => {
    expect(canConnectCalendar({ role: "owner", isImpersonating: false })).toBe(true);
    expect(canConnectCalendar({ role: "co_owner", isImpersonating: false })).toBe(true);
  });
  it("lets a Guild admin editing as the member connect one", () => {
    expect(canConnectCalendar({ role: "editor", isImpersonating: true })).toBe(true);
  });
  it("keeps everyone else out", () => {
    expect(canConnectCalendar({ role: "editor", isImpersonating: false })).toBe(false);
    expect(canConnectCalendar({ role: "media_events", isImpersonating: false })).toBe(false);
  });
});
