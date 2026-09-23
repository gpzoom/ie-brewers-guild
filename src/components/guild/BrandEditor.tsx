import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { saveBrandSettings } from "@/lib/brand/brand-settings.server";
import { DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import { DEFAULT_FONT_PAIRING_ID, FONT_PAIRINGS } from "@/lib/brand/font-pairings";
import { contrastRatioOfOklchStrings, parseOklch } from "@/lib/brand/contrast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BRAND_CHROMA = 0.15;
const BRAND_BRIGHT_CHROMA = 0.165;

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

/**
 * Colour is edited as a brand hue and lightness, with live contrast
 * readouts, not raw hex (spec, "Editing the brand from the admin"). Only
 * --brand and --brand-bright are exposed here (this plan's Decision 11) --
 * a shared hue, and one lightness slider per tier, each paired with the
 * fixed text colour it actually carries in production (white on --brand,
 * --ink on --brand-bright).
 */
export function BrandEditor({
  settings,
}: {
  settings: { fontPairingId: string; tokens: BrandTokens } | null;
}) {
  const router = useRouter();
  const currentTokens = settings?.tokens ?? DEFAULT_BRAND_TOKENS;
  const initialBrand = parseOklch(currentTokens.brand);
  const initialBrandBright = parseOklch(currentTokens["brand-bright"]);

  const [hue, setHue] = useState(initialBrand.h);
  const [brandLightness, setBrandLightness] = useState(initialBrand.l);
  const [brandBrightLightness, setBrandBrightLightness] = useState(initialBrandBright.l);
  const [fontPairingId, setFontPairingId] = useState(settings?.fontPairingId ?? DEFAULT_FONT_PAIRING_ID);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const brandOklch = `oklch(${brandLightness} ${BRAND_CHROMA} ${hue})`;
  const brandBrightOklch = `oklch(${brandBrightLightness} ${BRAND_BRIGHT_CHROMA} ${hue})`;
  const inkOklch = currentTokens.ink;

  const brandContrast = useMemo(() => contrastRatioOfOklchStrings(brandOklch, "oklch(1 0 0)"), [brandOklch]);
  const brandBrightContrast = useMemo(
    () => contrastRatioOfOklchStrings(brandBrightOklch, inkOklch),
    [brandBrightOklch, inkOklch],
  );

  const brandPasses = brandContrast >= 4.5;
  const brandBrightPasses = brandBrightContrast >= 4.5;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    try {
      await saveBrandSettings({ data: { hue, brandLightness, brandBrightLightness, fontPairingId } });
      await router.invalidate();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the brand settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <div>
        <Label htmlFor="brand-font-pairing">Typefaces</Label>
        <Select value={fontPairingId} onValueChange={setFontPairingId}>
          <SelectTrigger id="brand-font-pairing" className="mt-1 h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_PAIRINGS.map((pairing) => (
              <SelectItem key={pairing.id} value={pairing.id}>
                {pairing.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="brand-hue">Brand hue ({Math.round(hue)}°)</Label>
        <input
          id="brand-hue"
          type="range"
          min={0}
          max={359}
          step={1}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
          className="mt-1 h-11 w-full"
        />
      </div>

      <div className="rounded-md border border-border p-4" style={{ background: brandOklch, color: "white" }}>
        <Label htmlFor="brand-lightness" className="text-white">
          --brand lightness ({brandLightness.toFixed(2)}) — white text
        </Label>
        <input
          id="brand-lightness"
          type="range"
          min={0.2}
          max={0.85}
          step={0.01}
          value={brandLightness}
          onChange={(e) => setBrandLightness(Number(e.target.value))}
          className="mt-1 h-11 w-full"
        />
        <p className="mt-2 text-sm">
          Contrast with white text: {formatRatio(brandContrast)} —{" "}
          {brandPasses ? "passes 4.5:1" : "fails 4.5:1, cannot save"}
        </p>
      </div>

      <div className="rounded-md border border-border p-4" style={{ background: brandBrightOklch, color: inkOklch }}>
        <Label htmlFor="brand-bright-lightness" style={{ color: inkOklch }}>
          --brand-bright lightness ({brandBrightLightness.toFixed(2)}) — dark text
        </Label>
        <input
          id="brand-bright-lightness"
          type="range"
          min={0.5}
          max={0.9}
          step={0.01}
          value={brandBrightLightness}
          onChange={(e) => setBrandBrightLightness(Number(e.target.value))}
          className="mt-1 h-11 w-full"
        />
        <p className="mt-2 text-sm" style={{ color: inkOklch }}>
          Contrast with dark text: {formatRatio(brandBrightContrast)} —{" "}
          {brandBrightPasses ? "passes 4.5:1" : "fails 4.5:1, cannot save"}
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={saving || !brandPasses || !brandBrightPasses} className="h-11">
        {saving ? "Saving…" : "Save brand settings"}
      </Button>
    </form>
  );
}
