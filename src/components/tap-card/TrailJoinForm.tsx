import { useState, type FormEvent } from "react";
import { startTrailJoin, type TrailJoinPage } from "@/lib/tap-card/trail-join.server";
import { CanvasHeading, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { LegalNotice } from "@/components/site/LegalNotice";

/** /trail/join: email, 21+, and (from a brewery's plate) that brewery's email opt-in; then on to Zeffy to pay. */
export function TrailJoinForm({ page }: { page: TrailJoinPage }) {
  const [email, setEmail] = useState(page.email);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: "email" | "ageConfirmed" } | null>(null);

  if (!page.open) {
    return (
      <>
        <CanvasHeading size="md">The Beer Trail</CanvasHeading>
        <p className={leadClass}>The Beer Trail isn&rsquo;t taking sign-ups right now. Check back soon.</p>
      </>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await startTrailJoin({ data: { plateCode: page.plateCode, email, ageConfirmed, optIn, website } });
      if (result.kind === "go") {
        window.location.assign(result.url);
        return;
      }
      setError({ message: result.message, field: result.field });
    } catch {
      setError({ message: "That didn't work. Check the connection and try again." });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {page.memberName && <Eyebrow>{page.memberName}</Eyebrow>}
      <CanvasHeading size="md">Join the {page.year} Beer Trail</CanvasHeading>
      <p className={leadClass}>
        Your Beer Trail Pass gets you the Beer Trail offer at every stop and Guild rewards as you visit more. Enter your email, then
        you&rsquo;ll pay on our secure Zeffy page and come right back here.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Email</span>
        <input className={inputClass} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <span className="text-[13px] text-ink-muted">Use the same email on the payment page.</span>
        {error?.field === "email" && <span className={fieldErrorClass}>{error.message}</span>}
      </label>
      <label className="hidden" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="checkbox" className="size-5" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />I am 21 or
        older
      </label>
      {error?.field === "ageConfirmed" && <span className={fieldErrorClass}>{error.message}</span>}
      {page.memberName && (
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
          <input type="checkbox" className="size-5" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          Let {page.memberName} email me news and offers
        </label>
      )}
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "One moment…" : "Continue to payment"}
      </button>
      {error && !error.field && (
        <p role="alert" className={fieldErrorClass}>
          {error.message}
        </p>
      )}
      <LegalNotice action="submitting" />
    </form>
  );
}
