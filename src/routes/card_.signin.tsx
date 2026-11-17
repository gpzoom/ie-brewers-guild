import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import {
  CanvasHeading,
  fieldErrorClass,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
} from "@/components/public-forms/PublicFormParts";
import { TapCardShell } from "@/components/tap-card/TapCardShell";

/** /card/signin: email a one-time link to a card holder. Never says whether the email has a card. */
export const Route = createFileRoute("/card_/signin")({
  head: () => ({ meta: [{ title: "Sign in — Inland Tap Card" }] }),
  component: CardSignIn,
});

function CardSignIn() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestHolderSignIn({ data: { email, website } });
      if (result.kind === "check-email") setSent(true);
      else setError(result.message);
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TapCardShell>
      <CanvasHeading size="md">See your Inland Tap Card</CanvasHeading>
      {sent ? (
        <p className={leadClass}>
          Check your email. If that address has a Tap Card, we sent a link to it. The link works once, for 60 minutes.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className={leadClass}>Enter the email you used when you turned on your card. We&rsquo;ll send you a sign-in link.</p>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Email</span>
            <input className={inputClass} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="hidden" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Sending…" : "Email me a link"}
          </button>
          {error && (
            <p role="alert" className={fieldErrorClass}>
              {error}
            </p>
          )}
        </form>
      )}
    </TapCardShell>
  );
}
