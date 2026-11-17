import { useState, type FormEvent } from "react";
import { activateCardAsCustomer, activateCardAsStaff, type ActivateResult } from "@/lib/tap-card/activate.server";
import type { ActivateFieldErrors } from "@/lib/tap-card/activate-core";
import { formatCardCode } from "@/lib/tap-card/card-code";
import { LegalNotice } from "@/components/site/LegalNotice";
import {
  fieldErrorClass,
  hintClass,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
} from "@/components/public-forms/PublicFormParts";

/**
 * Turning on a new card. "customer": on their own phone (21+ checkbox,
 * hidden honeypot, starts their session). "staff": on the bar device
 * ("I checked their ID").
 */
export function ActivateForm({
  code,
  mode,
  onActivated,
}: {
  code: string;
  mode: "customer" | "staff";
  onActivated: (result: ActivateResult) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ActivateFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const result =
        mode === "customer"
          ? await activateCardAsCustomer({ data: { code, name, email, ageConfirmed: confirmed, website } })
          : await activateCardAsStaff({ data: { code, name, email, idChecked: confirmed } });
      if (result.kind === "invalid") setErrors(result.errors);
      else if (result.kind === "error") setMessage(result.message);
      else if (result.kind === "unknown-card") setMessage("We don't recognize this card.");
      else onActivated(result);
    } catch {
      setMessage("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className={leadClass}>
        {mode === "customer"
          ? "Add your name and email to turn on this card. We'll email you a link to see your progress."
          : "Type the customer's name and email to turn on this card."}
      </p>
      <p className={hintClass}>Card {formatCardCode(code)}</p>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete={mode === "customer" ? "name" : "off"} maxLength={80} />
        {errors.name && <span className={fieldErrorClass}>{errors.name}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Email</span>
        <input
          className={inputClass}
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete={mode === "customer" ? "email" : "off"}
        />
        {errors.email && <span className={fieldErrorClass}>{errors.email}</span>}
      </label>
      {mode === "customer" && (
        <label className="hidden" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      )}
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="checkbox" className="size-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        {mode === "customer" ? "I am 21 or older" : "I checked their ID"}
      </label>
      {errors.ageConfirmed && <span className={fieldErrorClass}>{errors.ageConfirmed}</span>}
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? "Turning it on…" : "Activate card"}
      </button>
      {message && (
        <p role="alert" className={fieldErrorClass}>
          {message}
        </p>
      )}
      {mode === "customer" && <LegalNotice action="submitting" />}
    </form>
  );
}
