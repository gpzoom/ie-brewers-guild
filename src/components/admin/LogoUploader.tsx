import { useRef, useState } from "react";
import { uploadMemberLogo } from "@/lib/media/logo.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import { Button } from "@/components/ui/button";

export function LogoUploader({ memberId, initialLogoUrl }: { memberId: string; initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Logo</h2>
      <p className="text-xs text-muted-foreground">PNG, transparent background, at least 400px tall.</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-md bg-canvas p-2">
          {logoUrl ? <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
        </div>
        <div>
          <label htmlFor="logo-upload" className="sr-only">
            Upload a logo
          </label>
          <input ref={fileInputRef} id="logo-upload" type="file" accept="image/png" className="hidden" onChange={onFileSelected} />
          <Button type="button" className="h-11" onClick={() => fileInputRef.current?.click()}>
            Upload logo
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
