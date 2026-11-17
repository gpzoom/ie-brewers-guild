import { useState, type FormEvent } from "react";
import logo from "@/assets/logo.svg";
import { ageCookieString, LEGAL_DRINKING_AGE } from "@/lib/site/age-gate";

/**
 * The 21+ check shown before the public site. Owner, 2026-11-17: a checkbox
 * for now, while the membership votes on following the Brewers Association
 * guidelines (which ask for a date of birth; checkBirthDate in
 * src/lib/site/age-gate.ts is kept, tested, for that). A yes saves a one-year
 * cookie; "I'm under 21" gets a polite stop and nothing is saved.
 */
export function AgeGate({ onConfirmed }: { onConfirmed: () => void }) {
  const [checked, setChecked] = useState(false);
  const [under, setUnder] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checked) return;
    document.cookie = ageCookieString(window.location.protocol === "https:");
    onConfirmed();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Age check"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-black/65 px-4 py-10 text-center backdrop-blur-md"
    >
      <img src={logo} alt="Inland Southern California Brewers Guild" className="h-20 w-20 rounded-sm object-contain" />
      <h1 className="mt-6 font-display text-3xl tracking-wider text-foreground md:text-4xl">
        Inland Southern California Brewers Guild
      </h1>

      {under ? (
        <div role="alert" className="mt-6 max-w-md space-y-3">
          <p className="text-lg font-semibold text-foreground">Sorry, this site is for adults {LEGAL_DRINKING_AGE} and over.</p>
          <p className="text-sm text-muted-foreground">Thanks for stopping by. Please come back when you're {LEGAL_DRINKING_AGE}.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 w-full max-w-sm space-y-4">
          <p className="text-pretty text-sm text-muted-foreground">
            You must be {LEGAL_DRINKING_AGE} or older to visit this site.
          </p>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-3 rounded-md border border-border px-4 py-3 text-left text-base text-foreground">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--primary)]"
            />
            I am {LEGAL_DRINKING_AGE} or older
          </label>
          <button
            type="submit"
            disabled={!checked}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enter the site
          </button>
          <button
            type="button"
            onClick={() => setUnder(true)}
            className="min-h-11 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            I'm under {LEGAL_DRINKING_AGE}
          </button>
          <p className="text-xs text-muted-foreground">Please drink responsibly.</p>
        </form>
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        Guild member?{" "}
        <a href="/signin?next=/portal" className="underline underline-offset-2 hover:text-primary">
          Sign in
        </a>
        {" · "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-primary">
          Privacy Policy
        </a>
        {" · "}
        <a href="/terms" className="underline underline-offset-2 hover:text-primary">
          Terms of Use
        </a>
      </p>
    </div>
  );
}
