import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/members/directory-filters";

/** The visitor's location for Near me. It stays in this browser tab: never sent to the server or stored. */
export function useNearMe() {
  const [status, setStatus] = useState<"off" | "asking" | "on" | "blocked">("off");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const turnOn = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("blocked");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("on");
      },
      () => {
        setOrigin(null);
        setStatus("blocked");
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }, []);
  const turnOff = useCallback(() => {
    setOrigin(null);
    setStatus("off");
  }, []);
  return { status, origin, turnOn, turnOff };
}
