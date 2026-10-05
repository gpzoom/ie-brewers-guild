/// <reference types="google.maps" />
import { APIProvider, InfoWindow, Map, Marker, useApiIsLoaded, useMap } from "@vis.gl/react-google-maps";
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

function FitOnce({ pins, padding }: { pins: V2Pin[]; padding: number | google.maps.Padding }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current || pins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, padding);
    done.current = true;
  }, [map, pins]);
  return null;
}

/** Spec "Map behavior": the map only moves when a highlighted pin is off-screen. */
function PanToHighlighted({ targets, padding }: { targets: Array<{ lat: number; lng: number }>; padding: number | google.maps.Padding }) {
  const map = useMap();
  const signature = targets.map((t) => `${t.lat},${t.lng}`).join("|");
  useEffect(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    // A pin under the phone's card rail (bottom padding) counts as off-screen.
    const bottom = typeof padding === "number" ? 0 : (padding.bottom ?? 0);
    const div = map.getDiv();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const hiddenLat = div.clientHeight > 0 ? ((ne.lat() - sw.lat()) * bottom) / div.clientHeight : 0;
    const visible = new google.maps.LatLngBounds({ lat: sw.lat() + hiddenLat, lng: sw.lng() }, ne);
    const decision = panDecision(targets, (p) => visible.contains(p));
    if (decision.kind === "pan") {
      map.panTo(decision.to);
      if (bottom) map.panBy(0, bottom / 2);
    }
    if (decision.kind === "fit") {
      const b = new google.maps.LatLngBounds();
      decision.points.forEach((p) => b.extend(p));
      map.fitBounds(b, padding);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the targets change
  }, [map, signature]);
  return null;
}

/**
 * The pins. Their icons need google.maps.Size/Point, which exist only once
 * the Maps script has loaded (and never on the server), so nothing renders
 * until then.
 */
function PinMarkers(props: {
  pins: V2Pin[];
  highlightCard: string | null;
  focusedSlug: string | null;
  onPinHover: (cardKey: string | null) => void;
  onPinClick: (pin: V2Pin) => void;
}) {
  const loaded = useApiIsLoaded();
  if (!loaded || typeof google === "undefined") return null;
  return (
    <>
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
            onClick={() => props.onPinClick(p)}
          />
        );
      })}
    </>
  );
}

/** A pin's pop-up: name, its line, Directions, Website (as on /members) and Profile. */
export function PinPopup({ pin, linkSearch }: { pin: V2Pin; linkSearch: DirectorySearch }) {
  return (
    <div className="font-sans" style={{ minWidth: 220, maxWidth: 280 }}>
      <div className="text-[15px] font-bold text-gray-900">{pin.name}</div>
      <div className="mt-1 text-xs text-gray-600">{pin.stopLine ?? pin.address}</div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-amber-700">
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`} target="_blank" rel="noreferrer">Directions</a>
        {pin.website && (
          <a href={pin.website} target="_blank" rel="noreferrer">Website</a>
        )}
        <Link to="/members/$slug" params={{ slug: pin.slug }} search={linkSearch}>Profile →</Link>
      </div>
    </div>
  );
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
  /** Room to leave around pins when framing them (the phone's card rail covers the bottom). */
  fitPadding?: number | google.maps.Padding;
}) {
  const padding = props.fitPadding ?? 60;
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
          {!props.initialView && <FitOnce pins={props.pins} padding={padding} />}
          <PanToHighlighted targets={targets} padding={padding} />
          <PinMarkers
            pins={props.pins}
            highlightCard={props.highlightCard}
            focusedSlug={props.focusedSlug}
            onPinHover={props.onPinHover}
            onPinClick={(p) => {
              setActive(p);
              props.onPinClick(p);
            }}
          />
          {active && (
            <InfoWindow position={{ lat: active.lat, lng: active.lng }} pixelOffset={[0, -36]} onCloseClick={() => setActive(null)}>
              <PinPopup pin={active} linkSearch={props.linkSearch} />
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
