import { describe, expect, it } from "vitest";
import type { SpecialHoursDay, WeekdayHours } from "@/lib/hours/open-now";
import type { EventRow } from "@/lib/supabase/types";
import { buildFoodWeek, isClosedOnDate, showsFoodWeek } from "./food-week";

const TZ = "America/Los_Angeles";

function slot(partial: Partial<EventRow>): EventRow {
  return {
    id: "s",
    member_id: "m1",
    calendar_connection_id: "food-conn",
    source: "ics",
    kind: "food",
    external_event_id: "x",
    title: "Taco Truck",
    description: null,
    starts_at: "2026-10-01T01:00:00Z",
    ends_at: null,
    all_day: false,
    venue_name: null,
    city: null,
    address: null,
    overlay_status: null,
    overlay_starts_at: null,
    overlay_note: null,
    overlay_set_at: null,
    is_hidden: false,
    ...partial,
  };
}

// Open Wednesday to Sunday, noon to 9; closed Monday and Tuesday.
const HOURS: WeekdayHours[] = [3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  opensAt: "12:00",
  closesAt: "21:00",
  closesNextDay: false,
  isClosed: false,
}));

// Wednesday, Sept 30 2026, 10am in Los Angeles.
const NOW = new Date("2026-09-30T17:00:00Z");

describe("buildFoodWeek", () => {
  it("is seven local days, today first", () => {
    const week = buildFoodWeek({
      slots: [],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week.map((day) => day.date)).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
    ]);
  });

  it("puts a vendor on its local day, even when it's already the next day in UTC", () => {
    // 6pm Wednesday in Los Angeles is 1am Thursday UTC.
    const week = buildFoodWeek({
      slots: [slot({ starts_at: "2026-10-01T01:00:00Z" })],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[0]).toMatchObject({ date: "2026-09-30", status: "vendors" });
    expect(week[0].vendors[0].title).toBe("Taco Truck");
    expect(week[1].status).toBe("byo");
  });

  it("lists several vendors on a day by start time", () => {
    const week = buildFoodWeek({
      slots: [
        slot({ id: "b", title: "Pizza Oven", starts_at: "2026-10-02T02:00:00Z" }),
        slot({ id: "a", title: "Dumpling Cart", starts_at: "2026-10-01T20:00:00Z" }),
      ],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[1].vendors.map((v) => v.title)).toEqual(["Dumpling Cart", "Pizza Oven"]);
  });

  it("says Closed on a day the posted hours are closed, Bring your own food otherwise", () => {
    const week = buildFoodWeek({
      slots: [],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    // Mon Oct 5 and Tue Oct 6 are closed.
    expect(week.map((day) => day.status)).toEqual([
      "byo",
      "byo",
      "byo",
      "byo",
      "byo",
      "closed",
      "closed",
    ]);
  });

  it("a vendor on a closed day still shows", () => {
    const week = buildFoodWeek({
      slots: [slot({ starts_at: "2026-10-05T19:00:00Z" })],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[5].status).toBe("vendors");
  });

  it("with no hours posted, no day is Closed", () => {
    const week = buildFoodWeek({ slots: [], now: NOW, timezone: TZ, hours: [], specialHours: [] });
    expect(week.every((day) => day.status === "byo")).toBe(true);
  });

  it("skips hidden, canceled and non-food rows", () => {
    const week = buildFoodWeek({
      slots: [
        slot({ id: "h", is_hidden: true }),
        slot({ id: "c", overlay_status: "canceled" }),
        slot({ id: "e", kind: "event" }),
      ],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[0].status).toBe("byo");
  });

  it("falls back to the venue, then to 'Food vendor', for an entry with no title", () => {
    const week = buildFoodWeek({
      slots: [
        slot({
          id: "a",
          title: null,
          venue_name: "Hop House lot",
          starts_at: "2026-10-01T01:00:00Z",
        }),
        slot({ id: "b", title: null, starts_at: "2026-10-01T02:00:00Z" }),
      ],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[0].vendors.map((v) => v.title)).toEqual(["Hop House lot", "Food vendor"]);
  });
});

describe("isClosedOnDate", () => {
  const special = (date: string, patch: Partial<SpecialHoursDay>): SpecialHoursDay => ({
    date,
    isClosed: false,
    opensAt: "12:00",
    closesAt: "18:00",
    closesNextDay: false,
    note: null,
    ...patch,
  });

  it("a special closure beats an open weekday", () => {
    expect(isClosedOnDate("2026-10-01", HOURS, [special("2026-10-01", { isClosed: true })])).toBe(
      true,
    );
  });

  it("special opening hours beat a closed weekday", () => {
    expect(isClosedOnDate("2026-10-05", HOURS, [special("2026-10-05", {})])).toBe(false);
  });

  it("a weekday marked closed is closed", () => {
    const hours = HOURS.map((row) => (row.weekday === 3 ? { ...row, isClosed: true } : row));
    expect(isClosedOnDate("2026-09-30", hours, [])).toBe(true);
  });
});

describe("buildFoodWeek with our own kitchen", () => {
  // Wednesday Sept 30 has a truck; Monday Oct 5 is closed by the posted hours;
  // Thursday Oct 1 is open with nothing listed.
  const slots = [slot({ starts_at: "2026-09-30T19:00:00Z" })];

  it("an open day with nothing listed says the kitchen's open; closed and listed days are unchanged", () => {
    const week = buildFoodWeek({ slots, now: NOW, timezone: TZ, hours: HOURS, specialHours: [], hasKitchen: true });
    expect(week.find((d) => d.date === "2026-09-30")?.status).toBe("vendors");
    expect(week.find((d) => d.date === "2026-10-05")?.status).toBe("closed");
    expect(week.find((d) => d.date === "2026-10-01")?.status).toBe("kitchen");
  });

  it("without the switch the same day is still bring-your-own", () => {
    const week = buildFoodWeek({ slots, now: NOW, timezone: TZ, hours: HOURS, specialHours: [] });
    expect(week.find((d) => d.date === "2026-10-01")?.status).toBe("byo");
  });
});

describe("showsFoodWeek", () => {
  it("shows for a producer with a food calendar, or with their own kitchen", () => {
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: true, hasKitchen: false })).toBe(true);
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: false, hasKitchen: true })).toBe(true);
  });

  it("stays hidden with neither, so a taproom never gets a week of 'Bring your own food'", () => {
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: false, hasKitchen: false })).toBe(false);
  });

  it("is producers only", () => {
    expect(showsFoodWeek({ memberType: "allied", hasFoodCalendar: true, hasKitchen: true })).toBe(false);
  });
});


