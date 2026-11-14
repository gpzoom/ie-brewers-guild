import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSectionsWith } from "./homepage.server";
import { DEFAULT_SECTIONS } from "./sections";
import { CURRENT_SPOTLIGHT } from "./spotlight";

const MSG = "getHomepageData: couldn't read homepage_sections, using the default layout";
const has = Boolean(CURRENT_SPOTLIGHT);
afterEach(() => vi.restoreAllMocks());

describe("loadSectionsWith fallback", () => {
  it("a returned PostgREST error gives the default layout and logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = { from: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) };
    expect(await loadSectionsWith(svc as never, new Date(), has)).toEqual(DEFAULT_SECTIONS(has));
    expect(spy.mock.calls[0][0]).toBe(MSG);
  });
  it("a thrown error gives the default layout and logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = { from: () => { throw new Error("down"); } };
    expect(await loadSectionsWith(svc as never, new Date(), has)).toEqual(DEFAULT_SECTIONS(has));
    expect(spy.mock.calls[0][0]).toBe(MSG);
  });
});
