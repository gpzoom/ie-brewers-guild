import { describe, expect, it } from "vitest";
import { SETUP_QR_SIZE, qrCaptionLines, setupQrDataUrl, setupQrFilename } from "@/lib/tap-card/setup-qr";

function pngSize(dataUrl: string) {
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("setupQrDataUrl", () => {
  it("makes a 300 x 300 PNG", async () => {
    const dataUrl = await setupQrDataUrl("https://example.com/scanner/abc123");
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(SETUP_QR_SIZE).toBe(300);
    expect(pngSize(dataUrl)).toEqual({ width: 300, height: 300 });
  });

  it("gives different links different codes", async () => {
    expect(await setupQrDataUrl("https://example.com/scanner/aaa")).not.toBe(await setupQrDataUrl("https://example.com/scanner/bbb"));
  });
});

describe("setupQrFilename", () => {
  it("names the file after the device", () => {
    expect(setupQrFilename("Bar iPad #2")).toBe("bar-device-bar-ipad-2-qr.png");
  });

  it("falls back when the name has nothing usable", () => {
    expect(setupQrFilename("")).toBe("bar-device-qr.png");
    expect(setupQrFilename("!!!")).toBe("bar-device-qr.png");
  });
});

describe("qrCaptionLines", () => {
  it("names the QR and shows its code", () => {
    expect(qrCaptionLines("plate", "ABCD-1234")).toEqual(["Counter plate", "ABCD-1234"]);
    expect(qrCaptionLines("staff", "WXYZ-5678")).toEqual(["Staff QR", "WXYZ-5678"]);
  });
});
