import { APIProvider, Map, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { directionsUrl, directoryPins, type DirectoryMember, type DirectoryPin } from "@/lib/members/directory";
import { Compass, ExternalLink, Navigation } from "lucide-react";

// Pins come from the database (src/lib/members/directory.ts): one per
// location with a street address and coordinates -- mobile members and
// not-yet-geocoded addresses get a card on the page but no pin.
type Pin = DirectoryPin;

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

type MembersMapProps = {
  members: DirectoryMember[];
  linkSearch: DirectorySearch;
  initialView?: { lat: number; lng: number; zoom: number };
  onViewChange?: (view: { lat: number; lng: number; zoom: number }) => void;
};

export function MembersMap({ members, linkSearch, initialView, onViewChange }: MembersMapProps) {
  const pins = useMemo(() => directoryPins(members), [members]);
  const [active, setActive] = useState<Pin | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleCameraChanged = (event: { detail: { center: { lat: number; lng: number }; zoom: number } }) => {
    if (!onViewChange) return;
    clearTimeout(debounceRef.current);
    // Debounced so a drag/zoom gesture writes one query-string update when
    // it settles, not one per intermediate frame (spec: "a couple of URL
    // parameters, not an architecture" -- this keeps it lightweight).
    debounceRef.current = setTimeout(() => {
      onViewChange({ lat: event.detail.center.lat, lng: event.detail.center.lng, zoom: event.detail.zoom });
    }, 400);
  };

  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-border shadow-[var(--shadow-glow)] md:h-[600px]">
        <Map
          defaultCenter={initialView ? { lat: initialView.lat, lng: initialView.lng } : { lat: 33.95, lng: -117.3 }}
          defaultZoom={initialView?.zoom ?? 9}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl
          onCameraChanged={handleCameraChanged}
        >
          {!initialView && <FitToPins pins={pins} />}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/members/$slug"
                    params={{ slug: active.slug }}
                    search={linkSearch}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-700 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
                  >
                    View profile
                  </Link>
                  {active.website && (
                    <a
                      href={active.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-amber-800"
                    >
                      <ExternalLink className="h-3 w-3" /> Website
                    </a>
                  )}
                  {active.tourUrl ? (
                    <a
                      href={active.tourUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-amber-800"
                    >
                      <Compass className="h-3 w-3" /> Take A Tour
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Tour booking coming soon"
                      className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                      <Compass className="h-3 w-3" /> Take A Tour
                    </button>
                  )}
                  <a
                    href={directionsUrl(active)}
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
