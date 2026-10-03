import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { saveBrandSettings } from "@/lib/brand/brand-settings.server";
import { DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import {
  DEFAULT_FONT_PAIRING_ID,
  FONT_PAIRINGS,
  getFontPairingById,
} from "@/lib/brand/font-pairings";
import { contrastRatioOfOklchStrings, parseOklch } from "@/lib/brand/contrast";

const BRAND_CHROMA = 0.15;
const BRAND_BRIGHT_CHROMA = 0.165;
const MIN_CONTRAST = 4.5;

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

/** A plain-words name for an oklch hue angle, for the "50° · amber" readout. */
function hueName(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  if (h < 15) return "rose";
  if (h < 38) return "red";
  if (h < 68) return "amber";
  if (h < 105) return "gold";
  if (h < 165) return "green";
  if (h < 215) return "teal";
  if (h < 275) return "blue";
  if (h < 325) return "violet";
  return "rose";
}

const sectionLabelClass = "text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted";

function ContrastPill({ ratio }: { ratio: number }) {
  const passes = ratio >= MIN_CONTRAST;
  return (
    <span
      className={`shrink-0 rounded-full px-[9px] py-[3px] text-[10px] font-semibold uppercase tracking-[0.06em] ${
        passes ? "bg-[#DCEBD8] text-[#2F5E2B]" : "bg-[#F6DDD5] text-[#8A2E17]"
      }`}
    >
      {passes ? "Passes" : "Fails"} {formatRatio(ratio)}
    </span>
  );
}

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-px shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="#6B6156" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.9v.9" stroke="#6B6156" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Guild brand & theme (artboard Q, GuildBrand). Typefaces are one of the
 * curated pairings, never a free font field; color is edited as a brand
 * hue and lightness with live contrast readouts, not raw hex (spec,
 * "Editing the brand from the admin"). Only --brand and --brand-bright are
 * exposed (this plan's Decision 11) -- a shared hue, and one lightness
 * slider per tier, each paired with the fixed text color it actually
 * carries in production (white on --brand, --ink on --brand-bright). Save is
 * blocked while either falls below 4.5:1. A live preview on the right shows
 * the choice on a sample member page before anything is saved.
 */
export function BrandEditor({
  settings,
}: {
  settings: { fontPairingId: string; tokens: BrandTokens } | null;
}) {
  const router = useRouter();
  const currentTokens = settings?.tokens ?? DEFAULT_BRAND_TOKENS;
  const savedPairingId = settings?.fontPairingId ?? DEFAULT_FONT_PAIRING_ID;
  const initialBrand = parseOklch(currentTokens.brand);
  const initialBrandBright = parseOklch(currentTokens["brand-bright"]);

  const [hue, setHue] = useState(initialBrand.h);
  const [brandLightness, setBrandLightness] = useState(initialBrand.l);
  const [brandBrightLightness, setBrandBrightLightness] = useState(initialBrandBright.l);
  const [fontPairingId, setFontPairingId] = useState(savedPairingId);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const brandOklch = `oklch(${brandLightness} ${BRAND_CHROMA} ${hue})`;
  const brandBrightOklch = `oklch(${brandBrightLightness} ${BRAND_BRIGHT_CHROMA} ${hue})`;
  const inkOklch = currentTokens.ink;

  const brandContrast = useMemo(
    () => contrastRatioOfOklchStrings(brandOklch, "oklch(1 0 0)"),
    [brandOklch],
  );
  const brandBrightContrast = useMemo(
    () => contrastRatioOfOklchStrings(brandBrightOklch, inkOklch),
    [brandBrightOklch, inkOklch],
  );

  const brandPasses = brandContrast >= MIN_CONTRAST;
  const brandBrightPasses = brandBrightContrast >= MIN_CONTRAST;

  const selectedPairing = getFontPairingById(fontPairingId) ?? FONT_PAIRINGS[0];
  const previewDisplayFont = `'${selectedPairing.displayFamily}', Georgia, serif`;
  const previewBodyFont = `'${selectedPairing.bodyFamily}', ui-sans-serif, system-ui, sans-serif`;

  function resetToDefaults() {
    const defaultBrand = parseOklch(DEFAULT_BRAND_TOKENS.brand);
    const defaultBrandBright = parseOklch(DEFAULT_BRAND_TOKENS["brand-bright"]);
    setHue(defaultBrand.h);
    setBrandLightness(defaultBrand.l);
    setBrandBrightLightness(defaultBrandBright.l);
    setFontPairingId(DEFAULT_FONT_PAIRING_ID);
    setErrorMessage(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    try {
      await saveBrandSettings({
        data: { hue, brandLightness, brandBrightLightness, fontPairingId },
      });
      await router.invalidate();
      toast.success("Brand saved. The whole site now uses it.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the brand settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Every pairing's fonts, so each card and the preview render in their own typeface. */}
      {FONT_PAIRINGS.map((pairing) => (
        <link
          key={pairing.id}
          rel="stylesheet"
          href={pairing.googleFontsHref}
          precedence="default"
        />
      ))}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Brand &amp; theme
          </h1>
          <p className="text-pretty text-[13px] text-[#564E45]">
            Sets the type and color for the whole site. Member themes sit inside this — they color
            a member's own page, not the Guild's frame.
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={resetToDefaults}
            disabled={saving}
            className="inline-flex h-11 items-center rounded-[9px] border border-canvas-border bg-white px-4 text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60"
          >
            Reset to defaults
          </button>
          <button
            type="submit"
            disabled={saving || !brandPasses || !brandBrightPasses}
            className="inline-flex h-11 items-center rounded-[9px] bg-brand px-[18px] text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save brand"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-[11px] border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-danger"
        >
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-[30px] xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className={`${sectionLabelClass} pb-1`}>Typefaces</legend>

            {FONT_PAIRINGS.map((pairing) => {
              const selected = pairing.id === fontPairingId;
              const inUse = pairing.id === savedPairingId;
              const inputId = `brand-pairing-${pairing.id}`;
              return (
                <label
                  key={pairing.id}
                  htmlFor={inputId}
                  className={`flex cursor-pointer items-center gap-[15px] rounded-xl bg-white px-[18px] py-[15px] transition-colors ${
                    selected
                      ? "border-2 border-ink"
                      : "border border-canvas-border hover:border-ink-subtle"
                  }`}
                >
                  <input
                    type="radio"
                    id={inputId}
                    name="brand-font-pairing"
                    value={pairing.id}
                    checked={selected}
                    onChange={() => setFontPairingId(pairing.id)}
                    className="h-[18px] w-[18px] shrink-0 accent-[#241F1A]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span
                      className="text-[23px] font-bold leading-[1.1] text-ink"
                      style={{ fontFamily: `'${pairing.displayFamily}', Georgia, serif` }}
                    >
                      Independent craft
                    </span>
                    <span className="text-[13px] text-[#564E45]">
                      {pairing.displayFamily} over {pairing.bodyFamily}
                      {pairing.id === DEFAULT_FONT_PAIRING_ID && " — the default"}
                    </span>
                  </span>
                  {inUse && (
                    <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-canvas">
                      In use
                    </span>
                  )}
                </label>
              );
            })}

            <p className="pt-0.5 text-xs text-ink-subtle">
              Tested pairings rather than a font list, so the site always stays legible and quick to
              load.
            </p>
          </fieldset>

          <div className="flex flex-col gap-3.5 rounded-[14px] border border-canvas-border bg-white px-5 py-[22px] md:px-6">
            <div className={sectionLabelClass}>Brand color</div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="brand-hue" className="text-[13px] font-medium text-ink">
                  Hue
                </label>
                <span className="text-xs text-ink-muted">
                  {Math.round(hue)}° · {hueName(hue)}
                </span>
              </div>
              <input
                id="brand-hue"
                type="range"
                min={0}
                max={359}
                step={1}
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
                className="h-6 w-full"
                style={{ accentColor: brandOklch }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="brand-lightness" className="text-[13px] font-medium text-ink">
                  Depth <span className="font-normal text-ink-muted">— filled buttons</span>
                </label>
                <span className="text-xs text-ink-muted">
                  {Math.round(brandLightness * 100)}% lightness
                </span>
              </div>
              <input
                id="brand-lightness"
                type="range"
                min={0.2}
                max={0.85}
                step={0.01}
                value={brandLightness}
                onChange={(e) => setBrandLightness(Number(e.target.value))}
                className="h-6 w-full"
                style={{ accentColor: brandOklch }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <label
                  htmlFor="brand-bright-lightness"
                  className="text-[13px] font-medium text-ink"
                >
                  Brightness <span className="font-normal text-ink-muted">— links on dark</span>
                </label>
                <span className="text-xs text-ink-muted">
                  {Math.round(brandBrightLightness * 100)}% lightness
                </span>
              </div>
              <input
                id="brand-bright-lightness"
                type="range"
                min={0.5}
                max={0.9}
                step={0.01}
                value={brandBrightLightness}
                onChange={(e) => setBrandBrightLightness(Number(e.target.value))}
                className="h-6 w-full"
                style={{ accentColor: brandBrightOklch }}
              />
            </div>

            <div className="flex flex-col gap-3.5 pt-1 sm:flex-row">
              <div className="flex flex-1 flex-col gap-[9px]">
                <div
                  className="flex h-[62px] items-center justify-center rounded-[10px] text-[15px] font-semibold text-white"
                  style={{ background: brandOklch }}
                >
                  White text
                </div>
                <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                  <ContrastPill ratio={brandContrast} />
                  <span className="text-xs text-ink-muted">buttons, the discount block</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-[9px]">
                <div
                  className="flex h-[62px] items-center justify-center rounded-[10px] text-[15px] font-semibold"
                  style={{ background: brandBrightOklch, color: inkOklch }}
                >
                  Dark text
                </div>
                <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                  <ContrastPill ratio={brandBrightContrast} />
                  <span className="text-xs text-ink-muted">links and icons on dark</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-[11px] rounded-[11px] bg-canvas-2 px-4 py-3.5">
              <InfoIcon />
              <p className="text-pretty text-xs leading-[1.55] text-[#3A332C]">
                Two shades come from your choice — a deeper one for filled buttons and a brighter
                one for links on the dark frame. Save is blocked while either falls below 4.5:1,
                which is why there is no hex field here.
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full max-w-[300px] shrink-0 flex-col gap-3 xl:sticky xl:top-6">
          <div className={sectionLabelClass}>Live preview</div>

          <div
            aria-hidden="true"
            className="w-[300px] max-w-full overflow-hidden rounded-2xl bg-[#171410] pb-3.5"
            style={{ fontFamily: previewBodyFont }}
          >
            <div className="flex h-10 items-center justify-between px-3.5">
              <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#B6AC9D]">
                ISC Brewers Guild
              </div>
              <div className="text-[9px]" style={{ color: brandBrightOklch }}>
                Members
              </div>
            </div>
            <div className="mx-2 flex flex-col rounded-[14px] bg-canvas">
              <div className="h-24 rounded-t-[14px] bg-canvas-2" />
              <div className="flex flex-col gap-[11px] px-3.5 pb-4">
                <div className="-mt-[22px] flex items-end gap-2.5">
                  <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-[3px] border-canvas bg-white text-[7px] tracking-[0.1em] text-ink-subtle">
                    LOGO
                  </div>
                  <div className="flex flex-col gap-0.5 pb-0.5">
                    <div
                      className="text-[17px] font-bold leading-[1.1] text-ink"
                      style={{ fontFamily: previewDisplayFont }}
                    >
                      Sample Brewing Co.
                    </div>
                    <div className="text-[11px] text-ink-muted">Riverside, CA</div>
                  </div>
                </div>
                <div className="text-xs leading-[1.45] text-[#3A332C]">
                  Small-batch ales, brewed down the street.
                </div>
                <div className="flex flex-col gap-2 rounded-xl bg-ink px-3.5 py-[13px]">
                  <div
                    className="text-lg font-bold leading-none text-canvas"
                    style={{ fontFamily: previewDisplayFont }}
                  >
                    Open now
                  </div>
                  <div className="flex gap-2">
                    <div
                      className="flex h-9 flex-1 items-center justify-center rounded-[9px] text-xs font-semibold text-white"
                      style={{ background: brandOklch }}
                    >
                      Directions
                    </div>
                    <div className="flex h-9 flex-1 items-center justify-center rounded-[9px] border border-[#4A4238] text-xs text-canvas">
                      Call
                    </div>
                  </div>
                </div>
                <div className="flex gap-[7px]">
                  {["Instagram", "Website", "Tap list"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-canvas-border px-[11px] py-1.5 text-[10px] text-ink"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] leading-normal text-ink-subtle">
            Updates as you choose. Nothing changes on the live site until you save.
          </p>
        </div>
      </div>
    </form>
  );
}
