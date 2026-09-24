import { describe, expect, it } from "vitest";
import { isHoneypotTripped, validateContactFormInput, type ContactFormInput } from "./contact-form-validation";

function makeInput(overrides: Partial<ContactFormInput> = {}): ContactFormInput {
  return {
    name: "Jo Rivera",
    email: "jo@example.com",
    phone: "",
    message: "Interested in learning more.",
    wantsMembershipInfo: false,
    honeypot: "",
    ...overrides,
  };
}

describe("validateContactFormInput", () => {
  it("accepts a fully valid submission with an empty phone", () => {
    const result = validateContactFormInput(makeInput());
    expect(result).toEqual({
      valid: true,
      value: {
        name: "Jo Rivera",
        email: "jo@example.com",
        phone: null,
        message: "Interested in learning more.",
        wantsMembershipInfo: false,
      },
    });
  });

  it("trims whitespace from every field", () => {
    const result = validateContactFormInput(
      makeInput({ name: "  Jo Rivera  ", email: "  jo@example.com  ", phone: "  555-0100  ", message: "  hi  " }),
    );
    expect(result).toEqual({
      valid: true,
      value: { name: "Jo Rivera", email: "jo@example.com", phone: "555-0100", message: "hi", wantsMembershipInfo: false },
    });
  });

  it("requires a name", () => {
    const result = validateContactFormInput(makeInput({ name: "" }));
    expect(result).toEqual({ valid: false, errors: { name: "Enter your name." } });
  });

  it("requires an email", () => {
    const result = validateContactFormInput(makeInput({ email: "" }));
    expect(result).toEqual({ valid: false, errors: { email: "Enter your email address." } });
  });

  it("rejects a malformed email", () => {
    const result = validateContactFormInput(makeInput({ email: "not-an-email" }));
    expect(result).toEqual({ valid: false, errors: { email: "Enter a valid email address." } });
  });

  it("requires a message", () => {
    const result = validateContactFormInput(makeInput({ message: "" }));
    expect(result).toEqual({ valid: false, errors: { message: "Enter a message." } });
  });

  it("caps name at 200 characters", () => {
    const result = validateContactFormInput(makeInput({ name: "a".repeat(201) }));
    expect(result).toEqual({ valid: false, errors: { name: "Name must be 200 characters or fewer." } });
  });

  it("caps email at 320 characters", () => {
    const longEmail = `${"a".repeat(311)}@example.com`; // 311 + 13 = 324 chars
    const result = validateContactFormInput(makeInput({ email: longEmail }));
    expect(result).toEqual({ valid: false, errors: { email: "Email must be 320 characters or fewer." } });
  });

  it("caps phone at 32 characters", () => {
    const result = validateContactFormInput(makeInput({ phone: "5".repeat(33) }));
    expect(result).toEqual({ valid: false, errors: { phone: "Phone must be 32 characters or fewer." } });
  });

  it("caps message at 5000 characters", () => {
    const result = validateContactFormInput(makeInput({ message: "a".repeat(5001) }));
    expect(result).toEqual({ valid: false, errors: { message: "Message must be 5000 characters or fewer." } });
  });

  it("collects more than one field error at once", () => {
    const result = validateContactFormInput(makeInput({ name: "", email: "" }));
    expect(result).toEqual({
      valid: false,
      errors: { name: "Enter your name.", email: "Enter your email address." },
    });
  });

  it("passes wantsMembershipInfo through unchanged", () => {
    const result = validateContactFormInput(makeInput({ wantsMembershipInfo: true }));
    expect(result.valid && result.value.wantsMembershipInfo).toBe(true);
  });
});

describe("isHoneypotTripped", () => {
  it("is false for an empty honeypot", () => {
    expect(isHoneypotTripped("")).toBe(false);
  });

  it("is false for a whitespace-only honeypot", () => {
    expect(isHoneypotTripped("   ")).toBe(false);
  });

  it("is true once anything is typed into it", () => {
    expect(isHoneypotTripped("Acme Corp")).toBe(true);
  });
});
