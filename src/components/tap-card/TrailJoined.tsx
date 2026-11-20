import { useEffect, useRef, useState, type FormEvent } from "react";
import { finishTrailJoin, type TrailJoinedResult } from "@/lib/tap-card/trail-join.server";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import { CanvasHeading, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { SignInCodeForm } from "@/components/tap-card/SignInCodeForm";

const TRIES = 12;
const EVERY_MS = 5000;

/** Email a sign-in code, then type it in. */
export function CodeSignIn({ initialEmail, next, intro }: { initialEmail: string; next: string; intro: string }) {
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
      if (result.kind === "check-email") setSent(true);
      else setError(result.message);
    } catch {
      setError("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <SignInCodeForm email={email} onSignedIn={() => window.location.assign(next)} />;
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
  const [state, setState] = useState<TrailJoinedResult | { kind: "gave-up" } | { kind: "error" } | null>(null);
  const tries = useRef(0);

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
          if (tries.current >= TRIES) setState({ kind: "gave-up" });
          else {
            setState(result);
            timer = window.setTimeout(attempt, EVERY_MS);
          }
          return;
        }
        setState(result);
      } catch {
        if (!stopped) setState({ kind: "error" });
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
  if (state.kind === "gave-up" || state.kind === "error") {
    return (
      <>
        <CanvasHeading size="md">Thanks for joining!</CanvasHeading>
        <CodeSignIn
          initialEmail=""
          next="/card"
          intro="We haven't heard back from the payment page yet. Enter the email you paid with and we'll email you a sign-in code. If it doesn't arrive, wait a minute and try again."
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
