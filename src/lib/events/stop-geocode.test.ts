import { describe, expect, it, vi } from "vitest";
import type { StopEvent } from "@/lib/members/mobile-stops";
import { geocodeStops } from "./stop-geocode";

const NOW = new Date("2026-10-05T22:00:00Z");
function stop(id: string, overrides: Partial<StopEvent> = {}): StopEvent {
  return {
    id, member_id: "m1", title: null, venue_name: null, city: "Riverside",
    address: `${id} Main St, Riverside, CA`, starts_at: "2026-10-06T01:00:00Z", ends_at: null,
    all_day: false, overlay_status: null, overlay_starts_at: null, is_hidden: false,
    latitude: null, longitude: null, geocoded_address: null, ...overrides,
  };
}

describe("geocodeStops", () => {
  it("looks up only stops that need it, and saves coordinates with the address", async () => {
    const save = vi.fn(async () => {});
    const geocode = vi.fn(async () => ({ lat: 33.9, lng: -117.3 }));
    const done = stop("2", { geocoded_address: "2 Main St, Riverside, CA" });
    const r = await geocodeStops({ loadStops: async () => [stop("1"), done], geocode, save, now: NOW });
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("1", { latitude: 33.9, longitude: -117.3, geocoded_address: "1 Main St, Riverside, CA" });
    expect(r).toEqual({ looked: 1, saved: 1 });
  });

  it("stops at the limit (20 by default)", async () => {
    const stops = Array.from({ length: 25 }, (_, i) => stop(String(i + 1)));
    const geocode = vi.fn(async () => ({ lat: 1, lng: 1 }));
    const r = await geocodeStops({ loadStops: async () => stops, geocode, save: async () => {}, now: NOW });
    expect(geocode).toHaveBeenCalledTimes(20);
    expect(r.looked).toBe(20);
  });

  it("nothing found: saves the address with no coordinates, so it isn't retried every run", async () => {
    const save = vi.fn(async () => {});
    await geocodeStops({ loadStops: async () => [stop("1")], geocode: async () => null, save, now: NOW });
    expect(save).toHaveBeenCalledWith("1", { latitude: null, longitude: null, geocoded_address: "1 Main St, Riverside, CA" });
  });

  it("a lookup that throws is skipped (retried next run) and the rest continue", async () => {
    const save = vi.fn(async () => {});
    const geocode = vi.fn(async (a: string) => {
      if (a.startsWith("1 ")) throw new Error("OVER_QUERY_LIMIT");
      return { lat: 2, lng: 2 };
    });
    const r = await geocodeStops({ loadStops: async () => [stop("1"), stop("2")], geocode, save, now: NOW });
    expect(save).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ looked: 2, saved: 1 });
  });
});
