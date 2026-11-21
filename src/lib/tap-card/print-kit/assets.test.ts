import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLogo } from "./assets";

afterEach(() => vi.unstubAllGlobals());

describe("loadLogo returns null on failure", () => {
  it("returns null with no url", async () => {
    expect(await loadLogo(null)).toBeNull();
  });

  it("returns null when the image fails to load", async () => {
    class FailingImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("Image", FailingImage);
    await expect(loadLogo("https://example.com/logo.webp")).resolves.toBeNull();
  });
});
