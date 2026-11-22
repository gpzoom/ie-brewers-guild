import type { MobileIcon } from "@/lib/members/mobile-category";

/**
 * Map pins as SVG data URLs for google.maps.Marker icons (artboards B2,
 * B5, B6). Red location pins; orange when their member is highlighted;
 * bigger with an orange name label when focused. Mobile members: a teal
 * circle with their category's icon.
 */
export type PinLook = "normal" | "member" | "focused";
export type PinIcon = { url: string; width: number; height: number; anchorX: number; anchorY: number };

const RED = "#D93A2B";
const ORANGE = "#E8913A";
const TEAL = "#17605F";
const LABEL_H = 26;
const LABEL_GAP = 6;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function withLabel(body: string, bodyW: number, bodyH: number, label: string | undefined): PinIcon {
  if (!label) {
    return { url: toUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${bodyW}" height="${bodyH}" viewBox="0 0 ${bodyW} ${bodyH}">${body}</svg>`), width: bodyW, height: bodyH, anchorX: bodyW / 2, anchorY: bodyH };
  }
  const labelW = Math.round(16 + label.length * 7.4);
  const w = Math.max(bodyW, labelW);
  const h = LABEL_H + LABEL_GAP + bodyH;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="${(w - labelW) / 2}" y="0" width="${labelW}" height="${LABEL_H}" rx="6" fill="${ORANGE}"/>` +
    `<text x="${w / 2}" y="17.5" text-anchor="middle" font-family="Chivo, Arial, sans-serif" font-size="12" font-weight="700" fill="#171410">${esc(label)}</text>` +
    `<g transform="translate(${(w - bodyW) / 2},${LABEL_H + LABEL_GAP})">${body}</g></svg>`;
  return { url: toUrl(svg), width: w, height: h, anchorX: w / 2, anchorY: h };
}

const SCALE: Record<PinLook, number> = { normal: 1, member: 1.25, focused: 1.45 };

export function locationPinSvg(look: PinLook, label?: string): PinIcon {
  const s = SCALE[look];
  const w = Math.round(24 * s);
  const h = Math.round(34 * s);
  const fill = look === "normal" ? RED : ORANGE;
  const body =
    `<g transform="scale(${s})"><path d="M12 33 C9 24 1 20 1 12 A11 11 0 0 1 23 12 C23 20 15 24 12 33Z" fill="${fill}" stroke="#FFFFFF" stroke-width="1.5"/>` +
    `<circle cx="12" cy="12" r="4" fill="#FFFFFF"/></g>`;
  return withLabel(body, w, h, look === "focused" ? label : undefined);
}

/**
 * A Beer Trail stop (owner 2026-11-21, option C "Golden pour"): a green pin
 * with a golden mug of beer and a white foam head. Drawn in a 40x52 box, the
 * same art as public/tap-card/trail-pin.svg. Highlighted, it grows like the
 * red pins and gets an orange outline instead of turning orange.
 */
const TRAIL_GREEN = "#2E7D3A";
const TRAIL_PIN_BODY =
  '<path d="M23.5 18.2h2.2a2.6 2.6 0 0 1 2.6 2.6v2.6a2.6 2.6 0 0 1-2.6 2.6h-2.2" fill="none" stroke="#FFFFFF" stroke-width="2"/>' +
  '<rect x="11.5" y="16" width="12" height="12.4" rx="1.8" fill="#F2B233" stroke="#FFFFFF" stroke-width="1.4"/>' +
  '<g fill="#FFF6DA"><circle cx="15" cy="22" r=".8"/><circle cx="19.5" cy="24.6" r=".7"/><circle cx="17.8" cy="20.4" r=".6"/></g>' +
  '<g fill="#FFFFFF"><circle cx="12.6" cy="15.4" r="2.5"/><circle cx="15.9" cy="13.1" r="3.1"/>' +
  '<circle cx="19.6" cy="13.5" r="2.9"/><circle cx="22.4" cy="15.5" r="2.3"/><rect x="11.2" y="14.6" width="12.6" height="3"/></g>';

export function trailPinSvg(look: PinLook, label?: string): PinIcon {
  const s = SCALE[look];
  const w = Math.round(31 * s);
  const h = Math.round(40 * s);
  const outline = look === "normal" ? '#1C5226" stroke-width="1.2' : `${ORANGE}" stroke-width="2.6`;
  const body =
    `<g transform="scale(${(31 / 40) * s})"><path data-trail="1" d="M20 1C9.5 1 1 9.3 1 19.6c0 13.6 16.6 29.6 18.1 31a1.3 1.3 0 0 0 1.8 0C22.4 49.2 39 33.2 39 19.6 39 9.3 30.5 1 20 1z" fill="${TRAIL_GREEN}" stroke="${outline}"/>` +
    `${TRAIL_PIN_BODY}</g>`;
  return withLabel(body, w, h, look === "focused" ? label : undefined);
}

const GLYPHS: Record<MobileIcon, string> = {
  truck: '<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  tent: '<path d="M3 20L12 4l9 16zM12 4v16M8.5 20l3.5-6 3.5 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};

export function mobilePinSvg(icon: MobileIcon, look: PinLook, label?: string): PinIcon {
  const s = SCALE[look];
  const d = Math.round(32 * s);
  const stroke = look === "normal" ? "#FFFFFF" : ORANGE;
  const body =
    `<g transform="scale(${s})"><circle cx="16" cy="16" r="14.5" fill="${TEAL}" stroke="${stroke}" stroke-width="2.5"/>` +
    `<g data-icon="${icon}" transform="translate(7,7) scale(0.75)" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[icon]}</g></g>`;
  const pin = withLabel(body, d, d, look === "focused" ? label : undefined);
  // A circle's "tip" is its center-bottom, like the location pins.
  return pin;
}

const INK = "#171410";

/**
 * A cluster's count bubble (spec "Map behavior" > "Clustering"): neutral
 * dark ink so it never reads as a member's red or teal pin. It marks an
 * area, not a spot, so it's anchored at its center.
 */
export function clusterPinSvg(count: number): PinIcon {
  const d = count >= 5 ? 40 : 34;
  const r = d / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${INK}" stroke="#FFFFFF" stroke-width="2"/>` +
    `<text x="${r}" y="${r + 5}" text-anchor="middle" font-family="Chivo, Arial, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">${count}</text></svg>`;
  return { url: toUrl(svg), width: d, height: d, anchorX: r, anchorY: r };
}
