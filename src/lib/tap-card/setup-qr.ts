import QRCode from "qrcode";

/**
 * The bar-device setup link as a QR code, so a member can print it in the
 * office and scan it with the bar phone's camera. Made in the browser -- the
 * link is a key to set up a bar device, so it never goes to a QR website.
 */
export const SETUP_QR_SIZE = 300;

export function setupQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: SETUP_QR_SIZE, margin: 2, errorCorrectionLevel: "M" });
}

export function setupQrFilename(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `bar-device-${slug}-qr.png` : "bar-device-qr.png";
}

/** The two lines printed under a counter plate or bartender QR image. */
export function qrCaptionLines(kind: "plate" | "bartender", printed: string): [string, string] {
  return [kind === "plate" ? "Counter plate" : "Bartender QR", printed];
}

export const CAPTIONED_QR_HEIGHT = 370;

/** In the browser: the QR with its name and code printed underneath, as one PNG. */
export async function captionedQrDataUrl(url: string, lines: [string, string]): Promise<string> {
  const qr = await setupQrDataUrl(url);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("QR image failed"));
    img.src = qr;
  });
  const canvas = document.createElement("canvas");
  canvas.width = SETUP_QR_SIZE;
  canvas.height = CAPTIONED_QR_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qr;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, SETUP_QR_SIZE, SETUP_QR_SIZE);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "14px sans-serif";
  ctx.fillText(lines[0], SETUP_QR_SIZE / 2, SETUP_QR_SIZE + 18);
  ctx.font = "bold 26px monospace";
  ctx.fillText(lines[1], SETUP_QR_SIZE / 2, SETUP_QR_SIZE + 52);
  return canvas.toDataURL("image/png");
}
