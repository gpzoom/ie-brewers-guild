/** The row recorded when a photo upload is refused (public.upload_failures). Pure. */
export type UploadFailureInput = {
  source: "gallery" | "creator";
  memberId: string | null;
  userId: string | null;
  filename: string | null;
  claimedType: string | null;
  detectedType: string | null;
  byteSize: number | null;
  reason: string;
};

function short(value: string | null | undefined, max: number): string | null {
  const v = (value ?? "").trim();
  return v ? v.slice(0, max) : null;
}

export function uploadFailureRecord(input: UploadFailureInput) {
  return {
    source: input.source,
    member_id: input.memberId,
    user_id: input.userId,
    original_filename: short(input.filename, 200),
    claimed_type: short(input.claimedType, 100),
    detected_type: short(input.detectedType, 100),
    byte_size: input.byteSize,
    reason: short(input.reason, 500) ?? "unknown",
  };
}
