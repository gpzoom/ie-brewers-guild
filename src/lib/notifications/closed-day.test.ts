import { describe, expect, it } from "vitest";
import type { GuestStop } from "@/lib/events/guest-links";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import { decideClosedDayProblems, type ClosedDayInputs, type ClosedMember } from "./closed-day";

// 10:00 AM Pacific, Fri Nov 13 2026.
const NOW = new Date("2026-11-13T18:00:00Z");
const TZ = "America/Los_Angeles";

const MARS: ClosedMember = {
  id: "mars",
  name: "Mars Brewing Co.",
  type: "producer",
  timezone: TZ,
  published: true,
};
const TIPZY: ClosedMember = {
  id: "tipzy",
  name: "Tipzy Entertainment",
  type: "mobile",
  timezone: TZ,
  published: true,
};
const ALLIED: ClosedMember = {
  id: "allied",
  name: "Hop Shop",
  type: "allied",
  timezone: TZ,
  published: true,
};

function stop(
  over: Partial<GuestStop> & { id: string; member_id: string; starts_at: string },
): GuestStop {
  return {
    title: "Event",
    venue_name: null,
    address: null,
    city: null,
    ends_at: null,
    all_day: false,
    overlay_status: null,
    overlay_starts_at: null,
    is_hidden: false,
    ...over,
  };
}

// 5:00 PM Pacific on Thu Nov 26.
const HAPPY_HOUR = stop({
  id: "hh",
  member_id: "mars",
  title: "Happy Hour",
  starts_at: "2026-11-27T01:00:00Z",
});
// Tipzy's stop at Mars, 6:00 PM Pacific on Nov 26.
const TIPZY_STOP = stop({
  id: "ts",
  member_id: "tipzy",
  title: "Tipzy at Mars",
  starts_at: "2026-11-27T02:00:00Z",
});

function inputs(over: Partial<ClosedDayInputs> = {}): ClosedDayInputs {
  return {
    closedDays: [{ member_id: "mars", date: "2026-11-26", note: "Thanksgiving" }],
    members: new Map([MARS, TIPZY, ALLIED].map((m) => [m.id, m])),
    events: [],
    links: [],
    openRows: [],
    ...over,
  };
}

function openRow(
  over: Partial<MemberNotificationRow> & { member_id: string; dedupe_key: string | null },
): MemberNotificationRow {
  return {
    id: `row-${over.dedupe_key ?? "x"}`,
    type: "closed_day_conflict",
    kind: "problem",
    details: {},
    event_id: null,
    due_date: "2026-11-26",
    recipient_roles: ["owner", "co_owner", "editor", "media_events"],
    email_mode: "batched",
    reminder_days: 3,
    status: "open",
    quiet: false,
    created_at: "2026-11-10T00:00:00Z",
    resolved_at: null,
    read_at: null,
    notice_sent_at: null,
    reminder_sent_at: null,
    claimed_at: null,
    attempts: 0,
    last_error: null,
    ...over,
  };
}

