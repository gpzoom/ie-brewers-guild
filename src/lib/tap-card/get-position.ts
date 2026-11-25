import type { Position } from "@/lib/tap-card/location";

/**
 * The phone's position, or null when it's declined, missing or slow. Its own
 * timer, because the browser's timeout doesn't count the permission question.
 */
export function getPosition(geo: Pick<Geolocation, "getCurrentPosition"> | undefined, waitMs = 4000): Promise<Position | null> {
  if (!geo) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs);
    const finish = (p: Position | null) => {
      clearTimeout(timer);
      resolve(p);
    };
    try {
      geo.getCurrentPosition(
        ({ coords }) => finish({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
        () => finish(null),
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: waitMs },
      );
    } catch {
      finish(null);
    }
  });
}
