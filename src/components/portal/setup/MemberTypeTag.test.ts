import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberTypeTag } from "./MemberTypeTag";

describe("MemberTypeTag", () => {
  it.each([
    ["producer", "Producer", "#F5E2D0", "#7A4413"],
    ["mobile", "Mobile member", "#DCEDEC", "#17605F"],
    ["allied", "Allied Member", "#E6E3F3", "#3B4B9A"],
  ] as const)("%s reads %s in its own colors", (memberType, label, bg, fg) => {
    const html = renderToStaticMarkup(createElement(MemberTypeTag, { memberType }));
    expect(html).toContain(label);
    expect(html.toUpperCase()).toContain(bg);
    expect(html.toUpperCase()).toContain(fg);
    expect(html).toContain("uppercase");
  });
});
