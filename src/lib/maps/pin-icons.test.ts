import { describe, expect, it } from "vitest";
import { locationPinSvg, mobilePinSvg } from "./pin-icons";

function svgOf(url: string): string {
  return decodeURIComponent(url.replace("data:image/svg+xml;charset=UTF-8,", ""));
}

describe("pin icons", () => {
  it("location pins: red normally, orange when highlighted, bigger when focused", () => {
    expect(svgOf(locationPinSvg("normal").url)).toContain("#D93A2B");
    expect(svgOf(locationPinSvg("member").url)).toContain("#E8913A");
    expect(locationPinSvg("focused").height).toBeGreaterThan(locationPinSvg("member").height);
    expect(locationPinSvg("member").height).toBeGreaterThan(locationPinSvg("normal").height);
  });
  it("the focused pin carries its label, escaped", () => {
    const svg = svgOf(locationPinSvg("focused", "HANGAR 24 & CO · REDLANDS").url);
    expect(svg).toContain("HANGAR 24 &amp; CO · REDLANDS");
  });
  it("the anchor is the pin's tip (bottom center of the pin)", () => {
    const p = locationPinSvg("normal");
    expect(p.anchorY).toBe(p.height);
  });
  it.each(["truck", "tent", "mic", "star"] as const)("mobile pin %s is a teal circle with its own icon", (icon) => {
    const svg = svgOf(mobilePinSvg(icon, "normal").url);
    expect(svg).toContain("#17605F");
    expect(svg).toContain(`data-icon="${icon}"`);
  });
});
