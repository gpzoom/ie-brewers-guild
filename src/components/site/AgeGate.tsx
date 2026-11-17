import { useState, type FormEvent } from "react";
import logo from "@/assets/logo.svg";
import { ageCookieString, checkBirthDate, LEGAL_DRINKING_AGE } from "@/lib/site/age-gate";

const fieldClass =
  "h-12 w-full rounded-md border border-border bg-background px-3 text-center text-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * The 21+ check shown before the public site (owner, 2026-11-17). The date of
 * birth is checked here and never stored or sent; a yes saves a one-year
 * cookie. Under 21 gets a polite stop and nothing is saved.
 */
export function AgeGate({ onConfirmed }: { onConfirmed: () => void }) {
  const [birth, setBirth] = useState({ month: "", day: "", year: "" });
  const [state, setState] = useState<"ask" | "invalid" | "under">("ask");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = checkBirthDate(birth);
    if (result === "ok") {
      document.cookie = ageCookieString(window.location.protocol === "https:");
      onConfirmed();
    } else setState(result);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
      <img src={logo} alt="Inland Southern California Brewers Guild" className="h-20 w-20 rounded-sm object-contain" />
      <h1 className="mt-6 font-display text-3xl tracking-wider text-foreground md:text-4xl">
        Inland Southern California Brewers Guild
      </h1>

      {state === "under" ? (
        <div role="alert" className="mt-6 max-w-md space-y-3">
          <p className="text-lg font-semibold text-foreground">Sorry, this site is for adults {LEGAL_DRINKING_AGE} and over.</p>
          <p className="text-sm text-muted-foreground">Thanks for stopping by. Please come back when you're {LEGAL_DRINKING_AGE}.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-6 w-full max-w-sm space-y-4">
          <p className="text-pretty text-sm text-muted-foreground">
            You must be {LEGAL_DRINKING_AGE} or older to visit this site. Please enter your date of birth.
          </p>
          <fieldset className="grid grid-cols-[1fr_1fr_1.4fr] gap-3 text-left">
            <legend className="sr-only">Date of birth</legend>
            {(
              [
                ["month", "Month", "MM", 2],
                ["day", "Day", "DD", 2],
                ["year", "Year", "YYYY", 4],
              ] as const
            ).map(([key, label, placeholder, max]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {label}
                <input
                  name={key}
                  inputMode="numeric"
                  autoComplete={key === "month" ? "bday-month" : key === "day" ? "bday-day" : "bday-year"}
                  maxLength={max}
                  placeholder={placeholder}
                  value={birth[key]}
                  onChange={(e) => setBirth((b) => ({ ...b, [key]: e.target.value.replace(/\D/g, "") }))}
                  aria-invalid={state === "invalid" || undefined}
                  className={fieldClass}
                />
              </label>
            ))}
          </fieldset>
          {state === "invalid" && (
            <p role="alert" className="text-sm font-medium text-destructive">
              Please enter a real date of birth, like 04 / 21 / 1990.
            </p>
          )}
          <button
            type="submit"
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter the site
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
