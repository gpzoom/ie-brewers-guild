import { describe, expect, it } from "vitest";
import {
  audienceLabel,
  buildRecipients,
  matchMembers,
  type AudienceMember,
  type AudienceUserRow,
} from "./broadcast-audience";

const m = (id: string, member_type: string, status: string, categoryIds: string[] = []): AudienceMember => ({
  id,
  business_name: `Biz ${id}`,
  member_type,
  status,
  categoryIds,
});

describe("matchMembers", () => {
  const members = [
    m("1", "producer", "published", ["c1"]),
    m("2", "producer", "draft", ["c2"]),
    m("3", "mobile", "published"),
    m("4", "allied", "applied", ["c1"]),
    m("5", "producer", "declined", ["c1"]),
    m("6", "allied", "suspended", ["c1"]),
    m("7", "allied", "published", ["c1"]),
  ];
  const ids = (xs: AudienceMember[]) => xs.map((x) => x.id);

  it("matches only published and draft members", () => {
    expect(ids(matchMembers(members, { type: "all" }))).toEqual(["1", "2", "3", "7"]);
    expect(
      ids(matchMembers(members, { type: "type_or_category", memberType: "producer", categoryId: null })),
    ).toEqual(["1", "2"]);
    expect(
      ids(matchMembers(members, { type: "type_or_category", memberType: null, categoryId: "c1" })),
    ).toEqual(["1", "7"]);
    expect(
      ids(matchMembers(members, { type: "type_or_category", memberType: "producer", categoryId: "c1" })),
    ).toEqual(["1"]);
    expect(
      ids(matchMembers(members, { type: "members", memberIds: ["1", "4", "5", "6", "7"] })),
    ).toEqual(["1", "7"]);
  });

  it("matches nothing when type and category are both null", () => {
    expect(matchMembers(members, { type: "type_or_category", memberType: null, categoryId: null })).toEqual([]);
  });
});

describe("buildRecipients", () => {
  const row = (member_id: string, user_id: string, role: string | null, created_at = "2026-01-01"): AudienceUserRow => ({
    member_id,
    user_id,
    role,
    created_at,
  });
  const emails = new Map<string, string | null>([
    ["u1", "a@x.com"],
    ["u2", "b@x.com"],
    ["u3", "A@X.com"],
    ["u4", null],
    ["u5", "e@x.com"],
  ]);

  it("dedupes a person who owns two members", () => {
    const r = buildRecipients(
      [m("1", "producer", "published"), m("2", "producer", "published"), m("3", "producer", "published")],
      [row("1", "u1", "owner"), row("2", "u1", "owner"), row("3", "u3", "owner")],
      emails,
      new Set(),
    );
    expect(r.recipients).toEqual([{ userId: "u1", email: "a@x.com" }]);
    expect(r.memberCount).toBe(3);
  });

  it("skips unclaimed members and missing emails", () => {
    const r = buildRecipients(
      [m("1", "producer", "published"), m("2", "producer", "published"), m("3", "producer", "published")],
      [row("2", "u4", "owner"), row("3", "u2", "owner")],
      emails,
      new Set(),
    );
    expect(r.recipients).toEqual([{ userId: "u2", email: "b@x.com" }]);
    expect(r.memberCount).toBe(3);
  });

  it("excludes editor and media_events rows", () => {
    const r = buildRecipients(
      [m("1", "producer", "published")],
      [
        row("1", "u1", "owner", "2026-01-01"),
        row("1", "u2", "editor", "2026-01-02"),
        row("1", "u5", "media_events", "2026-01-03"),
      ],
      emails,
      new Set(),
    );
    expect(r.recipients.map((x) => x.userId)).toEqual(["u1"]);
  });

  it("does not make an editor-only member a recipient", () => {
    const r = buildRecipients([m("1", "producer", "published")], [row("1", "u2", "editor")], emails, new Set());
    expect(r.recipients).toEqual([]);
  });

  it("includes owner and every co-owner", () => {
    const r = buildRecipients(
      [m("1", "producer", "published")],
      [
        row("1", "u1", "owner", "2026-01-01"),
        row("1", "u2", "co_owner", "2026-01-02"),
        row("1", "u5", "co_owner", "2026-01-03"),
      ],
      emails,
      new Set(),
    );
    expect(r.recipients.map((x) => x.userId)).toEqual(["u1", "u2", "u5"]);
  });

  it("drops unsubscribed users and counts them", () => {
    const r = buildRecipients(
      [m("1", "producer", "published"), m("2", "producer", "published")],
      [row("1", "u1", "owner"), row("2", "u2", "owner")],
      emails,
      new Set(["u2"]),
    );
    expect(r.recipients).toEqual([{ userId: "u1", email: "a@x.com" }]);
    expect(r.unsubscribedCount).toBe(1);
  });
});

describe("audienceLabel", () => {
  const cats = new Map([["c1", "Brewery"]]);
  const names = new Map<string, string>();
  it("labels each audience", () => {
    expect(audienceLabel({ type: "all" }, names, cats)).toBe("All members");
    expect(audienceLabel({ type: "type_or_category", memberType: "producer", categoryId: null }, names, cats)).toBe("Producers");
    expect(audienceLabel({ type: "type_or_category", memberType: "mobile", categoryId: null }, names, cats)).toBe("Mobile members");
    expect(audienceLabel({ type: "type_or_category", memberType: "allied", categoryId: null }, names, cats)).toBe("Affiliate Members");
    expect(audienceLabel({ type: "type_or_category", memberType: null, categoryId: "c1" }, names, cats)).toBe("Brewery");
    expect(audienceLabel({ type: "type_or_category", memberType: "producer", categoryId: "c1" }, names, cats)).toBe("Producers · Brewery");
    expect(audienceLabel({ type: "members", memberIds: ["a", "b", "c"] }, names, cats)).toBe("3 picked members");
  });
});
