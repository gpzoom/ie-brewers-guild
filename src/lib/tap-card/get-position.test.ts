import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPosition } from "./get-position";

type Ok = PositionCallback;
const fix = { coords: { latitude: 34, longitude: -117, accuracy: 12 } } as GeolocationPosition;

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("getPosition", () => {
  it("is null without geolocation", async () => expect(await getPosition(undefined)).toBeNull());
  it("gives the three numbers", async () => {
    expect(await getPosition({ getCurrentPosition: (ok: Ok) => ok(fix) })).toEqual({ lat: 34, lng: -117, accuracy: 12 });
  });
  it("is null when declined or when the browser throws", async () => {
    expect(await getPosition({ getCurrentPosition: (_: Ok, no?: PositionErrorCallback | null) => no?.({} as GeolocationPositionError) })).toBeNull();
    expect(
      await getPosition({
        getCurrentPosition: () => {
          throw new Error("no");
        },
      }),
    ).toBeNull();
  });
  it("gives up after 4 seconds and ignores a late answer", async () => {
    let late: Ok = () => {};
    const p = getPosition({
      getCurrentPosition: (ok: Ok) => {
        late = ok;
      },
    });
    const done = vi.fn();
    void p.then(done);
    await vi.advanceTimersByTimeAsync(3999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledWith(null);
    late(fix);
    expect(await p).toBeNull();
  });
});
