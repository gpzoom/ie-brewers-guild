import { describe, expect, it } from "vitest";
import { BROADCAST_ATTACHMENT_LIMITS, checkAttachmentAdd } from "./broadcast-attachments";

describe("checkAttachmentAdd", () => {
  it("has the exact limits", () => {
    expect(BROADCAST_ATTACHMENT_LIMITS.maxFiles).toBe(5);
    expect(BROADCAST_ATTACHMENT_LIMITS.maxTotalBytes).toBe(10485760);
    expect(BROADCAST_ATTACHMENT_LIMITS.mimeTypes).toHaveLength(9);
  });
  it("accepts a normal file", () => {
    expect(checkAttachmentAdd([{ size_bytes: 100 }], { size: 100, type: "application/pdf" })).toEqual({ ok: true });
  });
  it("rejects a 6th file", () => {
    const five = Array.from({ length: 5 }, () => ({ size_bytes: 1 }));
    expect(checkAttachmentAdd(five, { size: 1, type: "image/png" })).toEqual({ ok: false, message: "Up to 5 files." });
  });
  it("rejects going over 10 MB by one byte", () => {
    expect(checkAttachmentAdd([{ size_bytes: 10485760 - 9 }], { size: 10, type: "image/png" })).toEqual({
      ok: false,
      message: "Attachments can total 10 MB at most.",
    });
    expect(checkAttachmentAdd([{ size_bytes: 10485760 - 10 }], { size: 10, type: "image/png" })).toEqual({ ok: true });
  });
  it("rejects a zip", () => {
    expect(checkAttachmentAdd([], { size: 1, type: "application/zip" })).toEqual({
      ok: false,
      message: "That file type can't be attached. Use PDF, an image, Word or Excel.",
    });
  });
});
