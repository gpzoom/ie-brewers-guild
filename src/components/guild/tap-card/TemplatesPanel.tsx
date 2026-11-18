import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  moveOfferTemplate,
  saveOfferTemplate,
  setTemplateHidden,
  type OfferTemplate,
} from "@/lib/tap-card/offer-templates.server";
import { REWARD_MAX, TEMPLATE_TITLE_MAX, TERMS_MAX } from "@/lib/tap-card/loyalty";
import {
  StatusMessage,
  cardClass,
  darkButtonClass,
  errorText,
  fieldClass,
  outlineButtonClass,
  type Message,
} from "@/components/guild/settings-ui";

type Draft = { id: string | null; title: string; reward: string; terms: string };
const EMPTY: Draft = { id: null, title: "", reward: "", terms: "" };

function TemplateForm({ initial, onDone, onCancel }: { initial: Draft; onDone: () => Promise<void>; onCancel?: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await saveOfferTemplate({ data: draft });
      if (!draft.id) setDraft(EMPTY);
      await onDone();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
        Name (members pick by this)
        <input className={fieldClass} value={draft.title} maxLength={TEMPLATE_TITLE_MAX} required
          onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Free snack" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
        Reward
        <input className={fieldClass} value={draft.reward} maxLength={REWARD_MAX} required
          onChange={(e) => setDraft({ ...draft, reward: e.target.value })} placeholder="[Reward]" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
        Terms (optional)
        <textarea className={`${fieldClass} h-auto min-h-[72px] py-2`} value={draft.terms} maxLength={TERMS_MAX}
          onChange={(e) => setDraft({ ...draft, terms: e.target.value })} placeholder="[Terms]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={darkButtonClass} disabled={busy}>
          {busy ? "Saving…" : "Save template"}
        </button>
        {onCancel && (
          <button type="button" className={outlineButtonClass} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <StatusMessage message={message} />
    </form>
  );
}

/** Guild > Tap Card > Templates: starting points for breweries' loyalty rewards. */
export function TemplatesPanel({ templates }: { templates: OfferTemplate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function run(action: () => Promise<unknown>) {
    setMessage(null);
    try {
      await action();
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-[22px]">
      <p className="text-[13px] text-ink-muted">
        Members can start a loyalty reward from one of these and change every word. Hiding a template removes it from
        members&rsquo; choices; rewards already made from it don&rsquo;t change.
      </p>
      {templates.length === 0 ? (
        <p className="rounded-[14px] border border-canvas-border bg-white px-5 py-6 text-[13px] text-ink-muted">No templates yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((t, i) => (
            <li key={t.id} className="flex flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-5 py-4">
              {editing === t.id ? (
                <TemplateForm
                  initial={{ id: t.id, title: t.title, reward: t.reward, terms: t.terms }}
                  onCancel={() => setEditing(null)}
                  onDone={async () => {
                    setEditing(null);
                    await router.invalidate();
                  }}
                />
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                      {t.title}
                      {t.hidden && <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[11px]">Hidden</span>}
                    </div>
                    <div className="text-[16px] font-semibold text-ink">{t.reward}</div>
                    {t.terms && <div className="text-[13px] text-ink-muted">{t.terms}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={outlineButtonClass} onClick={() => setEditing(t.id)}>
                      Edit
                    </button>
                    <button type="button" className={outlineButtonClass} onClick={() => run(() => setTemplateHidden({ data: { id: t.id, hidden: !t.hidden } }))}>
                      {t.hidden ? "Show" : "Hide"}
                    </button>
                    <button type="button" className={outlineButtonClass} disabled={i === 0} aria-label={`Move ${t.title} up`}
                      onClick={() => run(() => moveOfferTemplate({ data: { id: t.id, direction: "up" } }))}>
                      ↑
                    </button>
                    <button type="button" className={outlineButtonClass} disabled={i === templates.length - 1} aria-label={`Move ${t.title} down`}
                      onClick={() => run(() => moveOfferTemplate({ data: { id: t.id, direction: "down" } }))}>
                      ↓
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <StatusMessage message={message} />
      <section className={cardClass}>
        <h2 className="font-display text-[18px] font-bold text-ink">Add a template</h2>
        <TemplateForm initial={EMPTY} onDone={() => router.invalidate()} />
      </section>
    </div>
  );
}
