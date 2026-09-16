import { APIProvider, Map, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useState } from "react";
import type { Member } from "@/data/site";
import { ExternalLink, Navigation } from "lucide-react";

type Pin = {
  brewery: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  website: string;
};

function membersToPins(members: Member[]): Pin[] {
  return members.flatMap((m) =>
    m.locations.map((l) => ({
      brewery: m.name,
      city: l.city,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      website: m.website,
    })),
  );
}

// Once the map is mounted, frame all pins.
function FitToPins({ pins }: { pins: Pin[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || pins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 60);
  }, [map, pins]);
  return null;
}

// Public Google Maps browser key, restricted by HTTP referrer in Google
// Cloud Console to our prod + local-dev domains. Sourced from an env var
// (set VITE_GOOGLE_MAPS_API_KEY locally and as a Cloudflare build variable).
// If this is rotated, remember to update the referrer restrictions too.
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export function MembersMap({ members }: { members: Member[] }) {
  const pins = useMemo(() => membersToPins(members), [members]);
  const [active, setActive] = useState<Pin | null>(null);

  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-border shadow-[var(--shadow-glow)] md:h-[600px]">
        <Map
          defaultCenter={{ lat: 33.95, lng: -117.3 }}
          defaultZoom={9}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl
        >
          <FitToPins pins={pins} />
          {pins.map((p, i) => (
            <Marker
              key={`${p.brewery}-${p.city}-${i}`}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.brewery} — ${p.city}`}
              onClick={() => setActive(p)}
            />
          ))}
          {active && (
            <InfoWindow
              position={{ lat: active.lat, lng: active.lng }}
              pixelOffset={[0, -32]}
              onCloseClick={() => setActive(null)}
            >
              <div className="font-sans" style={{ minWidth: 220, maxWidth: 280 }}>
                <div className="font-display text-base font-semibold uppercase tracking-wide text-gray-900">
                  {active.brewery}
                </div>
                <div className="mt-1 text-xs font-medium text-amber-700">{active.city}</div>
                <div className="mt-2 text-xs leading-snug text-gray-700">{active.address}</div>
                <div className="mt-3 flex gap-2">
                  <a
                    href={active.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-amber-800"
                  >
                    <ExternalLink className="h-3 w-3" /> Visit
                  </a>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${active.lat},${active.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-gray-900 hover:bg-gray-100"
                  >
                    <Navigation className="h-3 w-3" /> Directions
                  </a>
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
