import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Google Maps hasn't loaded (as on the server, and on first paint): there is
// no global `google`. The map must still render instead of crashing the page.
vi.mock("@vis.gl/react-google-maps", () => {
  const pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    APIProvider: pass,
    Map: pass,
    InfoWindow: pass,
    Marker: () => null,
    useApiIsLoaded: () => false,
    useMap: () => null,
  };
});
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

const { MembersV2Map } = await import("./MembersV2Map");

describe("MembersV2Map before Google Maps has loaded", () => {
  it("renders without touching the google global", () => {
    const pin = {
      key: "a", cardKey: "A", slug: "a", name: "A", city: "Riverside", address: "", lat: 33.9, lng: -117.3,
      kind: "location" as const, icon: null, website: null, stopLine: null,
    };
    expect(() =>
      renderToStaticMarkup(
        createElement(MembersV2Map, {
          pins: [pin], highlightCard: null, focusedSlug: null, onPinHover: () => {}, onPinClick: () => {}, linkSearch: {},
        }),
      ),
    ).not.toThrow();
  });
});
