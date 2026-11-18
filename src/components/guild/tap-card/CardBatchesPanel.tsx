import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  MAX_BATCH,
  createCardBatch,
  deleteTestBatch,
  downloadBatchCsv,
  type CardBatchSummary,
} from "@/lib/tap-card/batches.server";
import { downloadPlateLinksCsv } from "@/lib/tap-card/plate.server";
import {
  StatusMessage,
  cardClass,
  darkButtonClass,
  errorText,
  fieldClass,
  outlineButtonClass,
  type Message,
} from "@/components/guild/settings-ui";

function saveFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Guild > Tap Card > Cards: make a print run, download it for the printer, clean up test cards. */
export function CardBatchesPanel({ batches }: { batches: CardBatchSummary[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [count, setCount] = useState("100");
  const [isTest, setIsTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await createCardBatch({ data: { label, count: Number(count), isTest } });
      setLabel("");
      setMessage({ kind: "ok", text: "Batch made. Download it for the printer below." });
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(batchId: string) {
    try {
      const file = await downloadBatchCsv({ data: { batchId } });
      saveFile(file.filename, file.csv);
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  async function onDownloadPlates() {
    try {
      const file = await downloadPlateLinksCsv();
      saveFile(file.filename, file.csv);
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  async function onDelete(batch: CardBatchSummary) {
    if (!window.confirm(`Delete the test batch "${batch.label}", its cards, and the test card holders on it?`)) return;
    try {
      await deleteTestBatch({ data: { batchId: batch.id } });
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <form onSubmit={onCreate} className={cardClass}>
        <h2 className="font-display text-[18px] font-bold text-ink">Make a batch of cards</h2>
        <p className="text-[13px] text-ink-muted">
          Each card gets its own code. The file you download has the link for each card's chip and QR code, and the code to
          print on the card. Every card works at every stop on the trail. Make real print runs on the live site so the links
          point there.
        </p>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          Batch name
          <input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Spring 2027 print run" required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          Number of cards
          <input className={fieldClass} type="number" min={1} max={MAX_BATCH} value={count} onChange={(e) => setCount(e.target.value)} required />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="size-4" />
          Test cards (for trying things out; can be deleted with everything recorded on them)
        </label>
        <div>
          <button type="submit" disabled={busy} className={darkButtonClass}>
            {busy ? "Making cards…" : "Make cards"}
          </button>
        </div>
        <StatusMessage message={message} />
      </form>

      <div className="overflow-x-auto rounded-[14px] border border-canvas-border bg-white">
        <table className="w-full min-w-[460px] text-left text-[13px] text-ink">
          <thead className="border-b border-[#E6E0D6] bg-[#FCFAF6] text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Batch</th>
              <th className="px-3 py-3 font-semibold">Activated</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-ink-muted">
                  No cards yet.
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-[#EFEAE1] last:border-0">
                <td className="px-5 py-3">
                  <span className="font-medium">{b.label}</span>
                  {b.isTest && <span className="ml-2 rounded-full bg-canvas-2 px-2 py-0.5 text-[11px] text-ink-muted">Test</span>}
                  <div className="text-[12px] text-ink-muted">{new Date(b.createdAt).toLocaleDateString("en-US")}</div>
                </td>
                <td className="px-3 py-3">
                  {b.activated} of {b.count}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => onDownload(b.id)} className={outlineButtonClass}>
                      Download for printer
                    </button>
                    {b.isTest && (
                      <button type="button" onClick={() => onDelete(b)} className={outlineButtonClass}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={cardClass}>
        <h2 className="font-display text-[18px] font-bold text-ink">Counter plates</h2>
        <p className="text-[13px] text-ink-muted">
          One plate per trail stop. The file has each brewery&rsquo;s plate link for the plate&rsquo;s chip and QR code, and the
          code to print on it. Make it on the live site so the links point there.
        </p>
        <div>
          <button type="button" onClick={onDownloadPlates} className={outlineButtonClass}>
            Download counter plate links
          </button>
        </div>
      </section>
    </div>
  );
}
