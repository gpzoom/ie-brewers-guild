import { describe, expect, it } from "vitest";
import { APPLICATION_NOT_ACTIVE_MESSAGE, assertActiveMember, isApplicationStatus } from "./active-member";

describe("assertActiveMember", () => {
  it("throws the friendly message for an applicant (join-finish)", () => {
    expect(() => assertActiveMember({ destination: { kind: "join-finish" } })).toThrow(
      APPLICATION_NOT_ACTIVE_MESSAGE,
    );
  });

  it("throws for a declined applicant (inactive)", () => {
    expect(() => assertActiveMember({ destination: { kind: "inactive" } })).toThrow(APPLICATION_NOT_ACTIVE_MESSAGE);
  });

  it("lets a member in setup or in the portal through", () => {
    expect(() => assertActiveMember({ destination: { kind: "portal" } })).not.toThrow();
    expect(() => assertActiveMember({ destination: { kind: "wizard", step: "welcome" } })).not.toThrow();
    expect(() => assertActiveMember({ destination: { kind: "wizard", step: "basics" } })).not.toThrow();
  });
});

describe("isApplicationStatus (the /admin member check)", () => {
  it("is true for applied and declined", () => {
    expect(isApplicationStatus("applied")).toBe(true);
    expect(isApplicationStatus("declined")).toBe(true);
  });

  it("is false for draft, published and suspended", () => {
    expect(isApplicationStatus("draft")).toBe(false);
    expect(isApplicationStatus("published")).toBe(false);
    expect(isApplicationStatus("suspended")).toBe(false);
  });
});
