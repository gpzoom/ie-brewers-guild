/**
 * Browser-only loaders for the print kit: the embedded fonts, and logos
 * turned into PNG bytes through a canvas (so WebP and SVG logos embed in a
 * PDF). Import this lazily from the click handler only.
 */
import guildLogoUrl from "@/assets/logo.svg";
import type { KitFontBytes } from "./types";

const FONT_BASE = "/fonts/print-kit/";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadKitFonts(): Promise<KitFontBytes> {
  const [heading, body, bodySemi] = await Promise.all([
    fetchBytes(`${FONT_BASE}BricolageGrotesque-ExtraBold.ttf`),
    fetchBytes(`${FONT_BASE}Chivo-Regular.ttf`),
    fetchBytes(`${FONT_BASE}Chivo-SemiBold.ttf`),
  ]);
  return { heading, body, bodySemi };
}

/**
 * PNG bytes of the image at url, at most maxPx on its longest side; null on
 * any failure, including no answer within timeoutMs (so a stalled logo
 * request never leaves the Print kit buttons stuck).
 */
export async function loadLogo(url: string | null, maxPx = 1200, timeoutMs = 10_000): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let timer: ReturnType<typeof setTimeout> | undefined;
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("logo timed out")), timeoutMs);
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo failed to load"));
      img.src = url;
    }).finally(() => clearTimeout(timer));
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(1, maxPx / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** The Guild logo (an SVG), rasterized for print. */
export function loadGuildLogo(): Promise<Uint8Array | null> {
  return loadLogo(guildLogoUrl, 1200);
}
