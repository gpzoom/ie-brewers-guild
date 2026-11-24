import { useEffect, useRef, useState, type FormEvent } from "react";
import { finishTrailJoin, type TrailJoinedResult } from "@/lib/tap-card/trail-join.server";
import { JOINED_EVERY_MS, joinedWaitStep } from "@/lib/tap-card/trail-join";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import { CanvasHeading, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { SignInCodeForm } from "@/components/tap-card/SignInCodeForm";

/** Email a sign-in code, then type it in. */
export function CodeSignIn({ initialEmail, next, intro, onSent }: { initialEmail: string; next: string; intro: string; onSent?: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestHolderSignIn({ data: { email, website: "", next } });
      if (result.kind === "check-email") {
        setSent(true);
        onSent?.();
      }
      if (result.kind === "error") setError(result.message);
    } catch {
      setError("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <SignInCodeForm email={email} onSignedIn={() => window.location.assign(next)} />
        <button type="button" className="mt-3 w-fit text-[14px] font-medium text-ink-muted underline underline-offset-2" onClick={() => setSent(false)}>
          Send a new code or use a different email
        </button>
      </>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className={leadClass}>{intro}</p>
      <label className={`${labelClass} flex flex-col gap-1.5`}>
        Email
        <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </form>
  );
}

/** /trail/joined: back from Zeffy. Finishes the sign-up, then opens the brewery's plate. */
export function TrailJoined() {
  const [state, setState] = useState<TrailJoinedResult | { kind: "email-help"; next: string } | { kind: "error" } | null>(null);
  const tries = useRef(0);
  // Once a code is on its way, the form stays put while they type it (a late payment still signs them in).
  const codeSent = useRef(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    async function attempt() {
      tries.current += 1;
      try {
        const result = await finishTrailJoin();
        if (stopped) return;
        if (result.kind === "signed-in") {
          window.location.assign(result.next);
          return;
        }
        if (result.kind === "waiting") {
          const step = joinedWaitStep(tries.current);
          if (!codeSent.current) setState(step.emailHelp ? { kind: "email-help", next: result.next } : result);
          if (step.checkAgain) timer = window.setTimeout(attempt, JOINED_EVERY_MS);
          return;
        }
        if (!codeSent.current) setState(result);
      } catch {
        // Once the email form is up, a failed check leaves it alone.
        if (!stopped) setState((s) => (s?.kind === "email-help" ? s : { kind: "error" }));
      }
    }
    void attempt();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (state === null || state.kind === "waiting") {
    return (
      <>
        <CanvasHeading size="md">Finishing up…</CanvasHeading>
        <p className={leadClass} role="status">
          Thanks for joining the Beer Trail! We&rsquo;re setting up your Scan Pass. This takes a few seconds.
        </p>
      </>
    );
  }
  if (state.kind === "need-code") {
    return (
      <>
        <CanvasHeading size="md">You&rsquo;re on the Beer Trail!</CanvasHeading>
        <CodeSignIn
          initialEmail={state.email}
          next={state.next}
          intro="This email already has a Scan Pass. To open it on this phone, we'll email you a 6-digit sign-in code."
        />
      </>
    );
  }
  if (state.kind === "email-help" || state.kind === "error") {
    return (
      <>
        <CanvasHeading size="md">Did you use a different email on the payment page?</CanvasHeading>
        <CodeSignIn
          initialEmail=""
          next={state.kind === "email-help" ? state.next : "/card"}
          intro="If you already paid, there's no need to pay again. Enter the email you used on the payment page and we'll email you a sign-in code. If it doesn't arrive, wait a minute and try again."
          onSent={() => {
            codeSent.current = true;
          }}
        />
      </>
    );
  }
  return (
    <>
      <CanvasHeading size="md">Thanks for joining!</CanvasHeading>
      <CodeSignIn initialEmail="" next="/card" intro="Enter the email you paid with and we'll email you a sign-in code." />
    </>
  );
}
