import { useEffect, useState, type FormEvent } from "react";
import {
  getStaffCodes,
  makeStaffCodes,
  removeStaff,
  renameStaff,
  replaceStaffCode,
  resetCounterQr,
  saveSharedCode,
  setSharedCodeOff,
  turnOffStaff,
  type StaffCodesView,
} from "@/lib/tap-card/staff-codes.server";
import { STAFF_CODES_OWNER_ONLY } from "@/lib/tap-card/staff-codes";
import {
  COUNTER_REPLACE_CONFIRM,
  NOBODY_CAN_TYPE_NOW,
  PLATE_IS_OFF,
  SHARED_OFF_LIVE_NOTE,
  endCodesConfirm,
  findByTypedName,
  makeConfirm,
  nobodyCanType,
  plateIsOff,
  replaceConfirm,
} from "@/lib/tap-card/staff-codes-screen";
import { captionedQrDataUrl, qrCaptionLines, staffQrFilename } from "@/lib/tap-card/setup-qr";
import { REPRINT_NOTICE } from "@/lib/tap-card/print-kit/copy";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const buttonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas hover:bg-ink/85 disabled:opacity-60";
const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";
const noticeClass = "rounded-[9px] border border-canvas-border bg-canvas-2 px-3 py-2 text-[13px] font-medium text-ink";
const rowClass = "flex flex-col gap-2 border-t border-canvas-border pt-3";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "That didn't work. Try again.";
}

type Person = StaffCodesView["staff"][number];
type Notice = "reprint" | "shared-saved";
/** Makes one change; true when it saved. */
type Run = (action: () => Promise<StaffCodesView>, notice?: Notice) => Promise<boolean>;
type Download = (url: string, printed: string, name: string | null) => void;

/**
 * Portal/Admin > Scan Pass > Staff QR codes (spec 2026-11-23): the
 * behind-the-counter QR, each named person's QR and 4-digit code, and the
 * shared code. Owners, co-owners and Guild admins only: hidden on the
 * server's refusal. Keyed by member, so one member's codes never show in
 * another's box.
 */
export function StaffCodesCard(props: { memberId: string; onChanged: () => void }) {
  return <MemberStaffCodes key={props.memberId} {...props} />;
}

