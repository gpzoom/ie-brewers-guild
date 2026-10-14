import { describe, expect, it } from "vitest";
import type { V2Pin } from "@/lib/members/members-v2";
import { CLUSTER_MAX_ZOOM, clusterPins } from "./cluster-pins";

function pin(key: string, lat: number, lng: number, cardKey = key): V2Pin {
  return {
    key,
    cardKey,
    slug: key,
    name: key,
    city: "Riverside",
    address: "",
    lat,
    lng,
    kind: "location",
    icon: null,
    website: null,
    stopLine: null,
  };
}

// About 2 km apart in Riverside, and one at Lake Havasu.
const a = pin("a", 33.98, -117.37);
const b = pin("b", 33.99, -117.36);
const far = pin("far", 34.57, -114.36);
const none = () => false;

const singles = (items: ReturnType<typeof clusterPins>) =>
  items.flatMap((i) => (i.kind === "pin" ? [i.pin.key] : [])).sort();
const clusters = (items: ReturnType<typeof clusterPins>) =>
  items.filter((i) => i.kind === "cluster");

describe("clusterPins (spec: crowded pins become a count bubble until city level)", () => {
  it("two nearby pins share a bubble when zoomed out", () => {
    const items = clusterPins([a, b, far], 9, none);
    expect(singles(items)).toEqual(["far"]);
    expect(clusters(items)).toHaveLength(1);
    expect(clusters(items)[0]).toMatchObject({ kind: "cluster", count: 2 });
  });

  it("no bubbles at city level and closer", () => {
    for (const zoom of [CLUSTER_MAX_ZOOM + 1, 15]) {
      expect(singles(clusterPins([a, b, far], zoom, none))).toEqual(["a", "b", "far"]);
    }
  });

  it("far-apart pins never cluster", () => {
    expect(singles(clusterPins([a, far], 6, none))).toEqual(["a", "far"]);
  });

  it("a kept-out pin (highlighted, or its pop-up open) is never inside a bubble", () => {
    const items = clusterPins([a, b, far], 9, (p) => p.key === "a");
    expect(singles(items)).toEqual(["a", "b", "far"]);
    expect(clusters(items)).toHaveLength(0);
  });

  it("every pin is counted exactly once", () => {
    const many = Array.from({ length: 8 }, (_, i) => pin(`p${i}`, 33.98 + i * 0.002, -117.37));
    const items = clusterPins([...many, far], 8, none);
    const total = items.reduce((n, i) => n + (i.kind === "cluster" ? i.count : 1), 0);
    expect(total).toBe(9);
  });

  it("a bubble knows where its pins are, so clicking it can frame them", () => {
    const [cluster] = clusters(clusterPins([a, b, far], 9, none));
    if (cluster?.kind !== "cluster") throw new Error("expected a cluster");
    const spots = cluster.points.map((p) => `${p.lat},${p.lng}`).sort();
    expect(spots).toEqual([`${a.lat},${a.lng}`, `${b.lat},${b.lng}`]);
  });

  it("no pins, no items", () => {
    expect(clusterPins([], 9, none)).toEqual([]);
  });
});
