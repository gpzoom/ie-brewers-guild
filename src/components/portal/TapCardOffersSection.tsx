import { useEffect, useState, type FormEvent } from "react";
import {
  getMemberOffers,
  removeMemberOffer,
  saveRewardExpiry,
  submitMemberOffer,
  withdrawMemberOfferDraft,
  type MemberOffersData,
} from "@/lib/tap-card/member-offers.server";
import { EXPIRY_CHOICES, REWARD_MAX, TERMS_MAX, offerLabel, type OfferSlot } from "@/lib/tap-card/loyalty";
import type { SlotView } from "@/lib/tap-card/member-offers-view";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const buttonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas hover:bg-ink/85 disabled:opacity-60";
const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-medium text-ink";
const eyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted";

const SLOT_NAME: Record<OfferSlot, string> = { step1: "Step 1", step2: "Step 2", step3: "Step 3", repeat: "Repeating" };
const EXPIRY_LABEL: Record<number, string> = { 30: "30 days", 60: "60 days", 90: "90 days", 365: "1 year" };

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "That didn't work. Try again.";
}

function statusText(v: SlotView): string | null {
  if (v.draft?.status === "declined") return "Not approved";
  if (v.live && v.draft) return "Approved · change waiting for approval";
  if (v.draft) return "Waiting for approval";
  if (v.live) return "Approved";
  return null;
}

type Form = { slot: OfferSlot; template: string; visitNumber: string; reward: string; terms: string };

