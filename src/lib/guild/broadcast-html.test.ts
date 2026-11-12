import { describe, expect, it } from "vitest";
import { buildBroadcastEmail, htmlToText, sanitizeBroadcastHtml } from "./broadcast-html";

describe("sanitizeBroadcastHtml", () => {
  it("sanitizes pasted office html", () => {
    expect(
      sanitizeBroadcastHtml(
        '<p><span style="x"><font>Hi</font></span><o:p></o:p></p><a href="javascript:alert(1)">x</a><script>bad()</script>',
      ),
    ).toBe("<p>Hi</p>x");
  });

  it("keeps safe links, lists and underline", () => {
    const html =
      '<p><a href="https://a.b">a</a> <a href="mailto:a@b.c">m</a> <u>u</u></p><ul><li>one</li></ul><ol><li>two</li></ol>';
    expect(sanitizeBroadcastHtml(html)).toBe(html);
  });

  it("drops style and iframe with contents, and strips other attributes", () => {
    expect(
      sanitizeBroadcastHtml('<style>p{}</style><iframe src="x">inner</iframe><p onclick="x()" class="c">ok</p>'),
    ).toBe("<p>ok</p>");
  });
});

describe("htmlToText", () => {
  it("renders links and list items", () => {
    const t = htmlToText('<p>Hi <a href="https://a.b">site</a></p><ul><li>one</li><li>two</li></ul>');
    expect(t).toContain("Hi site (https://a.b)");
    expect(t).toContain("- one");
    expect(t).toContain("- two");
  });
});

describe("buildBroadcastEmail", () => {
  it("adds the unsubscribe footer", () => {
    const r = buildBroadcastEmail({ bodyHtml: "<p>Hello</p>", unsubscribeUrl: "https://x.y/u?a=1&b=2" });
    expect(r.html).toContain("<p>Hello</p>");
    expect(r.html).toContain('href="https://x.y/u?a=1&amp;b=2"');
    expect(r.text).toContain("Unsubscribe from Guild broadcasts: https://x.y/u?a=1&b=2");
    expect(r.text).toContain("You're getting this because you're on a member profile with the ISC Brewers Guild.");
  });
  it("has no footer without an unsubscribe url", () => {
    const r = buildBroadcastEmail({ bodyHtml: "<p>Hello</p>", unsubscribeUrl: "" });
    expect(r.html).not.toContain("Unsubscribe");
    expect(r.text).not.toContain("Unsubscribe");
  });
});
