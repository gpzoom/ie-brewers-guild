import { useEffect, useRef, useState } from "react";
import { getCounterPlate, resetPlateLink, type CounterPlate } from "@/lib/tap-card/plate.server";
import { CAPTIONED_QR_HEIGHT, SETUP_QR_SIZE, captionedQrDataUrl, qrCaptionLines } from "@/lib/tap-card/setup-qr";
import { REPRINT_NOTICE } from "@/lib/tap-card/print-kit/copy";

const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "That didn't work. Try again.";
}

/**
 * Portal/Admin > Scan Pass: the brewery's counter plate (customers check in
 * with their own phones). Full editors see it too, so no staff codes here.
 * Give it a key of the member; `staffVersion` changes when staff codes do.
 */
export function CounterPlateCard({ memberId, staffVersion }: { memberId: string; staffVersion: number }) {
  const [plate, setPlate] = useState<CounterPlate | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After a code is replaced, the printed kit is out of date (spec 2026-11-21). */
  const [reprint, setReprint] = useState(false);
  /** Goes up with each load and reset, so a late answer never replaces a newer one. */
  const latest = useRef(0);

  useEffect(() => {
    const load = ++latest.current;
    getCounterPlate({ data: { memberId } })
      .then((p) => {
        if (load !== latest.current) return;
        setPlate(p);
        setError(null);
      })
      .catch((err) => load === latest.current && setError(errorText(err)));
  }, [memberId, staffVersion]);

  useEffect(() => {
    setQr(null);
    if (!plate) return;
    let current = true;
    captionedQrDataUrl(plate.url, qrCaptionLines("plate", plate.printedCode))
      .then((d) => current && setQr(d))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [plate?.url, plate?.printedCode]);

  async function onReset() {
    if (!window.confirm("Make a new plate link? Your current plate will stop working.")) return;
    setBusy(true);
    setError(null);
    try {
      const next = await resetPlateLink({ data: { memberId } });
      latest.current++;
      setPlate(next);
      setReprint(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="tap-card-plate">
      <h2 id="tap-card-plate" className="font-display text-[18px] font-bold text-ink">
        Counter plate
      </h2>
      <p className="text-[13px] text-ink-muted">
        Customers scan this plate with their phones at your bar and choose a check-in or a reward. Then they scan a
        staff QR code to confirm.
      </p>
      {plate && (
        <>
          {qr && (
            <img
              src={qr}
              width={SETUP_QR_SIZE}
              height={CAPTIONED_QR_HEIGHT}
              alt={`QR code for your counter plate, code ${plate.printedCode}`}
              className="h-auto w-[300px] max-w-full rounded-md border border-canvas-border bg-white"
            />
          )}
          <div className="text-[13px] text-ink">
            Plate code <span className="font-semibold">{plate.printedCode}</span>
          </div>
          {!plate.plateOn && <p className="text-[13px] font-medium text-ink">Your plate is off until the owner or a co-owner sets up a staff code.</p>}
          <code className="break-all text-[12px] text-ink">{plate.url}</code>
          <div className="flex flex-wrap gap-2">
            {qr && (
              <a href={qr} download="counter-plate-qr.png" className={outlineClass}>
                Download QR code
              </a>
            )}
            <button type="button" className={outlineClass} disabled={busy} onClick={onReset}>
              Make a new plate link
            </button>
          </div>
        </>
      )}
      {reprint && (
        <p role="status" className="rounded-[9px] border border-canvas-border bg-canvas-2 px-3 py-2 text-[13px] font-medium text-ink">
          {REPRINT_NOTICE.plate}
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
