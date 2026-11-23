import { useState } from "react";
import { getCounterPlate } from "@/lib/tap-card/plate.server";
import { getStaffCodes } from "@/lib/tap-card/staff-codes.server";
import { getPrintKitInfo } from "@/lib/tap-card/print-kit.server";
import { kitErrorMessage, kitFileName, type KitPiece } from "@/lib/tap-card/print-kit/copy";

const outlineClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";

const PIECES: { piece: KitPiece; label: string }[] = [
  { piece: "counter-card", label: "4×6 counter card" },
  { piece: "table-tent", label: "Table tent" },
  { piece: "staff-cards", label: "Staff cards" },
];

function saveFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Portal/Admin > Scan Pass > Print kit (spec 2026-11-21): print-ready PDFs of
 * the counter plate and staff QR, made in the browser so the codes never
 * leave this computer. Codes and branding are fetched fresh on every click,
 * so a kit downloaded right after "Make a new plate link" has the new code.
 */
export function PrintKitCard({ memberId }: { memberId: string }) {
  const [busy, setBusy] = useState<KitPiece | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDownload(piece: KitPiece) {
    setBusy(piece);
    setError(null);
    try {
      const [plate, info, staffCodes, render, assets] = await Promise.all([
        getCounterPlate({ data: { memberId } }),
        getPrintKitInfo({ data: { memberId } }),
        // Owners only: the counter card and table tent never need it.
        piece === "staff-cards" ? getStaffCodes({ data: { memberId } }) : null,
        import("@/lib/tap-card/print-kit/render"),
        import("@/lib/tap-card/print-kit/assets"),
      ]);
      const [fonts, guildLogoPng, memberLogoPng] = await Promise.all([
        assets.loadKitFonts(),
        assets.loadGuildLogo(),
        assets.loadLogo(info.logoUrl),
      ]);
      const input = {
        memberName: info.memberName,
        memberSlug: info.memberSlug,
        trailStop: info.trailStop,
        logoTileColor: info.logoTileColor,
        plateUrl: plate.url,
        printedCode: plate.printedCode,
        staffQrUrl: staffCodes?.counter.url ?? "",
        staffQrPrinted: staffCodes?.counter.printed ?? "",
      };
      const images = { guildLogoPng, memberLogoPng };
      const build =
        piece === "counter-card"
          ? render.buildCounterCardsPdf
          : piece === "table-tent"
            ? render.buildTableTentPdf
            : render.buildStaffCardsPdf;
      saveFile(await build(input, fonts, images), kitFileName(piece, info.memberSlug));
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="print-kit">
      <h2 id="print-kit" className="font-display text-[18px] font-bold text-ink">
        Print kit
      </h2>
      <p className="text-[13px] text-ink-muted">
        Print-ready files for your counter. Print at 100% (Actual size) at home, or take the file to a print shop.
      </p>
      <div className="flex flex-wrap gap-2">
        {PIECES.map(({ piece, label }) => (
          <button key={piece} type="button" className={outlineClass} disabled={busy !== null} onClick={() => void onDownload(piece)}>
            {busy === piece ? "Making your PDF…" : label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