describe("decideClosedDayProblems", () => {
  it("opens one own row for Mars's Happy Hour on its closed day", () => {
    const d = decideClosedDayProblems(inputs({ events: [HAPPY_HOUR] }), NOW);
    expect(d.resolveRows).toEqual([]);
    expect(d.opens).toEqual([
      {
        type: "closed_day_conflict",
        member_id: "mars",
        dedupe_key: "closed_day_conflict:mars:hh:2026-11-26",
        event_id: "hh",
        due_date: "2026-11-26",
        details: {
          role: "own",
          event_id: "hh",
          other_member_id: null,
          closed_date: "2026-11-26",
          closed_note: "Thanksgiving",
        },
        kind: "problem",
        recipient_roles: ["owner", "co_owner", "editor", "media_events"],
        email_mode: "batched",
        reminder_days: 3,
      },
    ]);
  });

  it("opens host and guest rows for a linked stop", () => {
    const d = decideClosedDayProblems(
      inputs({ events: [TIPZY_STOP], links: [{ event_id: "ts", host_member_id: "mars" }] }),
      NOW,
    );
    expect(
      d.opens.map((o) => [o.member_id, o.details.role, o.details.other_member_id, o.dedupe_key]),
    ).toEqual([
      ["mars", "host", "tipzy", "closed_day_conflict:mars:ts:2026-11-26"],
      ["tipzy", "guest", "mars", "closed_day_conflict:tipzy:ts:2026-11-26"],
    ]);
    expect(d.opens.every((o) => o.event_id === "ts" && o.due_date === "2026-11-26")).toBe(true);
  });

  it("ignores an unlinked stop by another member", () => {
    const d = decideClosedDayProblems(inputs({ events: [TIPZY_STOP] }), NOW);
    expect(d.opens).toEqual([]);
  });

  it("uses the closed member's time zone at the day's edges", () => {
    const late = stop({ id: "late", member_id: "mars", starts_at: "2026-11-26T07:30:00Z" }); // 11:30 PM Nov 25 PT
    const early = stop({ id: "early", member_id: "mars", starts_at: "2026-11-27T08:30:00Z" }); // 12:30 AM Nov 27 PT
    const d = decideClosedDayProblems(inputs({ events: [late, early] }), NOW);
    expect(d.opens).toEqual([]);
  });

  it("counts an all-day event on its own date", () => {
    const allDay = stop({
      id: "ad",
      member_id: "mars",
      starts_at: "2026-11-26T08:00:00Z",
      all_day: true,
    });
    const d = decideClosedDayProblems(inputs({ events: [allDay] }), NOW);
    expect(d.opens.map((o) => o.dedupe_key)).toEqual(["closed_day_conflict:mars:ad:2026-11-26"]);
  });

  it("counts a rescheduled event at its new start", () => {
    const onto = stop({
      id: "onto",
      member_id: "mars",
      starts_at: "2026-11-21T01:00:00Z",
      overlay_status: "rescheduled",
      overlay_starts_at: "2026-11-27T01:00:00Z",
    });
    const d = decideClosedDayProblems(inputs({ events: [onto] }), NOW);
    expect(d.opens.map((o) => o.event_id)).toEqual(["onto"]);
  });

  it("resolves the open row of an event rescheduled off the closed day", () => {
    const off = stop({
      id: "off",
      member_id: "mars",
      starts_at: "2026-11-27T01:00:00Z",
      overlay_status: "rescheduled",
      overlay_starts_at: "2026-11-28T01:00:00Z",
    });
    const row = openRow({
      member_id: "mars",
      dedupe_key: "closed_day_conflict:mars:off:2026-11-26",
      event_id: "off",
    });
    const d = decideClosedDayProblems(inputs({ events: [off], openRows: [row] }), NOW);
    expect(d.opens).toEqual([]);
    expect(d.resolveRows).toEqual([row]);
  });

  it("ignores canceled, postponed and hidden events", () => {
    const events = [
      { ...HAPPY_HOUR, id: "c", overlay_status: "canceled" },
      { ...HAPPY_HOUR, id: "p", overlay_status: "postponed" },
      { ...HAPPY_HOUR, id: "h", is_hidden: true },
    ];
    const d = decideClosedDayProblems(inputs({ events }), NOW);
    expect(d.opens).toEqual([]);
  });

  it("looks 60 days ahead and no further", () => {
    const day60 = stop({ id: "d60", member_id: "mars", starts_at: "2027-01-12T17:00:00Z" }); // 9 AM PT Jan 12
    const day61 = stop({ id: "d61", member_id: "mars", starts_at: "2027-01-13T20:00:00Z" }); // noon PT Jan 13
    const d = decideClosedDayProblems(
      inputs({
        closedDays: [
          { member_id: "mars", date: "2027-01-12", note: null },
          { member_id: "mars", date: "2027-01-13", note: null },
        ],
        events: [day60, day61],
      }),
      NOW,
    );
    expect(d.opens.map((o) => o.event_id)).toEqual(["d60"]);
    expect(d.opens[0].details.closed_note).toBeNull();
  });

  it("ignores events that already ended, and past closed days", () => {
    // Closed today (Nov 13): a breakfast that ended at 9 AM, and a lunch still to come.
    const breakfast = stop({
      id: "bf",
      member_id: "mars",
      starts_at: "2026-11-13T15:00:00Z",
      ends_at: "2026-11-13T17:00:00Z",
    });
    const lunch = stop({ id: "lunch", member_id: "mars", starts_at: "2026-11-13T20:00:00Z" });
    const lastWeek = stop({ id: "lw", member_id: "mars", starts_at: "2026-11-06T20:00:00Z" });
    const d = decideClosedDayProblems(
      inputs({
        closedDays: [
          { member_id: "mars", date: "2026-11-13", note: null },
          { member_id: "mars", date: "2026-11-06", note: null },
        ],
        events: [breakfast, lunch, lastWeek],
      }),
      NOW,
    );
    expect(d.opens.map((o) => o.event_id)).toEqual(["lunch"]);
  });

  it("ignores a Mobile member's closed day", () => {
    const tipzyOwn = { ...TIPZY_STOP, id: "tipzy-own" };
    const d = decideClosedDayProblems(
      inputs({
        closedDays: [{ member_id: "tipzy", date: "2026-11-26", note: null }],
        events: [tipzyOwn],
      }),
      NOW,
    );
    expect(d.opens).toEqual([]);
  });

  it("ignores a draft producer's closed day", () => {
    const members = new Map([[MARS.id, { ...MARS, published: false }]]);
    const d = decideClosedDayProblems(inputs({ members, events: [HAPPY_HOUR] }), NOW);
    expect(d.opens).toEqual([]);
  });

  it("ignores a closed day for an unknown member", () => {
    const d = decideClosedDayProblems(inputs({ members: new Map(), events: [HAPPY_HOUR] }), NOW);
    expect(d.opens).toEqual([]);
  });

  it("gives an allied member an own conflict only", () => {
    const own = stop({ id: "a-own", member_id: "allied", starts_at: "2026-11-27T01:00:00Z" });
    const d = decideClosedDayProblems(
      inputs({
        closedDays: [{ member_id: "allied", date: "2026-11-26", note: null }],
        events: [own],
      }),
      NOW,
    );
    expect(d.opens.map((o) => [o.member_id, o.details.role])).toEqual([["allied", "own"]]);
  });

  it("treats an event that is both own and linked as own", () => {
    const d = decideClosedDayProblems(
      inputs({ events: [HAPPY_HOUR], links: [{ event_id: "hh", host_member_id: "mars" }] }),
      NOW,
    );
    expect(d.opens.map((o) => o.details.role)).toEqual(["own"]);
  });

  it("resolves both shared rows when the closed day is removed", () => {
    const host = openRow({
      member_id: "mars",
      dedupe_key: "closed_day_conflict:mars:ts:2026-11-26",
      event_id: "ts",
    });
    const guest = openRow({
      member_id: "tipzy",
      dedupe_key: "closed_day_conflict:tipzy:ts:2026-11-26",
      event_id: "ts",
    });
    const d = decideClosedDayProblems(
      inputs({
        closedDays: [],
        events: [TIPZY_STOP],
        links: [{ event_id: "ts", host_member_id: "mars" }],
        openRows: [host, guest],
      }),
      NOW,
    );
    expect(d.opens).toEqual([]);
    expect(d.resolveRows).toEqual([host, guest]);
  });

  it("resolves an open row whose event is gone (event_id null)", () => {
    const row = openRow({
      member_id: "mars",
      dedupe_key: "closed_day_conflict:mars:gone:2026-11-26",
      event_id: null,
    });
    const d = decideClosedDayProblems(inputs({ openRows: [row] }), NOW);
    expect(d.resolveRows).toEqual([row]);
  });

  it("opens the same problem again after it resolved", () => {
    const first = decideClosedDayProblems(inputs({ events: [HAPPY_HOUR] }), NOW);
    const gone = decideClosedDayProblems(
      inputs({
        closedDays: [],
        openRows: [
          openRow({ member_id: "mars", dedupe_key: first.opens[0].dedupe_key, event_id: "hh" }),
        ],
      }),
      NOW,
    );
    expect(gone.resolveRows).toHaveLength(1);
    const again = decideClosedDayProblems(inputs({ events: [HAPPY_HOUR] }), NOW);
    expect(again.opens).toEqual(first.opens);
  });

  it("neither re-opens nor resolves an existing open row", () => {
    const row = openRow({
      member_id: "mars",
      dedupe_key: "closed_day_conflict:mars:hh:2026-11-26",
      event_id: "hh",
    });
    const d = decideClosedDayProblems(inputs({ events: [HAPPY_HOUR], openRows: [row] }), NOW);
    expect(d.opens).toEqual([]);
    expect(d.resolveRows).toEqual([]);
  });
});
