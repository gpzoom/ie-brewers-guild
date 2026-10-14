import Supercluster from "supercluster";
import type { V2Pin } from "@/lib/members/members-v2";

/**
 * Spec "Map behavior" > "Clustering": pins that crowd together at the
 * current zoom become one count bubble. Zoom 12 and closer (city level)
 * always shows real pins. A kept-out pin -- the highlighted member's, or
 * the one whose pop-up is open -- is never hidden inside a bubble.
 */
export const CLUSTER_MAX_ZOOM = 11;
const CLUSTER_RADIUS_PX = 60;

export type ClusterItem =
  | { kind: "pin"; pin: V2Pin }
  | {
      kind: "cluster";
      id: number;
      lat: number;
      lng: number;
      count: number;
      /** Its pins' positions, so a click can frame them all. */
      points: Array<{ lat: number; lng: number }>;
    };

type PinProps = { key: string };

export function clusterPins(
  pins: V2Pin[],
  zoom: number,
  keepOut: (p: V2Pin) => boolean,
): ClusterItem[] {
  const kept = pins.filter(keepOut);
  const loose = pins.filter((p) => !keepOut(p));
  const byKey = new Map(loose.map((p) => [p.key, p]));

  const index = new Supercluster<PinProps>({
    radius: CLUSTER_RADIUS_PX,
    maxZoom: CLUSTER_MAX_ZOOM,
    minPoints: 2,
  });
  index.load(
    loose.map((p) => ({
      type: "Feature" as const,
      properties: { key: p.key },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  );

  const items: ClusterItem[] = index
    .getClusters([-180, -85, 180, 85], Math.floor(zoom))
    .flatMap((f): ClusterItem[] => {
      const [lng, lat] = f.geometry.coordinates;
      if ("cluster" in f.properties && f.properties.cluster) {
        const id = f.properties.cluster_id;
        return [
          {
            kind: "cluster",
            id,
            lat,
            lng,
            count: f.properties.point_count,
            points: index.getLeaves(id, Infinity).map((leaf) => {
              const [leafLng, leafLat] = leaf.geometry.coordinates;
              return { lat: leafLat, lng: leafLng };
            }),
          },
        ];
      }
      const pin = byKey.get((f.properties as PinProps).key);
      return pin ? [{ kind: "pin", pin }] : [];
    });

  return [...items, ...kept.map((pin): ClusterItem => ({ kind: "pin", pin }))];
}
