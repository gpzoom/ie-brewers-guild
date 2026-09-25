import { useRef, useState } from "react";
import { uploadMemberLogo } from "@/lib/media/logo.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import { secondaryButtonClass } from "@/components/admin/basics/ui";

/**
 * The logo row card inside "Basics & hours" (artboard AdminBasics's
 * IDENTITY section; phone: AdminPhone). Copy says PNG only -- the artboard
 * says "PNG or SVG", but logo.server.ts's uploadMemberLogo deliberately
 * rejects SVG (product-owner decision documented there), so the copy
 * follows what the upload actually accepts.
 */
export function LogoUploader({
  memberId,
  initialLogoUrl,
}: {
  memberId: string;
  initialLogoUrl: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("file", file);
    await appendMeasuredDimensions(formData, file);
    try {
      const { publicUrl } = await uploadMemberLogo({ data: formData });
      setLogoUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-[13px] rounded-[11px] border border-canvas-border bg-white px-[14px] py-[13px] md:gap-4 md:px-[17px] md:py-[15px]">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-canvas-2 bg-[#F2EEE7] p-1.5 md:h-16 md:w-16 md:rounded-[12px]">
          {logoUrl ? (
            <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[8px] tracking-[0.1em] text-ink-subtle">LOGO</span>
          )}
        </div>
        <div className="flex min-w-0 flex-grow flex-col gap-[3px] md:gap-1">
          <div className="text-[13px] font-semibold text-ink md:text-[14px]">Your logo</div>
          <div className="text-[11px] leading-[1.4] text-ink-muted md:text-[12px]">
            PNG only, transparent background, at least 400px tall. JPGs and SVGs are rejected.
          </div>
        </div>
        <label htmlFor="logo-upload" className="sr-only">
          Upload a logo
        </label>
        <input
          ref={fileInputRef}
          id="logo-upload"
          type="file"
          accept="image/png"
          className="hidden"
          onChange={onFileSelected}
        />
        <button
          type="button"
          className={`${secondaryButtonClass} max-md:px-[13px] max-md:text-[12px]`}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
