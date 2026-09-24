import { describe, expect, it } from "vitest";
import { buildEmailContent, GUILD_NOTIFICATION_EMAIL, SITE_URL } from "./build-email-content";

describe("named constants", () => {
  it("GUILD_NOTIFICATION_EMAIL is the Guild's real, currently-used contact inbox", () => {
    expect(GUILD_NOTIFICATION_EMAIL).toBe("iscbrewersguild@gmail.com");
  });

  it("SITE_URL is the Guild's real domain", () => {
    expect(SITE_URL).toBe("https://iscbrewersguild.org");
  });
});

describe("buildEmailContent: creator_upload_pending", () => {
  it("mentions the creator by name when one is given", () => {
    const content = buildEmailContent({
      trigger: "creator_upload_pending",
      memberId: "m1",
      assetId: "a1",
      creatorName: "Alex Kim",
    });
    expect(content.text).toContain("Alex Kim");
    expect(content.html).toContain("Alex Kim");
  });

  it("omits any attribution when no creator name was given", () => {
    const content = buildEmailContent({
      trigger: "creator_upload_pending",
      memberId: "m1",
      assetId: "a1",
      creatorName: null,
    });
    expect(content.text).not.toContain("from null");
    expect(content.subject).toBe("Something's waiting for your review");
  });
});

describe("buildEmailContent: hours_stale", () => {
  it("includes the exact confirmUrl and needs no login", () => {
    const content = buildEmailContent({
      trigger: "hours_stale",
      memberId: "m1",
      confirmUrl: "https://iscbrewersguild.org/api/confirm-hours/abc123",
    });
    expect(content.text).toContain("https://iscbrewersguild.org/api/confirm-hours/abc123");
    expect(content.html).toContain("https://iscbrewersguild.org/api/confirm-hours/abc123");
    expect(content.text.toLowerCase()).toContain("no sign-in");
  });
});

describe("buildEmailContent: member_invited", () => {
  it("links to SITE_URL/signin, not a token URL", () => {
    const content = buildEmailContent({ trigger: "member_invited", memberId: "m1", email: "new@example.com" });
    expect(content.text).toContain(`${SITE_URL}/signin`);
    expect(content.html).toContain(`${SITE_URL}/signin`);
  });
});

describe("buildEmailContent: contact_confirmation", () => {
  it("contains the spec's exact required sentence", () => {
    const content = buildEmailContent({
      trigger: "contact_confirmation",
      inquiryId: "i1",
      name: "Jo",
      email: "jo@example.com",
      wantsMembershipInfo: false,
    });
    expect(content.text).toContain("Thank you for reaching out. We have received your submission.");
  });

  it("adds the membership follow-up line only when the checkbox was ticked", () => {
    const withMembership = buildEmailContent({
      trigger: "contact_confirmation",
      inquiryId: "i1",
      name: "Jo",
      email: "jo@example.com",
      wantsMembershipInfo: true,
    });
    const withoutMembership = buildEmailContent({
      trigger: "contact_confirmation",
      inquiryId: "i1",
      name: "Jo",
      email: "jo@example.com",
      wantsMembershipInfo: false,
    });
    expect(withMembership.text.toLowerCase()).toContain("membership");
    expect(withoutMembership.text.toLowerCase()).not.toContain("membership");
  });
});

describe("buildEmailContent: contact_form_submitted", () => {
  it("includes the full inquiry content", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: "555-0100",
      message: "Tell me more.",
      wantsMembershipInfo: false,
    });
    expect(content.text).toContain("Jo Rivera");
    expect(content.text).toContain("jo@example.com");
    expect(content.text).toContain("555-0100");
    expect(content.text).toContain("Tell me more.");
  });

  it("flags the subject and body when it is a membership lead", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: true,
    });
    expect(content.subject).toContain("Membership Lead");
    expect(content.text).toContain("MEMBERSHIP LEAD");
  });

  it("does not flag a plain general question", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: false,
    });
    expect(content.subject).not.toContain("Membership Lead");
    expect(content.text).not.toContain("MEMBERSHIP LEAD");
  });

  it("renders a placeholder for a missing phone or message rather than the literal word null", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: false,
    });
    expect(content.text).not.toContain("null");
  });

  it("HTML-escapes a submitter-controlled field", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo <script>alert(1)</script>",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: false,
    });
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
  });
});
