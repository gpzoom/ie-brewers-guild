import { describe, expect, it } from "vitest";
import {
  calendarPageDate,
  memberLabel,
  multiLocationCities,
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
    const own = row("a", days(3));
    const other = row("b", days(2));
    const ids = selectCarouselEvents([stop, own, other], withTruck, now, {}, new Map([[stop.id, { hostMemberId: "a", guest }]])).map((c) => c.id);
    expect(ids).toEqual([stop.id, other.id, own.id]);
  });
});

describe("a night both the taproom and the guest list alternates in one spot", () => {
  const withTruck = new Map([...members, ["truck", member("truck")]]);
  const guest = { name: "Sample Taco Truck", tag: "FOOD TRUCK" };
  const link = (stopId: string) => new Map([[stopId, { hostMemberId: "a", guest }]]);

  it("is one spot: the taproom's card with the guest's own card as its alternate", () => {
    const stop = row("truck", days(1), { title: "Trivia Night", venue_name: "A" });
    const own = row("a", hours(24.5), { title: "Tuesday Trivia" });
    const cards = selectCarouselEvents([stop, own], withTruck, now, {}, link(stop.id));
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(own.id);
    expect(cards[0].member.id).toBe("a");
    expect(cards[0].alternate?.id).toBe(stop.id);
    expect(cards[0].alternate?.member.id).toBe("truck");
    expect(cards[0].alternate?.title).toBe("Trivia Night");
    expect(cards[0].alternate?.venue).toBe("A");
    expect(cards[0].alternate?.guest).toBeUndefined();
  });
  it("the taproom's own card names the guest too (owner, 2026-11-14)", () => {
    const stop = row("truck", days(1), { title: "Trivia Night", venue_name: "A" });
    const own = row("a", hours(24.5), { title: "Tuesday Trivia" });
    const cards = selectCarouselEvents([stop, own], withTruck, now, {}, link(stop.id));
    expect(cards[0].guest).toEqual(guest);
  });
  it("pairs at exactly 60 minutes apart, not at 61", () => {
    const stop = row("truck", days(1));
    const at60 = row("a", hours(25));
    expect(selectCarouselEvents([stop, at60], withTruck, now, {}, link(stop.id))).toHaveLength(1);
    const stop2 = row("truck", days(1));
    const at61 = row("a", new Date(Date.parse(days(1)) + 61 * 60_000).toISOString());
    const cards = selectCarouselEvents([stop2, at61], withTruck, now, {}, link(stop2.id));
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => !c.alternate)).toBe(true);
  });
  it("no pair without a shown link, or when the taproom's event is canceled, hidden or food", () => {
    const stop = row("truck", days(1));
    expect(selectCarouselEvents([stop, row("a", days(1))], withTruck, now).some((c) => c.alternate)).toBe(false);
    for (const extra of [{ overlay_status: "canceled" }, { is_hidden: true }, { kind: "food" }]) {
      const s = row("truck", days(1));
      const cards = selectCarouselEvents([s, row("a", days(1), extra)], withTruck, now, {}, link(s.id));
      expect(cards.map((c) => c.id)).toEqual([s.id]);
      expect(cards[0].guest).toEqual(guest);
    }
  });
  it("each event pairs at most once, with the closest start winning", () => {
    const early = row("truck", hours(24));
    const late = row("truck2", hours(24.5));
    const own = row("a", hours(24.4));
    const hosts = new Map([
      [early.id, { hostMemberId: "a", guest }],
      [late.id, { hostMemberId: "a", guest }],
    ]);
    const cards = selectCarouselEvents([early, late, own], new Map([...withTruck, ["truck2", member("truck2")]]), now, {}, hosts);
    expect(cards.find((c) => c.id === own.id)?.alternate?.id).toBe(late.id);
    expect(cards.find((c) => c.id === early.id)?.guest).toEqual(guest);
    expect(cards.find((c) => c.id === late.id)).toBeUndefined();
  });
  it("a rescheduled event pairs on its new time", () => {
    const stop = row("truck", days(1));
    const own = row("a", days(5), { overlay_status: "rescheduled", overlay_starts_at: hours(24.5) });
    expect(selectCarouselEvents([stop, own], withTruck, now, {}, link(stop.id))[0].alternate?.id).toBe(stop.id);
  });
  it("takes the host's turn, not the guest's", () => {
    const stop = row("truck", days(1));
    const own = row("a", hours(24.5));
    const truckOwn = row("truck", days(2), { venue_name: "Elsewhere" });
    const ids = selectCarouselEvents([stop, own, truckOwn], withTruck, now, {}, link(stop.id)).map((c) => c.id);
    expect(ids).toEqual([own.id, truckOwn.id]);
  });
});

describe("which location: a business with several taprooms names the city (owner, 2026-11-14)", () => {
  it("multiLocationCities: only members whose business has two or more published locations", () => {
    const cities = multiLocationCities([
      { id: "h1", business_id: "hangar", city: "Redlands" },
      { id: "h2", business_id: "hangar", city: "Riverside" },
      { id: "solo", business_id: "solo-biz", city: "Upland" },
      { id: "none", business_id: null, city: "Ontario" },
    ]);
    expect(cities.get("h1")).toBe("Redlands");
    expect(cities.get("h2")).toBe("Riverside");
    expect(cities.has("solo")).toBe(false);
    expect(cities.has("none")).toBe(false);
  });
  it("memberLabel: name and city for a multi-location member, the name alone otherwise", () => {
    expect(memberLabel({ ...member("a"), businessName: "Hangar 24", locationCity: "Redlands" })).toBe("Hangar 24 · Redlands");
    expect(memberLabel(member("a"))).toBe("A");
  });
});
