import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChooseList } from "./ChooseList";

describe("ChooseList", () => {
  it("shows a one-manager business once with its location count, and other businesses by label", () => {
    const html = renderToStaticMarkup(
      createElement(ChooseList, {
        entries: [
          { kind: "business", businessId: "b", label: "Hangar 24 Brewing Co.", locationCount: 4, openMemberId: "m1" },
          { kind: "member", memberId: "m9", label: "Other Brewing", role: "editor" },
        ],
        busyId: null,
        onChoose: vi.fn(),
      }),
    );
    expect(html).toContain("Hangar 24 Brewing Co.");
    expect(html).toContain("4 locations");
    expect(html).toContain("Other Brewing");
    expect(html.match(/<button/g)).toHaveLength(2);
  });
});