describe("Guild food vendors in the food week", () => {
  const guest = { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true };
  it("a guest food stop fills its day; closed days stay closed", () => {
    const week = buildFoodWeek({
      slots: [],
      // Thursday Oct 1, 6pm local (open); Monday Oct 5, 6pm local (closed).
      guestSlots: [
        { ...slot({ id: "g1", kind: "event", title: null, starts_at: "2026-10-02T01:00:00Z" }), guest },
        { ...slot({ id: "g2", kind: "event", title: null, starts_at: "2026-10-06T01:00:00Z" }), guest },
      ],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[1]).toMatchObject({ date: "2026-10-01", status: "vendors" });
    expect(week[1].vendors[0].title).toBe("Sample Taco Truck");
    expect(week[1].vendors[0].guest?.slug).toBe("taco");
    expect(week[5]).toMatchObject({ date: "2026-10-05", status: "closed", vendors: [] });
  });
  it("showsFoodWeek: a producer with a Guild food stop this week shows the week even with no calendar or kitchen", () => {
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: false, hasKitchen: false, hasGuestFood: true })).toBe(true);
    expect(showsFoodWeek({ memberType: "producer", hasFoodCalendar: false, hasKitchen: false, hasGuestFood: false })).toBe(false);
  });
});

describe("buildFoodWeek: no doubles with a Guild vendor", () => {
  it("the taproom's own entry for the same vendor that day gives way to the Guild entry (profile and Food page alike)", () => {
    const guest = { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true };
    const week = buildFoodWeek({
      slots: [slot({ id: "own", title: "Sample Taco Truck Co.", starts_at: "2026-10-02T01:30:00Z" })],
      guestSlots: [{ ...slot({ id: "g1", kind: "event", title: null, starts_at: "2026-10-02T01:00:00Z" }), guest }],
      now: NOW,
      timezone: TZ,
      hours: HOURS,
      specialHours: [],
    });
    expect(week[1].vendors.map((v) => v.id)).toEqual(["g1"]);
  });
});
