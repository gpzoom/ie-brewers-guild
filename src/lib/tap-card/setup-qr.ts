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
