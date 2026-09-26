import { describe, expect, it } from "vitest";
import {
  buildEmailContent,
  GUILD_NOTIFICATION_EMAIL,
  ORG_NAME,
  ORG_SHORT_NAME,
  resolveEmailSiteUrl,
  SITE_URL,
} from "./build-email-content";

describe("named constants", () => {
  it("GUILD_NOTIFICATION_EMAIL is the Guild's real, currently-used contact inbox", () => {
    expect(GUILD_NOTIFICATION_EMAIL).toBe("iscbrewersguild@gmail.com");
  });

  it("SITE_URL is the Guild's real domain", () => {
    expect(SITE_URL).toBe("https://iscbrewersguild.org");
  });
});

describe("resolveEmailSiteUrl", () => {
  it("falls back to SITE_URL when there is no request (e.g. a cron run)", () => {
    expect(resolveEmailSiteUrl(null)).toBe(SITE_URL);
  });

  it("uses the staging origin for a request to the staging site", () => {
    expect(resolveEmailSiteUrl("https://ie-brewers-guild-staging.boblelle77.workers.dev/_serverFn/abc?x=1")).toBe(
      "https://ie-brewers-guild-staging.boblelle77.workers.dev",
    );
  });

  it("uses the production domain for a request to production", () => {
    expect(resolveEmailSiteUrl("https://www.iscbrewersguild.org/guild")).toBe("https://www.iscbrewersguild.org");
    expect(resolveEmailSiteUrl("https://iscbrewersguild.org/guild")).toBe("https://iscbrewersguild.org");
  });

  it("allows local development", () => {
    expect(resolveEmailSiteUrl("http://localhost:3000/guild")).toBe("http://localhost:3000");
  });

  it("never links to a host that isn't the Guild's own", () => {
    expect(resolveEmailSiteUrl("https://evil.example.com/guild")).toBe(SITE_URL);
    expect(resolveEmailSiteUrl("https://iscbrewersguild.org.evil.com/")).toBe(SITE_URL);
    expect(resolveEmailSiteUrl("https://someone-else.workers.dev/")).toBe(SITE_URL);
    expect(resolveEmailSiteUrl("http://iscbrewersguild.org/")).toBe(SITE_URL);
    expect(resolveEmailSiteUrl("not a url")).toBe(SITE_URL);
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
  it("links to the Member Portal sign-in (SITE_URL/signin?next=/portal), not a token URL", () => {
    const content = buildEmailContent({ trigger: "member_invited", memberId: "m1", email: "new@example.com" });
    expect(content.text).toContain(`${SITE_URL}/signin?next=/portal`);
    expect(content.html).toContain(`${SITE_URL}/signin?next=/portal`);
  });

  it("links to the given site URL when one is passed (e.g. staging)", () => {
    const staging = "https://ie-brewers-guild-staging.boblelle77.workers.dev";
    const content = buildEmailContent({ trigger: "member_invited", memberId: "m1", email: "new@example.com" }, staging);
    expect(content.text).toContain(`${staging}/signin?next=/portal`);
    expect(content.html).toContain(`${staging}/signin?next=/portal`);
    expect(content.text).not.toContain(SITE_URL);
  });

  it("uses the Guild's current name, never the outdated IE Brewers Guild", () => {
    const content = buildEmailContent({ trigger: "member_invited", memberId: "m1", email: "new@example.com" });
    expect(content.text).toContain(ORG_NAME);
    expect(content.subject).toContain(ORG_SHORT_NAME);
    for (const part of [content.subject, content.text, content.html]) {
      expect(part).not.toContain("IE Brewers Guild");
    }
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

  it("adds the membership follow-up line only when the checkbox was checked", () => {
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

describe("buildEmailContent: member_type_changed_in_setup", () => {
  const payload = {
    trigger: "member_type_changed_in_setup" as const,
    memberId: "m1",
    memberName: "Hop House",
    oldType: "producer" as const,
    newType: "mobile" as const,
  };

  it("says who changed their type, from what to what, during setup", () => {
    const content = buildEmailContent(payload);
    expect(content.text).toContain("Hop House changed their type from Producer to Mobile member during setup.");
    expect(content.subject).toContain("Hop House");
  });

  it("links to the roster on the site that sent it", () => {
    const content = buildEmailContent(payload, "https://staging.example");
    expect(content.text).toContain("https://staging.example/guild/roster");
    expect(content.html).toContain('href="https://staging.example/guild/roster"');
  });

  it("HTML-escapes the member name", () => {
    const content = buildEmailContent({ ...payload, memberName: "A <b>&</b> B" });
    expect(content.html).not.toContain("<b>");
    expect(content.html).toContain("A &lt;b&gt;&amp;&lt;/b&gt; B");
  });
});

describe("buildEmailContent: type_change_requested", () => {
  const payload = {
    trigger: "type_change_requested" as const,
    memberId: "m1",
    memberName: "Hop House",
    currentType: "producer" as const,
    requestedType: "allied" as const,
    note: "We sell grain now <3",
    requestedByEmail: "owner@hophouse.com",
  };

  it("names the member, both types, who asked and their note", () => {
    const content = buildEmailContent(payload);
    expect(content.text).toContain(
      "Hop House asked to change their member type from Producer to Allied Member.",
    );
    expect(content.text).toContain("Requested by: owner@hophouse.com");
    expect(content.text).toContain("Their note: We sell grain now <3");
    expect(content.subject).toBe("Hop House asked to change their member type");
  });

  it("links to the roster on the site that sent it and escapes the note", () => {
    const content = buildEmailContent(payload, "https://staging.example");
    expect(content.html).toContain('href="https://staging.example/guild/roster"');
    expect(content.html).toContain("We sell grain now &lt;3");
  });

  it("says when there's no note", () => {
    const content = buildEmailContent({ ...payload, note: null, requestedByEmail: null });
    expect(content.text).toContain("Their note: (no note)");
    expect(content.text).not.toContain("Requested by");
  });
});

describe("buildEmailContent: editor_invited", () => {
  const payload = {
    trigger: "editor_invited" as const,
    memberId: "m1",
    memberName: "Hop House",
    email: "sam@example.com",
    role: "media_events" as const,
    inviterEmail: "owner@hophouse.com",
  };

  it("says who invited them, to which member, and what they can edit", () => {
    const content = buildEmailContent(payload);
    expect(content.text).toContain("owner@hophouse.com invited you to help with Hop House's profile");
    expect(content.text).toContain("photos and video, and its events");
    expect(content.text).toContain("sam@example.com");
  });

  it("describes a full editor's access", () => {
    const content = buildEmailContent({ ...payload, role: "editor" });
    expect(content.text).toContain("edit everything on its profile");
  });

  it("links to the Member Portal sign-in on the site that sent it", () => {
    const content = buildEmailContent(payload, "https://staging.example");
    expect(content.text).toContain("https://staging.example/signin?next=/portal");
    expect(content.html).toContain('href="https://staging.example/signin?next=/portal"');
  });

  it("names the Guild when a Guild admin sent the invite", () => {
    const content = buildEmailContent({ ...payload, inviterEmail: null });
    expect(content.text).toContain("The Inland Southern California Brewers Guild invited you");
  });
});
