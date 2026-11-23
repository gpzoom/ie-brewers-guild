import { useEffect, useRef, useState } from "react";
import { getCounterPlate } from "@/lib/tap-card/plate.server";
import { getStaffCodes, type StaffCodesView } from "@/lib/tap-card/staff-codes.server";
import { STAFF_CODES_OWNER_ONLY } from "@/lib/tap-card/staff-codes";
import { staffCardChoice } from "@/lib/tap-card/staff-codes-screen";
import { getPrintKitInfo } from "@/lib/tap-card/print-kit.server";
import { kitErrorMessage, kitFileName, type KitPiece } from "@/lib/tap-card/print-kit/copy";

const outlineClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";

const PIECES: { piece: KitPiece; label: string }[] = [
  { piece: "counter-card", label: "4×6 counter card" },
  { piece: "table-tent", label: "Table tent" },
];

type Person = { id: string; name: string };

/** Only names are kept for the list: the codes are fetched when one is printed. */
function withQr(view: StaffCodesView): Person[] {
  return view.staff.filter((p) => p.qr !== null).map(({ id, name }) => ({ id, name }));
}

function isOwnerOnly(err: unknown) {
  return err instanceof Error && err.message === STAFF_CODES_OWNER_ONLY;
}

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
 * so a kit downloaded right after a code is replaced has the new code. Staff
 * cards are for owners only. Give it a key of the member; `staffVersion`
 * changes when staff codes do.
 */
export function PrintKitCard({ memberId, staffVersion }: { memberId: string; staffVersion: number }) {
  const [busy, setBusy] = useState<KitPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Whose QR can be printed; null hides "Staff cards" (not loaded, or a full editor). */
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const chosenId = people?.some((p) => p.id === staffId) ? staffId : "";

  /** False once this card is gone (left the page, or another member chosen): nothing is saved after that. */
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    getStaffCodes({ data: { memberId } })
      .then((v) => {
        if (!current) return;
        setPeople(withQr(v));
        setLoadError(null);
      })
      .catch((err) => {
        if (!current) return;
        setPeople(null);
        setLoadError(isOwnerOnly(err) ? null : err instanceof Error ? err.message : "That didn't load. Refresh the page.");
      });
    return () => {
      current = false;
    };
  }, [memberId, staffVersion]);

  async function onDownload(piece: KitPiece) {
    setBusy(piece);
    setError(null);
    try {
      // Fixed now, so the card printed is the one chosen when clicked.
      const printFor = chosenId;
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
      };
      const images = { guildLogoPng, memberLogoPng };
      if (staffCodes) {
        if (!shown.current) return;
        setPeople(withQr(staffCodes));
        const card = staffCardChoice(staffCodes, printFor);
        const pdf = await render.buildStaffCardsPdf({ ...input, ...card }, fonts, images);
        if (shown.current) saveFile(pdf, kitFileName(piece, info.memberSlug, card.staffName));
      } else {
        const build = piece === "counter-card" ? render.buildCounterCardsPdf : render.buildTableTentPdf;
        const pdf = await build(input, fonts, images);
        if (shown.current) saveFile(pdf, kitFileName(piece, info.memberSlug));
      }
    } catch (err) {
      if (!shown.current) return;
      if (isOwnerOnly(err)) setPeople(null);
      setError(kitErrorMessage(err));
    } finally {
      if (shown.current) setBusy(null);
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
      {people && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-ink sm:w-[260px]">
            Staff cards for
            <select
              className="h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              value={chosenId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">Behind the counter</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${outlineClass} self-start sm:self-auto`}
            disabled={busy !== null}
            onClick={() => void onDownload("staff-cards")}
          >
            {busy === "staff-cards" ? "Making your PDF…" : "Staff cards"}
          </button>
        </div>
      )}
      {loadError && (
        <p role="alert" className="text-[13px] text-danger">
          {loadError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
