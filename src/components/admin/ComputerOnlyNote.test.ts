import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComputerOnlyNote } from "@/components/admin/CalendarConnectionPanel";

describe("ComputerOnlyNote", () => {
  it("says the link is set up once, on a computer, and events can be added anywhere", () => {
    const html = renderToStaticMarkup(createElement(ComputerOnlyNote));
    expect(html).toContain("Set up the link on a computer — one time only.");
    expect(html).toContain("never in");
    expect(html).toContain("on your");
    expect(html).toContain('role="note"');
  });
});
