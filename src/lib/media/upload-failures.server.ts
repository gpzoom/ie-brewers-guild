import { fileTypeFromBuffer } from "file-type";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { uploadFailureRecord, type UploadFailureInput } from "@/lib/media/upload-failure-record";

/**
 * Records a refused photo upload in public.upload_failures (service role;
 * Guild admins read it), so support can see what a member tried. Never
 * throws -- a failed record must not change what the member sees.
 */
export async function recordUploadFailure(
  input: Omit<UploadFailureInput, "detectedType"> & { bytes?: Uint8Array | null },
): Promise<void> {
  try {
    const detected = input.bytes ? await fileTypeFromBuffer(input.bytes).catch(() => undefined) : undefined;
    const service = await getSupabaseServiceRoleClient();
    const { error } = await service
      .from("upload_failures")
      .insert(uploadFailureRecord({ ...input, detectedType: detected?.mime ?? null }));
    if (error) console.error("recordUploadFailure: insert failed", error);
  } catch (err) {
    console.error("recordUploadFailure failed", err);
  }
}
