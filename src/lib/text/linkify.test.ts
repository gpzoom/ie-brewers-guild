import { describe, expect, it } from "vitest";
import { linkifyText } from "./linkify";

const links = (text: string) =>
  linkifyText(text)
    .filter((part) => part.kind === "link")
    .map((part) => (part.kind === "link" ? [part.text, part.href] : []));

describe("linkifyText", () => {
  it("turns an address on its own line into a link, keeping the text around it", () => {
    expect(linkifyText("Prizes!\nhttps://google.com")).toEqual([
      { kind: "text", text: "Prizes!\n" },
      { kind: "link", text: "https://google.com", href: "https://google.com" },
    ]);
  });

  it("links www. addresses over https", () => {
    expect(links("Tickets at www.example.com/tix")).toEqual([
      ["www.example.com/tix", "https://www.example.com/tix"],
    ]);
  });

  it("leaves sentence punctuation outside the link", () => {
    expect(links("See https://example.com/a. Or http://x.example, then go!")).toEqual([
      ["https://example.com/a", "https://example.com/a"],
      ["http://x.example", "http://x.example"],
    ]);
    expect(links("(details: https://example.com/a)")).toEqual([
      ["https://example.com/a", "https://example.com/a"],
    ]);
    expect(links("https://en.wikipedia.org/wiki/Stout_(beer)")).toEqual([
      ["https://en.wikipedia.org/wiki/Stout_(beer)", "https://en.wikipedia.org/wiki/Stout_(beer)"],
    ]);
  });

  it("never makes a link out of anything but http(s)", () => {
    expect(links("javascript:alert(1) data:text/html,hi mailto:a@b.co ftp://x.example")).toEqual(
      [],
    );
  });

  it("keeps text with no address as one piece", () => {
    expect(linkifyText("No links here.")).toEqual([{ kind: "text", text: "No links here." }]);
    expect(linkifyText("")).toEqual([]);
  });

  it("keeps query strings and fragments", () => {
    expect(links("https://example.com/e?id=4&ref=guild#top")).toEqual([
      ["https://example.com/e?id=4&ref=guild#top", "https://example.com/e?id=4&ref=guild#top"],
    ]);
  });
});
