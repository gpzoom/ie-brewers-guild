/// <reference types="google.maps" />
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { V2Pin } from "@/lib/members/members-v2";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { locationPinSvg, mobilePinSvg, type PinLook } from "@/lib/maps/pin-icons";
import { panDecision } from "@/lib/maps/pan-decision";

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function lookOf(pin: V2Pin, highlightCard: string | null, focusedSlug: string | null): PinLook {
  if (focusedSlug && pin.slug === focusedSlug && pin.cardKey === highlightCard) return "focused";
  return pin.cardKey === highlightCard ? "member" : "normal";
}

function FitOnce({ pins }: { pins: V2Pin[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current || pins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 60);
    done.current = true;
  }, [map, pins]);
  return null;
}

/** Spec "Map behavior": the map only moves when a highlighted pin is off-screen. */
function PanToHighlighted({ targets }: { targets: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  const signature = targets.map((t) => `${t.lat},${t.lng}`).join("|");
  useEffect(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const decision = panDecision(targets, (p) => bounds.contains(p));
    if (decision.kind === "pan") map.panTo(decision.to);
    if (decision.kind === "fit") {
      const b = new google.maps.LatLngBounds();
      decision.points.forEach((p) => b.extend(p));
      map.fitBounds(b, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the targets change
  }, [map, signature]);
  return null;
}

export function MembersV2Map(props: {
  pins: V2Pin[];
  highlightCard: string | null;
  focusedSlug: string | null;
  onPinHover: (cardKey: string | null) => void;
  onPinClick: (pin: V2Pin) => void;
  linkSearch: DirectorySearch;
  initialView?: { lat: number; lng: number; zoom: number };
  onViewChange?: (v: { lat: number; lng: number; zoom: number }) => void;
  className?: string;
}) {
  const [active, setActive] = useState<V2Pin | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(debounce.current), []);

  const targets = useMemo(() => {
    if (!props.highlightCard) return [];
    const own = props.pins.filter((p) => p.cardKey === props.highlightCard);
    const focused = props.focusedSlug ? own.filter((p) => p.slug === props.focusedSlug) : [];
    return (focused.length ? focused : own).map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [props.pins, props.highlightCard, props.focusedSlug]);

  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <div className={props.className}>
        <Map
          defaultCenter={props.initialView ? { lat: props.initialView.lat, lng: props.initialView.lng } : { lat: 33.95, lng: -117.3 }}
          defaultZoom={props.initialView?.zoom ?? 9}
          gestureHandling="greedy"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          onCameraChanged={(e) => {
            if (!props.onViewChange) return;
            clearTimeout(debounce.current);
            debounce.current = setTimeout(
              () => props.onViewChange?.({ lat: e.detail.center.lat, lng: e.detail.center.lng, zoom: e.detail.zoom }),
              400,
            );
          }}
        >
          {!props.initialView && <FitOnce pins={props.pins} />}
          <PanToHighlighted targets={targets} />
          {props.pins.map((p) => {
            const look = lookOf(p, props.highlightCard, props.focusedSlug);
            const label = `${p.name} · ${p.city}`.toUpperCase();
            const icon = p.kind === "mobile" && p.icon ? mobilePinSvg(p.icon, look, label) : locationPinSvg(look, label);
            return (
              <Marker
                key={p.key}
                position={{ lat: p.lat, lng: p.lng }}
                title={`${p.name} — ${p.city}`}
                zIndex={look === "normal" ? 1 : look === "member" ? 50 : 100}
                icon={{
                  url: icon.url,
                  scaledSize: new google.maps.Size(icon.width, icon.height),
                  anchor: new google.maps.Point(icon.anchorX, icon.anchorY),
                }}
                onMouseOver={() => props.onPinHover(p.cardKey)}
                onMouseOut={() => props.onPinHover(null)}
                onClick={() => {
                  setActive(p);
                  props.onPinClick(p);
                }}
              />
            );
          })}
          {active && (
            <InfoWindow position={{ lat: active.lat, lng: active.lng }} pixelOffset={[0, -36]} onCloseClick={() => setActive(null)}>
              <div className="font-sans" style={{ minWidth: 220, maxWidth: 280 }}>
                <div className="text-[15px] font-bold text-gray-900">{active.name}</div>
                <div className="mt-1 text-xs text-gray-600">{active.stopLine ?? active.address}</div>
                <div className="mt-2 flex gap-4 text-[13px] font-semibold text-amber-700">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${active.lat},${active.lng}`} target="_blank" rel="noreferrer">Directions</a>
                  <Link to="/members/$slug" params={{ slug: active.slug }} search={props.linkSearch}>Profile →</Link>
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
