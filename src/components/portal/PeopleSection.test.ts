import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PeopleView, PersonView } from "@/lib/portal/people";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/portal/portal-people.server", () => ({}));

const { PeopleSection } = await import("./PeopleSection");

const person = (overrides: Partial<PersonView>): PersonView => ({
  userId: "u",
  email: "someone@example.com",
  role: "editor",
  isYou: false,
  canRemove: false,
  canChangeAccess: false,
  canLeave: false,
  accessOptions: [],
  label: "",
  isBusinessManager: false,
  ...overrides,
});

const coInvite = {
  id: "c1",
  email: "pending-co@example.com",
  role: "co_owner" as const,
  expiresAt: "2099-01-01T00:00:00Z",
  expired: false,
};

function render(view: PeopleView) {
  return renderToStaticMarkup(
    createElement(PeopleSection, { ...view, memberName: "Sample Brewing" }),
  );
}

describe("PeopleSection (co-owners, spec 2026-11-12)", () => {
  it("the owner picks from Co-owner, Full editor, Photos & events and can change access", () => {
    const html = render({
      business: null,
      inviteRoles: ["co_owner", "editor", "media_events"],
      people: [
        person({ userId: "u-owner", role: "owner", isYou: true }),
        person({
          userId: "u-ed",
          canRemove: true,
          canChangeAccess: true,
          accessOptions: ["co_owner", "media_events"],
        }),
      ],
      invites: [{ ...coInvite, canManage: true }],
    });
    const order = ['value="co_owner"', 'value="editor"', 'value="media_events"'].map((v) =>
      html.indexOf(v),
    );
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("They get the Guild&#x27;s emails too.");
    expect(html).toContain("Change access");
    expect(html).toContain("Resend");
    expect(html).not.toContain("Leave this profile");
  });

  it("a co-owner sees no Co-owner option, can leave, and can't touch a co-owner invite", () => {
    const html = render({
      business: null,
      inviteRoles: ["editor", "media_events"],
      people: [
        person({ userId: "u-owner", role: "owner" }),
        person({ userId: "u-co", role: "co_owner", isYou: true, canLeave: true }),
      ],
      invites: [{ ...coInvite, canManage: false }],
    });
    expect(html).not.toContain('value="co_owner"');
    expect(html).toContain("Leave this profile");
    expect(html).toContain("pending-co@example.com");
    expect(html).not.toContain("Resend");
    expect(html).not.toContain("Cancel invite");
    expect(html).not.toContain("Change access");
  });
});
