import { describe, expect, it, vi } from "vitest";
import { validateSignInHelp } from "./signin-help";
import { sendSignInHelpCore, type SignInHelpRow } from "./signin-help-core";
import { buildEmailContent } from "@/lib/email/build-email-content";

const good = {
  name: "  Sam Rivera ",
  businessName: " Sample Brewing Co. ",
  previousEmail: "sam@oldmail.example",
  newEmail: "sam@samplebrewing.example",
  note: "",
};

describe("validateSignInHelp", () => {
  it("trims and accepts a complete request with no note", () => {
    const result = validateSignInHelp(good);
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Sam Rivera",
        businessName: "Sample Brewing Co.",
        previousEmail: "sam@oldmail.example",
        newEmail: "sam@samplebrewing.example",
        note: "",
      },
    });
  });

  it("asks for every required field", () => {
    const result = validateSignInHelp({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["businessName", "name", "newEmail", "previousEmail"]);
  });

  it("refuses an address that isn't an email", () => {
    const result = validateSignInHelp({ ...good, previousEmail: "not an email" });
    expect(result.ok ? null : result.errors.previousEmail).toBe("Enter a valid email address.");
  });

  it("refuses a new email that's the same as the old one", () => {
    const result = validateSignInHelp({ ...good, newEmail: "SAM@oldmail.example" });
    expect(result.ok ? null : result.errors.newEmail).toMatch(/same as the email you used before/);
  });

  it("limits the name to what the table allows", () => {
    const result = validateSignInHelp({ ...good, name: "x".repeat(61) });
    expect(result.ok ? null : result.errors.name).toMatch(/under 60/);
  });
});

function setup(sendFails = false) {
  const rows: SignInHelpRow[] = [];
  const insert = vi.fn(async (row: SignInHelpRow) => {
    rows.push(row);
  });
  const sendEmail = vi.fn(async () => {
    if (sendFails) throw new Error("Resend down");
  });
  return { rows, insert, sendEmail };
}

describe("sendSignInHelpCore", () => {
  it("saves a Help messages row and emails the support inbox", async () => {
    const { rows, insert, sendEmail } = setup();
    const result = await sendSignInHelpCore({
      raw: { ...good, note: "We rebranded.", honeypot: "" },
      insert,
      sendEmail,
      inbox: "support@iscbrewersguild.org",
      userAgent: "Test browser",
    });
    expect(result).toEqual({ ok: true });
    expect(rows).toEqual([
      {
        kind: "signin",
        first_name: "Sam Rivera",
        email: "sam@samplebrewing.example",
        previous_email: "sam@oldmail.example",
        member_name: "Sample Brewing Co.",
        message: "We rebranded.",
        submitted_by_user_id: null,
        sent_by_guild_admin: false,
        page_path: "/signin/help",
        user_agent: "Test browser",
      },
    ]);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "signin_help", to: "support@iscbrewersguild.org", newEmail: "sam@samplebrewing.example" }),
    );
  });

  it("saves a placeholder when there's no note", async () => {
    const { rows, insert, sendEmail } = setup();
    await sendSignInHelpCore({ raw: good, insert, sendEmail, inbox: "support@x.example", userAgent: null });
    expect(rows[0].message).toBe("(No note)");
  });

  it("answers a bot that filled the honeypot like a person, without saving or sending", async () => {
    const { insert, sendEmail } = setup();
    const result = await sendSignInHelpCore({
      raw: { ...good, honeypot: "Acme" },
      insert,
      sendEmail,
      inbox: "support@x.example",
      userAgent: null,
    });
    expect(result).toEqual({ ok: true });
    expect(insert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns field errors and saves nothing when the form is incomplete", async () => {
    const { insert, sendEmail } = setup();
    const result = await sendSignInHelpCore({ raw: { name: "Sam" }, insert, sendEmail, inbox: "x@x.example", userAgent: null });
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("still says sent when only the email fails (the row is saved)", async () => {
    const { rows, insert, sendEmail } = setup(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendSignInHelpCore({ raw: good, insert, sendEmail, inbox: "x@x.example", userAgent: null });
    spy.mockRestore();
    expect(result).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
  });
});

describe("the sign-in help email", () => {
  it("names the business, lists both addresses and replies to the new one", () => {
    const content = buildEmailContent(
      {
        trigger: "signin_help",
        to: "support@iscbrewersguild.org",
        name: "Sam Rivera",
        businessName: "Sample Brewing Co.",
        previousEmail: "sam@oldmail.example",
        newEmail: "sam@samplebrewing.example",
        note: "",
        userAgent: null,
      },
      "https://iscbrewersguild.org",
    );
    expect(content.subject).toBe("Sign-in help: Sample Brewing Co.");
    expect(content.replyTo).toBe("sam@samplebrewing.example");
    expect(content.text).toContain("Used to sign in with: sam@oldmail.example");
    expect(content.text).toContain("New email: sam@samplebrewing.example");
    expect(content.text).not.toContain("Note:");
  });
});
