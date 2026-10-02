import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KitchenSwitch } from "./KitchenSwitch";

describe("KitchenSwitch", () => {
  it("is a real switch that says what it does", () => {
    const html = renderToStaticMarkup(
      createElement(KitchenSwitch, { memberId: "m", initialHasKitchen: true, onChanged: () => {} }),
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("We have our own kitchen");
    expect(html).toContain("Kitchen open");
  });

  it("starts off when the member hasn't turned it on", () => {
    const html = renderToStaticMarkup(
      createElement(KitchenSwitch, { memberId: "m", initialHasKitchen: false, onChanged: () => {} }),
    );
    expect(html).toContain('aria-checked="false"');
  });
});
