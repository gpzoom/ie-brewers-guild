import { describe, expect, it } from "vitest";
import { validateMemberTypeChoice } from "./member-type-choice";

describe("validateMemberTypeChoice", () => {
  it("accepts the three member types", () => {
    for (const type of ["producer", "mobile", "allied"] as const) {
      expect(validateMemberTypeChoice(type)).toBe(type);
    }
  });

  it("rejects a missing or unknown type with 'Choose a member type.'", () => {
    for (const bad of [undefined, null, "", "brewer", 3]) {
      expect(() => validateMemberTypeChoice(bad)).toThrow("Choose a member type.");
    }
  });
});
