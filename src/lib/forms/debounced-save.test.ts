import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSave } from "./debounced-save";

describe("createDebouncedSave (text boxes save while typing, not only on blur)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves the last value once typing pauses", () => {
    const save = vi.fn();
    const d = createDebouncedSave(save, 800);
    d.change("M");
    d.change("Mars");
    d.change("Mars Brewing Co.");
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("Mars Brewing Co.");
  });

  it("flush (blur, leaving the page) saves a pending value right away, once", () => {
    const save = vi.fn();
    const d = createDebouncedSave(save, 800);
    d.change("Mars Brewing Co.");
    d.flush();
    expect(save).toHaveBeenCalledWith("Mars Brewing Co.");
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing typed since the last save does nothing", () => {
    const save = vi.fn();
    const d = createDebouncedSave(save, 800);
    d.change("A");
    vi.advanceTimersByTime(800);
    d.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("doesn't save a value that equals the last saved one", () => {
    const save = vi.fn();
    const d = createDebouncedSave(save, 800, "Mars");
    d.change("Mars");
    vi.advanceTimersByTime(800);
    d.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
