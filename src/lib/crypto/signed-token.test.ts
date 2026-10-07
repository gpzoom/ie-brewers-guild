import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./signed-token";

describe("signed tokens", () => {
  it("round-trips", async () => {
    expect(await verifyToken(await signToken("a.b.c", "s3cret"), "s3cret")).toBe("a.b.c");
  });
  it("an altered token or the wrong secret: null", async () => {
    const t = await signToken("a.b.c", "s3cret");
    expect(await verifyToken(t, "other")).toBeNull();
    expect(await verifyToken(`x${t}`, "s3cret")).toBeNull();
    expect(await verifyToken("garbage", "s3cret")).toBeNull();
  });
});
