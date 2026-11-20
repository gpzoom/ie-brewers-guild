import { useState, type FormEvent } from "react";
import { startFreeCard, type FreeCardPage } from "@/lib/tap-card/free-card.server";
import { CanvasHeading, cardLinkClass, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { LegalNotice } from "@/components/site/LegalNotice";
import { CodeSignIn } from "@/components/tap-card/TrailJoined";
import { FREE_CARD_NAME_MAX } from "@/lib/tap-card/free-card";

/** /card/join: the free loyalty-only Tap Card (universal card). */
export function FreeCardForm({ page }: { page: FreeCardPage }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: "name" | "email" | "ageConfirmed" } | null>(null);
  const [needCode, setNeedCode] = useState<{ email: string; next: string } | null>(null);

  const back = page.plateCode ? `/t/${page.plateCode}` : "/card";
  if (page.signedIn) {
    return (
      <>
        <CanvasHeading size="md">You already have a Tap Card</CanvasHeading>
        <a href={back} className={primaryButtonClass}>
          {page.memberName ? `Back to ${page.memberName}` : "Open my card"}
        </a>
      </>
    );
  }
  if (needCode) {
    return (
      <>
        <CanvasHeading size="md">This email already has a Tap Card</CanvasHeading>
        <CodeSignIn initialEmail={needCode.email} next={needCode.next} intro="To open it on this phone, we'll email you a 6-digit sign-in code." />
      </>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await startFreeCard({ data: { plateCode: page.plateCode, name, email, ageConfirmed, optIn, website } });
      if (result.kind === "signed-in") {
        window.location.assign(result.next);
        return;
      }
      if (result.kind === "need-code") setNeedCode(result);
      else setError({ message: result.message, field: result.field });
    } catch {
      setError({ message: "That didn't work. Check the connection and try again." });
    }
    setBusy(false);
  }

  const fieldError = (f: "name" | "email" | "ageConfirmed") =>
    error?.field === f ? <span className={fieldErrorClass}>{error.message}</span> : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {page.memberName && <Eyebrow>{page.memberName}</Eyebrow>}
      <CanvasHeading size="md">Get your free Tap Card</CanvasHeading>
      <p className={leadClass}>
        Earn rewards for coming back to {page.memberName ?? "Guild members"} and every Inland Southern California Brewers Guild member.
        It&rsquo;s free.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Name</span>
        <input className={inputClass} autoComplete="name" maxLength={FREE_CARD_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
        {fieldError("name")}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Email</span>
        <input className={inputClass} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {fieldError("email")}
      </label>
      <label className="hidden" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="checkbox" className="size-5" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />I am 21 or
        older
      </label>
      {fieldError("ageConfirmed")}
      {page.memberName && (
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
          <input type="checkbox" className="size-5" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          Let {page.memberName} email me news and offers
        </label>
      )}
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "One moment…" : "Get my free card"}
      </button>
      {error && !error.field && (
        <p role="alert" className={fieldErrorClass}>
          {error.message}
        </p>
      )}
      <a href={page.plateCode ? `/trail/join?plate=${page.plateCode}` : "/trail/join"} className={`${cardLinkClass} w-fit text-[14px]`}>
        Want the Beer Trail too? Join the Beer Trail
      </a>
      <LegalNotice action="submitting" />
    </form>
  );
}
