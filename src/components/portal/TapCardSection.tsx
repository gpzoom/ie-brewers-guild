import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  createScannerDevice,
  listScannerDevices,
  revokeScannerDevice,
  type ScannerDeviceSummary,
} from "@/lib/tap-card/brewery-tap-card.server";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const buttonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas hover:bg-ink/85 disabled:opacity-60";
const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";
const cardClass = "flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "That didn't work. Try again.";
}

/**
 * Portal > Tap Card and /admin/tap-card: the brewery's bar devices (and,
 * below them, its offer -- `offerSlot`). A device is any phone or tablet
 * at the bar; opening its setup link once lets it check cards in.
 */
export function TapCardSection({ memberId, offerSlot }: { memberId: string; offerSlot?: ReactNode }) {
  const [devices, setDevices] = useState<ScannerDeviceSummary[] | null>(null);
  const [label, setLabel] = useState("");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function reload() {
    try {
      setDevices(await listScannerDevices({ data: { memberId } }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const result = await createScannerDevice({ data: { memberId, label } });
      setSetupUrl(result.setupUrl);
      setLabel("");
      await reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(device: ScannerDeviceSummary) {
    if (!window.confirm(`Turn off "${device.label}"? It won't be able to check cards in until you set it up again.`)) return;
    try {
      await revokeScannerDevice({ data: { memberId, deviceId: device.id } });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function onCopy() {
    if (!setupUrl) return;
    try {
      await navigator.clipboard.writeText(setupUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">Tap Card</h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          You&rsquo;re a stop on the Inland Tap Card trail. Customers&rsquo; cards are tapped on a bar device to record each
          visit and your first-beer offer.
        </p>
      </header>

      <section className={cardClass} aria-labelledby="tap-card-devices">
        <h2 id="tap-card-devices" className="font-display text-[18px] font-bold text-ink">
          Bar devices
        </h2>
        <p className="text-[13px] text-ink-muted">
          Add each phone or tablet your staff use at the bar. Open its setup link once on that device, in its usual web
          browser. After that, staff tap a customer&rsquo;s card on the device (or point its camera at the card&rsquo;s QR
          code) to check them in.
        </p>
        {devices === null ? (
          <p className="text-[13px] text-ink-muted">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No bar devices yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEAE1]">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-ink">{d.label}</div>
                  <div className="text-[12px] text-ink-muted">
                    {d.lastUsedAt ? `Last used ${new Date(d.lastUsedAt).toLocaleDateString("en-US")}` : "Not set up yet"}
                  </div>
                </div>
                <button type="button" className={outlineClass} onClick={() => onRevoke(d)}>
                  Turn off
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink">
            Add a device
            <input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bar iPad" maxLength={60} />
          </label>
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Adding…" : "Add device"}
          </button>
        </form>

        {setupUrl && (
          <div className="flex flex-col gap-2 rounded-xl border border-canvas-border bg-canvas px-4 py-3">
            <p className="text-[13px] font-semibold text-ink">Setup link — open it on the bar device. It&rsquo;s shown only once.</p>
            <code className="break-all text-[12px] text-ink">{setupUrl}</code>
            <div>
              <button type="button" className={outlineClass} onClick={onCopy}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </section>

      {offerSlot}
    </div>
  );
}
