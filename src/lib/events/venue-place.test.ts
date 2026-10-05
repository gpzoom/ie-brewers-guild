import { describe, expect, it } from "vitest";
import type { PickedPlace } from "@/lib/geo/places-address";
import { cleanCoordinates, venueHandEditPatch, venuePickPatch } from "./venue-place";

const mars: PickedPlace = {
  businessName: "Mars Brewing Co.",
  formattedAddress: "9728 6th St, Rancho Cucamonga, CA 91730, USA",
  address: {
    street_address: "9728 6th St", city: "Rancho Cucamonga", state: "CA", postal_code: "91730",
    latitude: 34.1029, longitude: -117.5911,
  },
};

describe("venuePickPatch (a picked Google place fills the venue)", () => {
  it("a business: its name, the full address, city and exact position", () => {
    expect(venuePickPatch(mars, "mars")).toEqual({
      venueName: "Mars Brewing Co.",
      address: "9728 6th St, Rancho Cucamonga, CA 91730, USA",
      city: "Rancho Cucamonga",
      latitude: 34.1029,
      longitude: -117.5911,
      geocodedAddress: "9728 6th St, Rancho Cucamonga, CA 91730, USA",
    });
  });

  it("a plain address (not a business): the street is the venue name", () => {
    const p = venuePickPatch({ ...mars, businessName: null }, "9728 6th");
    expect(p.venueName).toBe("9728 6th St");
  });

  it("a place with no street position (a city): no coordinates, so the lookup or city rules apply", () => {
    const corona: PickedPlace = {
      businessName: null, formattedAddress: "Corona, CA, USA",
      address: { street_address: null, city: "Corona", state: "CA", postal_code: null, latitude: null, longitude: null },
    };
    expect(venuePickPatch(corona, "Corona")).toEqual({
      venueName: "Corona", address: "Corona, CA, USA", city: "Corona", latitude: null, longitude: null, geocodedAddress: null,
    });
  });
});

describe("venueHandEditPatch (typing over a venue)", () => {
  it("after a pick, clears the old address, city and position (no stale pin)", () => {
    expect(venueHandEditPatch("Joe's Lot", { hadPickedAddress: true })).toEqual({
      venueName: "Joe's Lot", address: null, city: null, latitude: null, longitude: null, geocodedAddress: null,
    });
  });
  it("with no picked address, changes only the name (keeps a city the stop already has)", () => {
    expect(venueHandEditPatch("Mars Brewing Co.", { hadPickedAddress: false })).toEqual({ venueName: "Mars Brewing Co." });
    expect(venueHandEditPatch("  ", { hadPickedAddress: false })).toEqual({ venueName: null });
  });
});

describe("cleanCoordinates (the server only stores a real position)", () => {
  it("keeps a valid pair, rounds to 6 places", () => {
    expect(cleanCoordinates(34.10291234, -117.5911)).toEqual({ latitude: 34.102912, longitude: -117.5911 });
  });
  it("drops anything out of range, non-numeric or half-missing", () => {
    expect(cleanCoordinates(91, 0)).toEqual({ latitude: null, longitude: null });
    expect(cleanCoordinates(Number.NaN, 1)).toEqual({ latitude: null, longitude: null });
    expect(cleanCoordinates(34, null)).toEqual({ latitude: null, longitude: null });
    expect(cleanCoordinates("34" as unknown as number, -117)).toEqual({ latitude: null, longitude: null });
  });
});

describe("positionColumns (what updateEvent writes for a position)", async () => {
  const { positionColumns } = await import("./venue-place");
  it("nothing about position in the save -> writes nothing", () => {
    expect(positionColumns({ venueName: "x" })).toEqual({});
  });
  it("a valid position with its address", () => {
    expect(positionColumns({ latitude: 34.1, longitude: -117.59, geocodedAddress: "9728 6th St" })).toEqual({
      latitude: 34.1, longitude: -117.59, geocoded_address: "9728 6th St",
    });
  });
  it("an invalid position, or one with no address, clears all three", () => {
    const cleared = { latitude: null, longitude: null, geocoded_address: null };
    expect(positionColumns({ latitude: 200, longitude: 0, geocodedAddress: "x" })).toEqual(cleared);
    expect(positionColumns({ latitude: 34, longitude: -117, geocodedAddress: "  " })).toEqual(cleared);
    expect(positionColumns({ latitude: null, longitude: null, geocodedAddress: null })).toEqual(cleared);
  });
});