function OfferForm({
  form,
  setForm,
  templates,
  busy,
  onSubmit,
  onCancel,
}: {
  form: Form;
  setForm: (f: Form) => void;
  templates: MemberOffersData["templates"];
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  const repeat = form.slot === "repeat";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-canvas-border bg-canvas px-4 py-4">
      <div className="text-[14px] font-semibold text-ink">{SLOT_NAME[form.slot]}</div>
      <label className={labelClass}>
        Start from
        <select
          className={fieldClass}
          value={form.template}
          onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            setForm(t ? { ...form, template: t.id, reward: t.reward, terms: t.terms } : { ...form, template: "" });
          }}
        >
          <option value="">Start from scratch</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {repeat ? "Every how many visits?" : "On visit number"}
        <input
          className={`${fieldClass} max-w-[120px]`}
          type="number"
          min={2}
          step={1}
          inputMode="numeric"
          required
          value={form.visitNumber}
          onChange={(e) => setForm({ ...form, visitNumber: e.target.value })}
        />
      </label>
      <label className={labelClass}>
        Reward
        <input className={fieldClass} required maxLength={REWARD_MAX} value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
      </label>
      <label className={labelClass}>
        Terms (optional)
        <textarea
          className={`${fieldClass} h-auto min-h-[72px] py-2`}
          maxLength={TERMS_MAX}
          value={form.terms}
          onChange={(e) => setForm({ ...form, terms: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Sending…" : "Submit for approval"}
        </button>
        <button type="button" className={outlineClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Portal/Admin > Tap Card > Offers: the Guild's Beer Trail offer, and this brewery's loyalty rewards. */
export function TapCardOffersSection({ memberId }: { memberId: string }) {
  const [data, setData] = useState<MemberOffersData | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expirySaved, setExpirySaved] = useState(false);

  async function reload() {
    try {
      setData(await getMemberOffers({ data: { memberId } }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openForm(v: SlotView) {
    const base = v.draft ?? v.live;
    setForm({
      slot: v.slot,
      template: "",
      visitNumber: base ? String(base.visitNumber) : "",
      reward: base?.reward ?? "",
      terms: base?.terms ?? "",
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const ok = await run(() =>
      submitMemberOffer({
        data: { memberId, slot: form.slot, visitNumber: Number(form.visitNumber), reward: form.reward, terms: form.terms },
      }),
    );
    if (ok) setForm(null);
  }

  return (
    <section className="flex flex-col gap-5 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="tap-card-offers">
      <h2 id="tap-card-offers" className="font-display text-[18px] font-bold text-ink">
        Offers
      </h2>
      {!data ? (
        <p className="text-[13px] text-ink-muted">{error ?? "Loading…"}</p>
      ) : (
        <>
          {data.trailStop && (
          <div className="flex flex-col gap-2">
            <div className={eyebrowClass}>Guild Offers</div>
            <div className="rounded-xl border border-canvas-border bg-canvas px-4 py-3">
              <div className="text-[12px] text-ink-muted">Beer Trail · Visit 1</div>
              <div className="text-[16px] font-semibold text-ink">{data.trailOffer}</div>
              <div className="mt-1 text-[13px] text-ink-muted">Set by the Guild. Once per customer each calendar year.</div>
            </div>
          </div>
          )}

          <div className="flex flex-col gap-2">
            <div className={eyebrowClass}>Member Offers</div>
            <p className="text-[13px] text-ink-muted">
              Reward customers for coming back. The Guild checks every reward before it goes live. Your approved version stays
              live while a change waits.
            </p>
            <ul className="flex flex-col divide-y divide-[#EFEAE1]">
              {data.slots.map((v) => {
                const shown = v.live ?? v.draft;
                const status = statusText(v);
                return (
                  <li key={v.slot} className="flex flex-col gap-2 py-3">
                    {form?.slot === v.slot ? (
                      <OfferForm form={form} setForm={setForm} templates={data.templates} busy={busy} onSubmit={onSubmit} onCancel={() => setForm(null)} />
                    ) : shown ? (
                      <>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[12px] text-ink-muted">
                              {SLOT_NAME[v.slot]} · {offerLabel(v.slot, shown.visitNumber)}
                            </div>
                            <div className="text-[15px] font-semibold text-ink">{shown.reward}</div>
                            {shown.terms && <div className="text-[13px] text-ink-muted">{shown.terms}</div>}
                          </div>
                          {status && (
                            <span className="rounded-full bg-canvas-2 px-3 py-1 text-[12px] text-ink-muted">{status}</span>
                          )}
                        </div>
                        {v.live && v.draft && (
                          <div className="text-[13px] text-ink-muted">
                            Change sent: {offerLabel(v.slot, v.draft.visitNumber)} — {v.draft.reward}
                          </div>
                        )}
                        {v.draft?.status === "declined" && v.draft.note && (
                          <div className="text-[13px] text-danger">Guild note: {v.draft.note}</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={outlineClass} disabled={busy || form !== null} onClick={() => openForm(v)}>
                            Edit
                          </button>
                          {v.draft && (
                            <button type="button" className={outlineClass} disabled={busy} onClick={() => run(() => withdrawMemberOfferDraft({ data: { memberId, slot: v.slot } }))}>
                              Withdraw change
                            </button>
                          )}
                          <button
                            type="button"
                            className={outlineClass}
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm("Remove this reward? Customers who already earned it keep it.")) {
                                void run(() => removeMemberOffer({ data: { memberId, slot: v.slot } }));
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] text-ink-muted">{SLOT_NAME[v.slot]}</span>
                        <button type="button" className={outlineClass} disabled={busy || form !== null} onClick={() => openForm(v)}>
                          {v.slot === "repeat" ? "+ Add a repeating reward" : "+ Add a step"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <label className={`${labelClass} max-w-[260px]`}>
            Unused rewards last
            <select
              className={fieldClass}
              value={data.expiryDays}
              disabled={busy}
              onChange={async (e) => {
                setExpirySaved(false);
                if (await run(() => saveRewardExpiry({ data: { memberId, days: Number(e.target.value) } }))) setExpirySaved(true);
              }}
            >
              {EXPIRY_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {EXPIRY_LABEL[d]}
                </option>
              ))}
            </select>
            {expirySaved && <span className="text-[12px] font-normal text-ink-muted">Saved. Applies to rewards earned from now on.</span>}
          </label>
        </>
      )}
      {error && data && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
