import { describe, expect, it, vi } from "vitest";
import {
  sendSupportMessageCore,
  type SupportMessageRow,
  type SupportSender,
} from "./support-message-core";

const member: SupportSender = {
  userId: "u1",
  accountEmail: "owner@example.com",
  isGuildAdmin: false,
  isImpersonating: false,
  member: { id: "m1", name: "Rolling Taps", type: "mobile" },
};
const raw = {
  kind: "feature",
  firstName: "Sam",
  email: "sam@example.com",
  message: "Add video.",
  pagePath: "/portal/photos",
};
const now = new Date("2026-09-27T18:00:00Z");

function setup(recent = 0, sendFails = false) {
  const rows: SupportMessageRow[] = [];
  const store = {
    countSince: vi.fn(async () => recent),
    insert: vi.fn(async (row: SupportMessageRow) => {
      rows.push(row);
    }),
  };
  const sendEmail = vi.fn(async () => {
    if (sendFails) throw new Error("mailer is down");
  });
  return { rows, store, sendEmail };
}

describe("sendSupportMessageCore", () => {
  it("saves the message, then emails the inbox with the profile from the session", async () => {
    const { rows, store, sendEmail } = setup();
    const result = await sendSupportMessageCore({
      raw,
      sender: member,
      store,
      sendEmail,
      inbox: "me@example.com",
      userAgent: "UA",
      now,
    });
    expect(result).toEqual({ ok: true });
    expect(store.countSince).toHaveBeenCalledWith("u1", "2026-09-27T17:00:00.000Z");
    expect(rows).toEqual([
      {
        kind: "feature",
        first_name: "Sam",
        email: "sam@example.com",
        message: "Add video.",
        member_id: "m1",
        member_name: "Rolling Taps",
        submitted_by_user_id: "u1",
        sent_by_guild_admin: false,
        page_path: "/portal/photos",
        user_agent: "UA",
      },
    ]);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "support_message",
        to: "me@example.com",
        memberName: "Rolling Taps",
        memberType: "mobile",
        senderRole: "member",
      }),
    );
  });

  it("refuses a sixth message in an hour, and saves nothing", async () => {
    const { store, sendEmail } = setup(5);
    const result = await sendSupportMessageCore({
      raw,
      sender: member,
      store,
      sendEmail,
      inbox: "x@example.com",
      userAgent: null,
      now,
    });
    expect(result.ok).toBe(false);
    expect(store.insert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns the field errors for an incomplete form, and saves nothing", async () => {
    const { store, sendEmail } = setup();
    const result = await sendSupportMessageCore({
      raw: { ...raw, kind: null },
      sender: member,
      store,
      sendEmail,
      inbox: "x@example.com",
      userAgent: null,
      now,
    });
    expect(result).toEqual({
      ok: false,
      errors: { kind: "Choose Problem/bug or Feature request." },
    });
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("still says sent when the email fails, since the message is saved", async () => {
    const { rows, store, sendEmail } = setup(0, true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendSupportMessageCore({
      raw,
      sender: member,
      store,
      sendEmail,
      inbox: "x@example.com",
      userAgent: null,
      now,
    });
    spy.mockRestore();
    expect(result).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
  });

  it("marks a Guild admin, editing as a member or on the Guild screens", async () => {
    const asMember = setup();
    await sendSupportMessageCore({
      raw,
      sender: { ...member, isGuildAdmin: true, isImpersonating: true },
      store: asMember.store,
      sendEmail: asMember.sendEmail,
      inbox: "x@example.com",
      userAgent: null,
      now,
    });
    expect(asMember.rows[0].sent_by_guild_admin).toBe(true);
    expect(asMember.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "guild_admin_as_member" }),
    );

    const onGuild = setup();
    await sendSupportMessageCore({
      raw,
      sender: { ...member, isGuildAdmin: true, member: null },
      store: onGuild.store,
      sendEmail: onGuild.sendEmail,
      inbox: "x@example.com",
      userAgent: null,
      now,
    });
    expect(onGuild.rows[0].member_id).toBeNull();
    expect(onGuild.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "guild_admin", memberName: null }),
    );
  });
});
