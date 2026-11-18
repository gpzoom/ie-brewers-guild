import { useEffect, useState, type FormEvent } from "react";
import { getCounterPlate, resetPlateLink, resetStaffQr, saveStaffCode, type CounterPlate } from "@/lib/tap-card/plate.server";
import { SETUP_QR_SIZE, setupQrDataUrl } from "@/lib/tap-card/setup-qr";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const buttonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas hover:bg-ink/85 disabled:opacity-60";
const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "That didn't work. Try again.";
}

/** Portal/Admin > Tap Card: the brewery's counter plate (no bar device needed for smartphone customers). */
export function CounterPlateCard({ memberId }: { memberId: string }) {
  const [plate, setPlate] = useState<CounterPlate | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [staffQr, setStaffQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCounterPlate({ data: { memberId } })
      .then((p) => {
        setPlate(p);
        setCode(p.staffCode ?? "");
      })
      .catch((err) => setError(errorText(err)));
  }, [memberId]);

  useEffect(() => {
    setQr(null);
    if (!plate) return;
    let current = true;
    setupQrDataUrl(plate.url).then((d) => current && setQr(d)).catch(() => undefined);
    return () => {
      current = false;
    };
  }, [plate?.url]);

  useEffect(() => {
    setStaffQr(null);
    if (!plate) return;
    let current = true;
    setupQrDataUrl(plate.staffQrUrl).then((d) => current && setStaffQr(d)).catch(() => undefined);
    return () => {
      current = false;
    };
  }, [plate?.staffQrUrl]);

  async function onResetStaffQr() {
    if (!window.confirm("Make a new bartender QR code? The one you have now will stop working right away.")) return;
    setBusy(true);
    setError(null);
    try {
      setPlate(await resetStaffQr({ data: { memberId } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveStaffCode({ data: { memberId, staffCode: code } });
      setPlate((p) => (p ? { ...p, staffCode: code } : p));
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!window.confirm("Make a new plate link? Your current plate will stop working.")) return;
    setBusy(true);
    setError(null);
    try {
      setPlate(await resetPlateLink({ data: { memberId } }));
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
        Customers with a smartphone tap or scan this plate at your bar and choose a check-in or a reward. Then they scan
        your bartender QR code (below) to confirm. Customers with only a plastic card still need a bar device.
      </p>
      {plate && (
        <>
          {qr && (
            <img
              src={qr}
              width={SETUP_QR_SIZE}
              height={SETUP_QR_SIZE}
              alt="QR code for your counter plate"
              className="size-[300px] max-w-full rounded-md border border-canvas-border bg-white"
            />
          )}
          <div className="text-[13px] text-ink">
            Plate code <span className="font-semibold">{plate.printedCode}</span>
          </div>
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
          <h3 className="mt-2 font-display text-[16px] font-bold text-ink">Bartender QR code</h3>
          <p className="text-[13px] text-ink-muted">
            Print this and keep it behind the counter, out of customers&rsquo; reach. After a customer chooses at the plate, your
            bartender holds it up and the customer scans it to confirm. If you think someone has copied it, make a new one: the old
            one stops working right away.
          </p>
          {staffQr && (
            <img
              src={staffQr}
              width={SETUP_QR_SIZE}
              height={SETUP_QR_SIZE}
              alt="Bartender QR code"
              className="size-[220px] max-w-full rounded-md border border-canvas-border bg-white"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {staffQr && (
              <a href={staffQr} download="bartender-qr.png" className={outlineClass}>
                Download bartender QR
              </a>
            )}
            <button type="button" className={outlineClass} disabled={busy} onClick={onResetStaffQr}>
              Make a new bartender QR
            </button>
          </div>
          <h3 className="mt-2 font-display text-[16px] font-bold text-ink">Staff code (backup)</h3>
          <p className="text-[13px] text-ink-muted">
            If the bartender QR code isn&rsquo;t handy, your bartender can type this code on the customer&rsquo;s phone instead. It&rsquo;s
            also needed to undo a reward.
          </p>
          <form onSubmit={onSave} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
              Staff code (4 digits)
              <input
                className={`${fieldClass} max-w-[140px] tracking-[0.3em]`}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={code}
                onChange={(e) => {
                  setSaved(false);
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                }}
              />
            </label>
            <button type="submit" className={buttonClass} disabled={busy}>
              Save
            </button>
          </form>
          <p className="text-[12px] text-ink-muted">
            {plate.staffCode
              ? saved
                ? "Saved. Share the new code with your staff."
                : "Your plate is on. Change the code whenever staff change."
              : "Set a staff code to turn your plate on."}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
