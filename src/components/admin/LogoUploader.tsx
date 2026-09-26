import { useRef, useState } from "react";
import { uploadMemberLogo } from "@/lib/media/logo.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import { useDraftStatus, useSaveDraftSection } from "@/components/admin/DraftStatusContext";
import {
  LOGO_BACKGROUNDS,
  LOGO_BACKGROUND_LABELS,
  logoBackgroundColor,
  type LogoBackground,
} from "@/lib/members/logo-background";
import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";
import { secondaryButtonClass } from "@/components/admin/basics/ui";

/**
 * The logo row card inside "Basics & hours" (artboard AdminBasics's
 * IDENTITY section; phone: AdminPhone). Copy says PNG only -- the artboard
 * says "PNG or SVG", but logo.server.ts's uploadMemberLogo deliberately
 * rejects SVG (product-owner decision documented there), so the copy
 * follows what the upload actually accepts.
 *
 * Also the logo's tile color (members.logo_background): a mostly-white
 * logo vanishes on the default white tile, so the member picks white, dark
 * or their theme color, with a live preview of the profile header drawn
 * through the same logoBackgroundColor the public page uses.
 *
 * Phase 2: both the uploaded logo and the tile color go into the member's
 * DRAFT (basics) and show on the public page once published. The upload
 * itself still lands in the gallery straight away (uploadMemberLogo).
 */
export function LogoUploader({
  memberId,
  initialLogoUrl,
  initialBackground,
  theme,
  businessName,
}: {
  memberId: string;
  initialLogoUrl: string | null;
  initialBackground: LogoBackground;
  theme: MemberThemeName;
  businessName: string;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  // Upload problems show right under the logo row; background-save problems under the choices.
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [background, setBackground] = useState<LogoBackground>(initialBackground);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const savedBackgroundRef = useRef<LogoBackground>(initialBackground);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveDraft = useSaveDraftSection(memberId);
  const reportSaved = useDraftStatus()?.reportSaved;

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("file", file);
    await appendMeasuredDimensions(formData, file);
    try {
      const { publicUrl, dirtySections } = await uploadMemberLogo({ data: formData });
      setLogoUrl(publicUrl);
      reportSaved?.("basics", dirtySections);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onChooseBackground(next: LogoBackground) {
    if (next === background) return;
    setBackground(next);
    setError(null);
    setSaveState("saving");
    try {
      await saveDraft("basics", { logo_background: next });
      savedBackgroundRef.current = next;
      setSaveState("saved");
    } catch (err) {
      // Roll the choice back to what's actually saved.
      setBackground(savedBackgroundRef.current);
      setSaveState("idle");
      setError(err instanceof Error ? err.message : "Couldn't save the logo background.");
    }
  }

  const tileColor = logoBackgroundColor(background, theme);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-4 rounded-[11px] border border-canvas-border bg-white px-[14px] py-[13px] md:px-[17px] md:py-[15px]">
        <div className="flex items-center gap-[13px] md:gap-4">
          <div
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-canvas-2 p-1.5 md:h-16 md:w-16 md:rounded-[12px]"
            style={{ backgroundColor: logoUrl ? tileColor : "#F2EEE7" }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[8px] tracking-[0.1em] text-ink-subtle">LOGO</span>
            )}
          </div>
          <div className="flex min-w-0 flex-grow flex-col gap-[3px] md:gap-1">
            <div className="text-[13px] font-semibold text-ink md:text-[14px]">Your logo</div>
            <div className="text-[11px] leading-[1.4] text-ink-muted md:text-[12px]">
              PNG only, transparent background, at least 400px tall, up to 2 MB. JPGs and SVGs are rejected.
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
        {uploadError && (
          <p role="alert" className="-mt-2 text-[13px] font-medium text-danger">
            {uploadError}
          </p>
        )}

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 border-t border-canvas-2 p-0 pt-4">
          <legend className="float-left mb-2.5 flex w-full items-baseline justify-between gap-3 p-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
              Logo background
            </span>
            <span aria-live="polite" className="text-[12px] text-ink-muted">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : ""}
            </span>
          </legend>
          <p className="m-0 text-[12px] leading-[1.45] text-ink-muted">
            The tile behind your logo on your profile. If your logo is mostly white, pick Dark or your theme color so it
            stands out.
          </p>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {LOGO_BACKGROUNDS.map((option) => {
              const checked = background === option;
              return (
                <label
                  key={option}
                  htmlFor={`logo-bg-${option}`}
                  className={`flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-[11px] bg-white px-2 py-3 text-center ${
                    checked ? "border-2 border-ink" : "border border-canvas-border hover:border-ink-subtle"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[10px] border border-canvas-2 p-1"
                    style={{ backgroundColor: logoBackgroundColor(option, theme) }}
                  >
                    {logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : null}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      id={`logo-bg-${option}`}
                      name="logo-background"
                      value={option}
                      checked={checked}
                      onChange={() => void onChooseBackground(option)}
                      className="h-4 w-4 accent-[#241F1A]"
                    />
                    <span className="text-[12px] font-medium text-ink md:text-[13px]">
                      {LOGO_BACKGROUND_LABELS[option]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Preview of the profile header: cover band in the member's theme
            color (what shows with no cover photo) with the logo tile
            overlapping its edge, as the public page draws it. */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
            Preview on your profile
          </span>
          <div className="overflow-hidden rounded-[14px] border border-canvas-border bg-canvas">
            <div className="h-[72px] md:h-[88px]" style={{ backgroundColor: getMemberThemeHex(theme) }} />
            <div className="flex items-end gap-3 px-4 pb-4">
              <div
                className="-mt-[30px] flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-canvas p-1.5"
                style={{ backgroundColor: tileColor }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[8px] tracking-[0.1em] text-ink-subtle">LOGO</span>
                )}
              </div>
              <div className="min-w-0 pt-2 text-[17px] font-bold leading-tight text-ink [font-family:var(--font-display)]">
                {businessName}
              </div>
            </div>
          </div>
          {!logoUrl && (
            <p className="m-0 text-[12px] text-ink-muted">Upload a logo to see it on each background.</p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
