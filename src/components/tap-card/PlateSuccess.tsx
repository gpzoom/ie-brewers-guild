import { useEffect, useState, type FormEvent } from "react";
import { undoAtPlate, type PlateResult } from "@/lib/tap-card/plate.server";
import { CanvasHeading, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { outcomeMessage } from "@/components/tap-card/CheckInScreen";
import { successLinks } from "@/lib/tap-card/card-app";
import { STAFF_QR_TURNED_OFF } from "@/lib/tap-card/staff-qr";

export type PlateOk = Extract<PlateResult, { kind: "ok" }>;

const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Los_Angeles" });

/** Ticks every second, so a screenshot of an old success screen is easy to spot. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[22px] font-semibold tabular-nums text-[#05603A]" aria-label="Current time">
      {clock(now)}
    </span>
  );
}

export function plateRefusal(result: Exclude<PlateResult, PlateOk> | { kind: "scan-again" }): string {
  switch (result.kind) {
    case "wrong-code":
      return `That code isn't right. ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.`;
    case "locked":
      return "Too many tries. Ask a staff member to try again in 15 minutes.";
    case "signed-out":
      return "You've been signed out. Scan the staff QR code again to sign in.";
    case "turned-off":
      return STAFF_QR_TURNED_OFF;
    case "closed":
      return "This taproom isn't taking check-ins right now. Ask a staff member for help.";
    case "scan-again":
      return "Finish your check-in within 5 minutes of scanning the staff QR code.";
  }
}

/** Only a reward used on this very tap asks staff to pour; showing the screen again doesn't. */
export function successUsedLine(outcome: PlateOk["outcome"], usedAt?: string | null): string {
  if (outcome === "used") return "Used just now. Staff member: please pour.";
  if (!usedAt) return "Already used earlier today.";
  const time = new Date(usedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  // Some browsers put a narrow no-break space before AM/PM.
  return `Already used earlier today at ${time.replace(/s/g, " ")}.`;
}

function StaffCodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className={`${labelClass} flex flex-col gap-1.5`}>
      Staff member: staff code
      <input
        className={`${inputClass} max-w-[160px] text-center text-[22px] tracking-[0.3em]`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        pattern="[0-9]{4}"
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
    </label>
  );
}

/** The staff member's 4-digit staff code, then the call (the backup to the staff QR). */
export function StaffCodeForm({ label, onSubmit }: { label: string; onSubmit: (staffCode: string) => Promise<PlateResult> }) {
  const [staffCode, setStaffCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(staffCode);
      if (result.kind !== "ok") setError(plateRefusal(result));
      setStaffCode("");
    } catch {
      setError("That didn't save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <StaffCodeField value={staffCode} onChange={setStaffCode} />
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </form>
  );
}

/** The green screen the customer shows the staff member. */
export function PlateSuccess({
  memberName,
  memberSlug,
  plateCode,
  initial,
}: {
  memberName: string;
  memberSlug: string;
  plateCode: string;
  initial: PlateOk;
}) {
  const [done, setDone] = useState(initial);
  const [undoing, setUndoing] = useState(false);
  const [confirmedAt] = useState(() => new Date());
  const { state } = done;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col items-center gap-3 rounded-[18px] border-2 border-[#12B76A] bg-[#ECFDF3] px-5 py-6 text-center">
        {/* Far away, no location or outside open hours at the check-in or reward. */}
        {done.flagged && <span role="img" aria-label="Flagged" className="absolute right-3 top-3 size-6 rounded-full border-2 border-white bg-[#FF0000]" />}
        <span className="relative flex size-16 items-center justify-center" aria-hidden="true">
          <span className="absolute inline-flex size-full rounded-full bg-[#12B76A] opacity-40 motion-safe:animate-ping" />
          <span className="relative inline-flex size-16 items-center justify-center rounded-full bg-[#12B76A] text-[34px] font-bold text-white">✓</span>
        </span>
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#05603A]">{memberName}</p>
        <CanvasHeading size="md">{state.firstToday ? `Visit #${state.visitNumber} recorded` : `Checked in today — visit #${state.visitNumber}`}</CanvasHeading>
        {state.used && <p className="text-[22px] font-bold text-ink">{state.used.reward}</p>}
        {state.used && <p className="text-[14px] text-ink">{successUsedLine(done.outcome, done.usedAt)}</p>}
        <LiveClock />
        <p className="text-[12px] text-ink-muted">Confirmed at {clock(confirmedAt)}</p>
      </div>
      {[...state.newlyEarned, ...done.milestoneRewards].map((r) => (
        <p key={r} className="text-[15px] text-ink">
          🎉 You just earned: {r}
        </p>
      ))}
      {outcomeMessage(done.outcome) && <p className={leadClass}>{outcomeMessage(done.outcome)}</p>}
      {done.outcome === "undone" && <p className={leadClass}>Put back on your pass.</p>}
      {state.used &&
        (undoing ? (
          <StaffCodeForm
            label="Undo"
            onSubmit={async (staffCode) => {
              const result = await undoAtPlate({ data: { code: plateCode, staffCode } });
              if (result.kind === "ok") {
                setDone({ ...result, flagged: done.flagged });
                setUndoing(false);
              }
              return result;
            }}
          />
        ) : (
          <button type="button" className="w-fit text-[14px] font-medium text-brand underline underline-offset-2" onClick={() => setUndoing(true)}>
            Undo (staff code)
          </button>
        ))}
      <nav aria-label="Where to next" className="mt-2 flex flex-col gap-2">
        {successLinks({ memberName, memberSlug }).map((l) => (
          <a key={l.href} href={l.href} className={secondaryButtonClass}>
            {l.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
