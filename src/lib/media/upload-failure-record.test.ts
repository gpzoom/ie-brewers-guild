import { describe, expect, it } from "vitest";
import { uploadFailureRecord } from "./upload-failure-record";

describe("uploadFailureRecord", () => {
  it("keeps the facts support needs, never the photo", () => {
    expect(
      uploadFailureRecord({
        source: "gallery", memberId: "m1", userId: "u1", filename: "IMG 1215x911.jpg",
        claimedType: "image/jpeg", detectedType: "image/webp", byteSize: 98765, reason: "We couldn't read this photo.",
      }),
    ).toEqual({
      source: "gallery", member_id: "m1", user_id: "u1", original_filename: "IMG 1215x911.jpg",
      claimed_type: "image/jpeg", detected_type: "image/webp", byte_size: 98765, reason: "We couldn't read this photo.",
    });
  });

  it("trims long text and blanks to null", () => {
    const r = uploadFailureRecord({ source: "creator", memberId: null, userId: null, filename: "x".repeat(400), claimedType: "", detectedType: null, byteSize: 1, reason: "r" });
    expect(r.original_filename).toHaveLength(200);
    expect(r.claimed_type).toBeNull();
  });
});
