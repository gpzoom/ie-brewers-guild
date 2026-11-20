import { useState, type FormEvent } from "react";
import { signInWithCode } from "@/lib/tap-card/holder.server";
import { fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";

/** After "send me a sign-in email": type the 6-digit code from it (works where the link can't, e.g. a Home Screen card). */
export function SignInCodeForm({ email, onSignedIn }: { email: string; onSignedIn: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithCode({ data: { email, code } });
      if (result.kind === "ok") onSignedIn();
      else setError(result.message);
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className={leadClass}>
        Check your email. If that address has a Scan Pass, we sent a 6-digit code and a link. Type the code here, or open the link on
        this phone. Both work once, for 60 minutes.
      </p>
      <label className={`${labelClass} flex flex-col gap-1.5`}>
        Sign-in code
        <input
          className={`${inputClass} max-w-[200px] text-center text-[22px] tracking-[0.25em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
        />
      </label>
      <button type="submit" className={primaryButtonClass} disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </form>
  );
}