function MemberStaffCodes({ memberId, onChanged }: { memberId: string; onChanged: () => void }) {
  const [view, setView] = useState<StaffCodesView | null>(null);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function fail(err: unknown) {
    const message = errorText(err);
    if (message === STAFF_CODES_OWNER_ONLY) {
      setView(null);
      setRefused(true);
    } else setError(message);
  }

  useEffect(() => {
    let current = true;
    getStaffCodes({ data: { memberId } })
      .then((v) => current && setView(v))
      .catch((err) => current && fail(err));
    return () => {
      current = false;
    };
  }, [memberId]);

  const run: Run = async (action, done) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setView(await action());
      setNotice(done ?? null);
      return true;
    } catch (err) {
      fail(err);
      // It may have partly saved (an old code already off), so show what's true now.
      await getStaffCodes({ data: { memberId } })
        .then(setView)
        .catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const onDownload: Download = (url, printed, name) => {
    setError(null);
    captionedQrDataUrl(url, qrCaptionLines("staff", printed, name))
      .then((image) => {
        const a = document.createElement("a");
        a.href = image;
        a.download = staffQrFilename(name);
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(() => setError("Couldn't make the QR image. Try again."));
  };

  if (refused || (!view && !error)) return null;

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="staff-codes">
      <h2 id="staff-codes" className="font-display text-[18px] font-bold text-ink">
        Staff QR codes
      </h2>
      {view && <StaffCodesBox memberId={memberId} view={view} busy={busy} run={run} onDownload={onDownload} />}
      {notice && (
        <p role="status" className={noticeClass}>
          {notice === "reprint" ? REPRINT_NOTICE.staff : "Saved. Share the new code with your staff."}
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

type BoxProps = { memberId: string; view: StaffCodesView; busy: boolean; run: Run; onDownload: Download };

export function StaffCodesBox({ memberId, view, busy, run, onDownload }: BoxProps) {
  function onResetCounter() {
    if (!window.confirm(COUNTER_REPLACE_CONFIRM)) return;
    void run(() => resetCounterQr({ data: { memberId } }), "reprint");
  }

  return (
    <>
      <p className="text-[13px] text-ink-muted">
        Your staff member holds up a staff QR code and the customer scans it to check in. Keep the codes out of customers&rsquo; reach. If you think one has been copied, make a new one: the old one
        stops working right away.
      </p>
      <div className={rowClass}>
        <div className="text-[14px] font-semibold text-ink">Behind the counter</div>
        <div className="text-[13px] text-ink">
          QR <span className="font-semibold">{view.counter.printed}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={outlineClass}
            aria-label="Download behind-the-counter QR"
            onClick={() => onDownload(view.counter.url, view.counter.printed, null)}
          >
            Download
          </button>
          <button type="button" className={outlineClass} disabled={busy} aria-label="Make a new one: behind-the-counter QR" onClick={onResetCounter}>
            Make a new one
          </button>
        </div>
      </div>
      {view.staff.map((person) => (
        <StaffRow key={person.id} person={person} memberId={memberId} view={view} busy={busy} run={run} onDownload={onDownload} />
      ))}
      <SharedCodeRow memberId={memberId} view={view} busy={busy} run={run} />
      <NewCodesForm memberId={memberId} view={view} busy={busy} run={run} />
    </>
  );
}

function StaffRow({ person, memberId, view, busy, run, onDownload }: BoxProps & { person: Person }) {
  const [more, setMore] = useState(false);
  const [name, setName] = useState(person.name);
  const { id, qr, pin } = person;
  const active = qr !== null || pin !== null;

  function onReplace(kind: "qr" | "pin") {
    const has = kind === "qr" ? qr !== null : pin !== null;
    if (has && !window.confirm(replaceConfirm(person.name, kind))) return;
    void run(() => replaceStaffCode({ data: { memberId, staffId: id, kind } }), kind === "qr" && has ? "reprint" : undefined);
  }

  function onTurnOff() {
    const ask = endCodesConfirm(view, person);
    if (ask && !window.confirm(ask)) return;
    void run(() => turnOffStaff({ data: { memberId, staffId: id } }));
  }

  function onRemove() {
    const ask = [`Remove ${person.name} from the list?`, endCodesConfirm(view, person)].filter(Boolean).join("\n\n");
    if (!window.confirm(ask)) return;
    void run(() => removeStaff({ data: { memberId, staffId: id } }));
  }

  async function onRename(event: FormEvent) {
    event.preventDefault();
    if (await run(() => renameStaff({ data: { memberId, staffId: id, name } }))) setMore(false);
  }

  return (
    <div className={rowClass}>
      <div className="text-[14px] [overflow-wrap:anywhere] font-semibold text-ink">{person.name}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink">
        {qr && (
          <span>
            QR <span className="font-semibold">{qr.printed}</span>
          </span>
        )}
        {pin !== null && (
          <span>
            Code <span className="font-semibold">{pin}</span>
          </span>
        )}
        {!active && <span className="text-ink-muted">off</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {qr && (
          <button type="button" className={outlineClass} aria-label={`Download QR for ${person.name}`} onClick={() => onDownload(qr.url, qr.printed, person.name)}>
            Download
          </button>
        )}
        {active ? (
          <>
            <button type="button" className={outlineClass} disabled={busy} aria-label={`New QR for ${person.name}`} onClick={() => onReplace("qr")}>
              New QR
            </button>
            <button type="button" className={outlineClass} disabled={busy} aria-label={`New code for ${person.name}`} onClick={() => onReplace("pin")}>
              New code
            </button>
            <button type="button" className={outlineClass} disabled={busy} aria-label={`Turn off codes for ${person.name}`} onClick={onTurnOff}>
              Turn off
            </button>
          </>
        ) : (
          <button
            type="button"
            className={outlineClass}
            disabled={busy}
            aria-label={`Make codes for ${person.name}`}
            onClick={() => void run(() => makeStaffCodes({ data: { memberId, name: person.name } }))}
          >
            Make codes
          </button>
        )}
        <button
          type="button"
          className={outlineClass}
          aria-expanded={more}
          aria-label={`More for ${person.name}`}
          onClick={() => {
            setName(person.name);
            setMore(!more);
          }}
        >
          More
        </button>
      </div>
      {more && (
        <form onSubmit={onRename} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-ink sm:w-[260px]">
            Name
            <input
              className={fieldClass}
              aria-label={`Name for ${person.name}`}
              autoComplete="off"
              maxLength={40}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={outlineClass} disabled={busy} aria-label={`Rename ${person.name}`}>
              Rename
            </button>
            <button type="button" className={outlineClass} disabled={busy} aria-label={`Remove ${person.name}`} onClick={onRemove}>
              Remove
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SharedCodeRow({ memberId, view, busy, run }: Omit<BoxProps, "onDownload">) {
  const { shared, canTurnSharedOff } = view;
  const [code, setCode] = useState(shared.code ?? "");
  useEffect(() => setCode(shared.code ?? ""), [shared.code]);

  function onSave(event: FormEvent) {
    event.preventDefault();
    void run(() => saveSharedCode({ data: { memberId, code } }), "shared-saved");
  }

  return (
    <div className={rowClass}>
      <form onSubmit={onSave} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          <span>
            <span className="text-[14px] font-semibold">Shared 4-digit code</span>
            {shared.off && <span className="text-ink-muted"> off</span>}
          </span>
          <input
            className={`${fieldClass} max-w-[140px] tracking-[0.3em]`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            disabled={busy}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass} disabled={busy} aria-label="Save shared 4-digit code">
            Save
          </button>
          {shared.code !== null && (
            <button
              type="button"
              className={outlineClass}
              disabled={busy || (!shared.off && !canTurnSharedOff)}
              aria-label={shared.off ? "Turn on shared 4-digit code" : "Turn off shared 4-digit code"}
              onClick={() => void run(() => setSharedCodeOff({ data: { memberId, off: !shared.off } }))}
            >
              {shared.off ? "Turn on" : "Turn off"}
            </button>
          )}
        </div>
      </form>
      <p className="text-[12px] text-ink-muted">
        If a staff QR code isn&rsquo;t handy, a staff member can type a 4-digit code on the customer&rsquo;s phone instead. A
        4-digit code is also needed to undo a reward.
      </p>
      {shared.code !== null && !shared.off && !canTurnSharedOff && (
        <p className="text-[12px] text-ink-muted">To turn the shared code off, give at least one staff member their own code first.</p>
      )}
      {shared.off && <p className="text-[12px] text-ink-muted">{SHARED_OFF_LIVE_NOTE}</p>}
      {plateIsOff(view) && <p className={noticeClass}>{PLATE_IS_OFF}</p>}
      {nobodyCanType(view) && <p className={noticeClass}>{NOBODY_CAN_TYPE_NOW}</p>}
    </div>
  );
}

const ADD_NAME = "add";

function NewCodesForm({ memberId, view, busy, run }: Omit<BoxProps, "onDownload">) {
  const [choice, setChoice] = useState("");
  const [typed, setTyped] = useState("");
  const adding = choice === ADD_NAME;
  const chosen = adding ? undefined : view.staff.find((p) => p.id === choice);

  async function onMake(event: FormEvent) {
    event.preventDefault();
    const person = adding ? findByTypedName(view, typed) : chosen;
    const name = adding ? typed : chosen?.name;
    if (name === undefined) return;
    const ask = makeConfirm(person);
    if (ask && !window.confirm(ask)) return;
    if (await run(() => makeStaffCodes({ data: { memberId, name } }), person?.qr ? "reprint" : undefined)) {
      setChoice("");
      setTyped("");
    }
  }

  return (
    <form onSubmit={onMake} className={rowClass}>
      <h3 className="font-display text-[16px] font-bold text-ink">New staff codes</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-ink sm:w-[260px]">
          Staff member
          <select className={fieldClass} required value={adding || chosen ? choice : ""} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose a name</option>
            {view.staff.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={ADD_NAME}>Add a name…</option>
          </select>
        </label>
        {adding && (
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-ink sm:w-[260px]">
            New name
            <input className={fieldClass} autoComplete="off" maxLength={40} required value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        <button type="submit" className={`${buttonClass} self-start sm:self-auto`} disabled={busy} aria-label="Make codes for the chosen staff member">
          Make codes
        </button>
      </div>
    </form>
  );
}
