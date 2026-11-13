import { describe, expect, it } from "vitest";
import {
  canOpenPortalSection,
  firstPortalSection,
  portalSectionsFor,
} from "@/lib/portal/portal-sections";
import {
  notificationCount,
  shapeNotifications,
  summarizeNotifications,
  surfaceHref,
  type NotificationListRow,
} from "./portal-view";
import type { NoticeContext } from "./types";

const NOW = new Date("2026-11-13T18:00:00Z");

const ctx: NoticeContext = {
  memberName: "Sample Brewing",
  otherMemberName: null,
  eventTitle: "Trivia",
  timezone: "America/Los_Angeles",
};

function conflict(id: string, o: Partial<NotificationListRow> = {}): NotificationListRow {
  return {
    id,
    type: "closed_day_conflict",
    kind: "problem",
    status: "open",
    details: {
      role: "own",
      event_id: `ev-${id}`,
      other_member_id: null,
      closed_date: "2026-11-26",
      closed_note: "Thanksgiving",
    },
    created_at: "2026-11-10T12:00:00Z",
    resolved_at: null,
    read_at: null,
    ...o,
  };
}

function utc(id: string, o: Partial<NotificationListRow> = {}): NotificationListRow {
  return {
    id,
    type: "utc_calendar",
    kind: "problem",
    status: "open",
    details: { calendar_connection_id: "c1", purpose: "events", feed_time_zone: "UTC" },
    created_at: "2026-11-11T12:00:00Z",
    resolved_at: null,
    read_at: null,
    ...o,
  };
}

// No message type is registered yet; an unknown type still lists, with plain wording.
function message(id: string, o: Partial<NotificationListRow> = {}): NotificationListRow {
  return {
    id,
    type: "job_inquiry",
    kind: "message",
    status: "unread",
    details: {},
    created_at: "2026-11-12T12:00:00Z",
    resolved_at: null,
    read_at: null,
    ...o,
  };
}

describe("shapeNotifications", () => {
  it("groups Open problems, then Unread messages, then Resolved / Read, newest first", () => {
    const rows = [
      conflict("resolved", { status: "resolved", resolved_at: "2026-11-12T00:00:00Z" }),
      message("read", { status: "read", read_at: "2026-11-13T00:00:00Z" }),
      message("unread"),
      conflict("old-open", { created_at: "2026-11-01T00:00:00Z" }),
      utc("new-open", { created_at: "2026-11-12T00:00:00Z" }),
    ];
    const groups = shapeNotifications(rows, NOW, () => ctx);
    expect(groups.open.map((i) => i.id)).toEqual(["new-open", "old-open"]);
    expect(groups.unread.map((i) => i.id)).toEqual(["unread"]);
    expect(groups.history.map((i) => i.id)).toEqual(["read", "resolved"]);
  });

  it("takes each row's title, body and buttons from the registry", () => {
    const [item] = shapeNotifications([conflict("a")], NOW, () => ctx).open;
    expect(item.title).toBe("An event is on a closed day");
    expect(item.body).toContain('Your event "Trivia" is on Thu, Nov 26');
    expect(item.buttons.map((b) => b.label)).toEqual(["Edit in Events", "Check Special hours"]);
  });

  it("drops resolved and read items older than 30 days", () => {
    const rows = [
      conflict("31-days", { status: "resolved", resolved_at: "2026-10-13T17:00:00Z" }),
      conflict("29-days", { status: "resolved", resolved_at: "2026-10-15T18:00:00Z" }),
      message("read-long-ago", { status: "read", read_at: "2026-09-01T00:00:00Z" }),
    ];
    const groups = shapeNotifications(rows, NOW, () => ctx);
    expect(groups.history.map((i) => i.id)).toEqual(["29-days"]);
  });

  it("keeps an open problem however old it is", () => {
    const rows = [conflict("ancient", { created_at: "2026-01-01T00:00:00Z" })];
    expect(shapeNotifications(rows, NOW, () => ctx).open).toHaveLength(1);
  });

  it("lists an unknown type with plain wording instead of failing", () => {
    const [item] = shapeNotifications([message("m")], NOW, () => ctx).unread;
    expect(item.title).toBe("Notification");
    expect(item.buttons).toEqual([]);
  });
});

describe("summarizeNotifications", () => {
  it("counts open problems and unread messages", () => {
    const s = summarizeNotifications([
      conflict("a"),
      utc("b"),
      message("c"),
      message("d", { status: "read" }),
    ]);
    expect(s.openProblems).toBe(2);
    expect(s.unreadMessages).toBe(1);
    expect(notificationCount(s)).toBe(3);
  });

  it("names one conflict", () => {
    expect(summarizeNotifications([conflict("a")]).bannerText).toBe(
      "1 of your events is on a day you've marked closed.",
    );
  });

  it("names two conflicts", () => {
    expect(summarizeNotifications([conflict("a"), conflict("b")]).bannerText).toBe(
      "2 of your events are on a day you've marked closed.",
    );
  });

  it("names a UTC calendar", () => {
    expect(summarizeNotifications([utc("a")]).bannerText).toBe("Your calendar is set to UTC.");
  });

  it("names both when both are open", () => {
    expect(summarizeNotifications([conflict("a"), utc("b")]).bannerText).toBe(
      "1 of your events is on a day you've marked closed. Your calendar is set to UTC.",
    );
  });

  it("says a guest's stop is on the taproom's closed day, not theirs", () => {
    const guest = conflict("g", {
      details: {
        role: "guest",
        event_id: "e",
        other_member_id: "m2",
        closed_date: "2026-11-26",
        closed_note: null,
      },
    });
    expect(summarizeNotifications([guest]).bannerText).toBe(
      "1 of your events is on a day the taproom has marked closed.",
    );
  });

  it("shows no banner when only messages are unread", () => {
    const s = summarizeNotifications([message("a"), conflict("r", { status: "resolved" })]);
    expect(s.openProblems).toBe(0);
    expect(s.unreadMessages).toBe(1);
    expect(s.bannerText).toBeNull();
  });
});

describe("surfaceHref", () => {
  it("keeps portal links in the portal and sends them to /admin's screens there", () => {
    expect(surfaceHref("/portal/events", "portal")).toBe("/portal/events");
    expect(surfaceHref("/portal/events", "admin")).toBe("/admin/events");
    expect(surfaceHref("/portal/basics", "admin")).toBe("/admin/basics");
    expect(surfaceHref("/portal/logo-cover", "admin")).toBe("/admin/media");
    expect(surfaceHref("/portal/people", "admin")).toBe("/portal/people");
  });
});

describe("Notifications portal section", () => {
  it("opens for every role, a Photos & events editor included", () => {
    for (const role of ["owner", "co_owner", "editor", "media_events"] as const) {
      expect(canOpenPortalSection("notifications", { role, memberType: "producer" })).toBe(true);
    }
  });

  it("comes first in the menu but is never the landing page", () => {
    expect(portalSectionsFor({ role: "media_events", memberType: "allied" })[0]).toBe(
      "notifications",
    );
    expect(firstPortalSection("media_events")).toBe("logo-cover");
    expect(firstPortalSection("owner")).toBe("basics");
  });
});
