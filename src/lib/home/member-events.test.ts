import { describe, expect, it } from "vitest";
import {
  calendarPageDate,
  nextGuildEvent,
  selectCarouselEvents,
  type GuildEvent,
  type HomeEventInputRow,
  type HomeEventMember,
} from "./member-events";

const now = new Date("2026-10-03T19:00:00Z"); // Sat Oct 3, noon Pacific
const hours = (h: number) => new Date(now.getTime() + h * 3600 * 1000).toISOString();
const days = (d: number) => hours(d * 24);

function member(id: string): HomeEventMember {
  return {
    id,
    slug: id,
    businessName: id.toUpperCase(),
    themeHex: "#B45309",
    timezone: "America/Los_Angeles",
    logoUrl: null,
    logoTileHex: "#FFFFFF",
    coverAssetId: null,
  };
}
const members = new Map(["a", "b", "c"].map((id) => [id, member(id)]));

let n = 0;
function row(memberId: string, startsAt: string, extra: Partial<HomeEventInputRow> = {}): HomeEventInputRow {
  n += 1;
  return {
    id: `e${String(n).padStart(3, "0")}`,
    member_id: memberId,
    kind: "event",
    title: `Event ${n}`,
    description: null,
    starts_at: startsAt,
    ends_at: null,
    all_day: false,
    venue_name: null,
    city: "Riverside",
    overlay_status: null,
    overlay_starts_at: null,
    is_hidden: false,
    ...extra,
  };
}

describe("selectCarouselEvents", () => {
  it("keeps the next 14 days, including an event going on now", () => {
    const going = row("a", hours(-1), { ends_at: hours(2) });
    const soon = row("a", days(3));
    const last = row("a", days(13.9));
    const past = row("a", hours(-5), { ends_at: hours(-3) });
    const tooFar = row("a", days(14.1));
    const ids = selectCarouselEvents([going, soon, last, past, tooFar], members, now).map((c) => c.id);
    expect(ids).toEqual([going.id, soon.id, last.id]);
  });

  it("leaves out food, hidden, canceled and postponed events, and unpublished members", () => {
    const rows = [
      row("a", days(1), { kind: "food" }),
      row("a", days(1), { is_hidden: true }),
      row("a", days(1), { overlay_status: "canceled" }),
      row("a", days(1), { overlay_status: "postponed" }),
      row("zzz", days(1)),
    ];
    expect(selectCarouselEvents(rows, members, now)).toEqual([]);
  });

  it("uses a rescheduled event's new time", () => {
    const moved = row("a", days(20), {
      overlay_status: "rescheduled",
      overlay_starts_at: days(2),
      ends_at: days(20.1),
    });
    const [card] = selectCarouselEvents([moved], members, now);
    expect(card).toMatchObject({ rescheduled: true, startsAt: days(2), endsAt: null });
  });

  it("takes turns between members: everyone's first event before anyone's second", () => {
    const a1 = row("a", days(1));
    const a2 = row("a", days(2));
    const a3 = row("a", days(3));
    const b1 = row("b", days(5));
    const c1 = row("c", days(4));
    const c2 = row("c", days(6));
    const ids = selectCarouselEvents([a3, a2, a1, b1, c2, c1], members, now).map((c) => c.id);
    expect(ids).toEqual([a1.id, c1.id, b1.id, a2.id, c2.id, a3.id]);
  });

  it("stops at the cap", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(["a", "b", "c"][i % 3], days(1 + i * 0.1)));
    expect(selectCarouselEvents(rows, members, now)).toHaveLength(24);
    expect(selectCarouselEvents(rows, members, now, { max: 5 })).toHaveLength(5);
  });

  it("shows the venue only when there's a title, like the profile does", () => {
    const [titled] = selectCarouselEvents([row("a", days(1), { venue_name: "Patio" })], members, now);
    expect(titled.venue).toBe("Patio");
    const [untitled] = selectCarouselEvents(
      [row("b", days(1), { title: null, venue_name: "Main St Park" })],
      members,
      now,
    );
    expect(untitled).toMatchObject({ title: "Main St Park", venue: null });
  });
});

describe("calendarPageDate", () => {
  it("reads the date in the member's time zone", () => {
    // 2 am UTC on Oct 4 is still Saturday Oct 3 in California.
    expect(calendarPageDate("2026-10-04T02:00:00Z", "America/Los_Angeles")).toEqual({
      month: "OCTOBER",
      day: "3",
      weekday: "SATURDAY",
    });
  });
});

describe("nextGuildEvent", () => {
  const fest = (date: string): GuildEvent => ({
    slug: date,
    title: date,
    date,
    location: "Idyllwild",
    excerpt: "",
    image: "/x.png",
    ticketsUrl: null,
  });

  it("pins the soonest Guild event from today on, and none once they've passed", () => {
    expect(nextGuildEvent([fest("2027-05-29"), fest("2026-11-01")], now)?.date).toBe("2026-11-01");
    expect(nextGuildEvent([fest("2026-10-03")], now)?.date).toBe("2026-10-03");
    expect(nextGuildEvent([fest("2026-05-30")], now)).toBeNull();
  });
});

describe("Guild members at taprooms on the homepage", () => {
  const withTruck = new Map([...members, ["truck", member("truck")]]);
  const guest = { name: "Sample Taco Truck", tag: "FOOD TRUCK" };
  it("a linked stop is one card under the taproom, with the guest named", () => {
    const stop = row("truck", days(1), { title: null, venue_name: "A" });
    const cards = selectCarouselEvents([stop], withTruck, now, {}, new Map([[stop.id, { hostMemberId: "a", guest }]]));
    expect(cards).toHaveLength(1);
    expect(cards[0].member.id).toBe("a");
    expect(cards[0].guest).toEqual(guest);
    expect(cards[0].title).toBe("Sample Taco Truck");
    expect(cards[0].venue).toBeNull();
  });
  it("with its own title, the title stays", () => {
    const stop = row("truck", days(1), { title: "Taco Tuesday", venue_name: "A" });
    const cards = selectCarouselEvents([stop], withTruck, now, {}, new Map([[stop.id, { hostMemberId: "a", guest }]]));
    expect(cards[0].title).toBe("Taco Tuesday");
    expect(cards[0].venue).toBeNull();
  });
  it("no link (or hidden): the guest's own card, as today", () => {
    const stop = row("truck", days(1), { title: null, venue_name: "A" });
    const cards = selectCarouselEvents([stop], withTruck, now);
    expect(cards[0].member.id).toBe("truck");
    expect(cards[0].guest).toBeUndefined();
  });
  it("the host counts for the one-per-member rotation", () => {
    const stop = row("truck", days(1), { title: null });
    const own = row("a", hours(25));
    const other = row("b", days(2));
    const ids = selectCarouselEvents([stop, own, other], withTruck, now, {}, new Map([[stop.id, { hostMemberId: "a", guest }]])).map((c) => c.id);
    expect(ids).toEqual([stop.id, other.id, own.id]);
  });
});
