import { cardUrl, formatCardCode } from "@/lib/tap-card/card-code";

/** The file sent to the card printer: one row per card (QR + NFC hold `url`; `printed_code` goes on the card face). */
export function batchCsv(siteUrl: string, codes: string[]): string {
  const rows = codes.map((code) => `${code},${formatCardCode(code)},${cardUrl(siteUrl, code)}`);
  return ["code,printed_code,url", ...rows].join("\n") + "\n";
}
