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

  it("returns null when the image never loads (times out)", async () => {
    vi.useFakeTimers();
    class StalledImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {}
    }
    vi.stubGlobal("Image", StalledImage);
    const result = loadLogo("https://example.com/slow.png", 1200, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("waits 10 seconds by default before giving up", async () => {
    vi.useFakeTimers();
    class StalledImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {}
    }
    vi.stubGlobal("Image", StalledImage);
    let settled = false;
    const result = loadLogo("https://example.com/slow.png").then((v) => {
      settled = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBeNull();
    vi.useRealTimers();
  });
});
