import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { cn } from "@/lib/utils";
import { normalizeEmailCode, signInRedirectUrl } from "@/lib/auth/sign-in-link";
import { verifyEmailCode } from "@/lib/auth/sign-in-verify.server";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  IconTile,
  MailIcon,
  NoticeBox,
  cardLinkClass,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/public-forms/PublicFormParts";

const NOTICE_MESSAGES: Record<string, string> = {
  "no-account": "We couldn't find a member or Guild admin account for that sign-in link. Contact the Guild if you think this is a mistake.",
  "invalid-link": "That sign-in link is invalid or has expired. Request a new one below.",
  "missing-code": "That sign-in link is missing its code. Request a new one below.",
};

type SignInSearch = {
  notice?: string;
  /** Where to land after sign-in. Only allowlisted /portal paths survive (safeNextPath). */
  next?: string;
};

function validateSignInSearch(search: Record<string, unknown>): SignInSearch {
  const result: SignInSearch = {};

  if (typeof search.notice === "string") {
    result.notice = search.notice;
  }

  const next = safeNextPath(search.next);
  if (next) {
    result.next = next;
  }

  return result;
}

export const Route = createFileRoute("/signin")({
  validateSearch: validateSignInSearch,
  head: () => ({ meta: [{ title: "Member sign in — Inland Southern California Brewers Guild" }] }),
  component: SignInPage,
});

/**
 * Artboard T (docs/design/artboards/SignIn.dc.html): a standalone page (no
 * site header/footer -- see __root.tsx's BARE_ROUTES) on the dark ground,
 * with the form on a light card. Once the link is sent, the card is
 * replaced by the artboard's "Check your email" card.
 */
function SignInPage() {
  const search = Route.useSearch();
  const notice = search.notice;
  // Re-validated here: the router keeps search keys validateSearch dropped
  // (non-strict search), so a rejected `next` can still show up in
  // useSearch() as the raw string. Only a safeNextPath result is used.
  const next = safeNextPath(search.next);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<"idle" | "checking" | "error">("idle");
  const [codeError, setCodeError] = useState<string | null>(null);

  // The code from the email (8 digits on this project): works on any device, whatever opened the email.
  const onCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!normalizeEmailCode(code)) {
      setCodeState("error");
      setCodeError("Enter the code from the email.");
      return;
    }
    setCodeState("checking");
    setCodeError(null);
    try {
      const result = await verifyEmailCode({ data: { email, code, next } });
      if (result.ok) {
        window.location.assign(result.href);
        return;
      }
      setCodeState("error");
      setCodeError(result.message);
    } catch {
      setCodeState("error");
      setCodeError("Something went wrong. Try again, or send a new email.");
    }
  };

  const sendLink = async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseBrowserClient();
      // `next` has passed safeNextPath, so nothing but an allowlisted path
      // is ever written into the magic link. Without a `next`, the link is
      // exactly what it always was.
      // Always ends in a query string, so the email template can add the
      // token hash (sign-in-link.ts).
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: signInRedirectUrl(window.location.origin, next) },
      });
      return error ? error.message : null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't send the sign-in link.";
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const error = await sendLink();
    if (error) {
      setStatus("error");
      setErrorMessage(error);
      return;
    }
    setResendState("idle");
    setStatus("sent");
  };

  const onResend = async () => {
    setResendState("sending");
    setErrorMessage(null);
    const error = await sendLink();
    if (error) {
      setResendState("error");
      setErrorMessage(error);
      return;
    }
    setResendState("sent");
  };

  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[480px]">
        <BrandBar linkHome />

        <div className="mx-2.5 sm:mx-0 sm:mt-6">
          {status === "sent" ? (
            <CanvasCard className="gap-[18px]">
              <IconTile>
                <MailIcon />
              </IconTile>

              <div className="flex flex-col gap-[9px]" role="status">
                <CanvasHeading size="md">Check your email</CanvasHeading>
                <p className={leadClass}>
                  If <strong className="font-semibold text-ink break-all">{email}</strong> belongs to a
                  member, a sign-in email is on its way. Open the link in it, or type the code from it
                  here. Either works once, for about an hour.
                </p>
              </div>

              <form onSubmit={onCode} className="flex flex-col gap-2">
                <label htmlFor="signin-code" className={labelClass}>
                  Code from the email
                </label>
                <div className="flex gap-2">
                  <input
                    id="signin-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="12345678"
                    aria-invalid={codeState === "error" ? true : undefined}
                    aria-describedby={codeError ? "signin-code-error" : undefined}
                    className={`${inputClass} h-[52px] min-w-0 flex-1 tracking-[0.3em]`}
                  />
                  <button type="submit" disabled={codeState === "checking"} className={cn(primaryButtonClass, "h-[52px] w-auto shrink-0 px-5")}>
                    {codeState === "checking" ? "Checking…" : "Sign in"}
                  </button>
                </div>
                {codeError && (
                  <p id="signin-code-error" role="alert" className="text-[13px] text-danger">
                    {codeError}
                  </p>
                )}
              </form>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onResend}
                  disabled={resendState === "sending"}
                  className={secondaryButtonClass}
                >
                  {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Sent again" : "Send it again"}
                </button>
                {resendState === "error" && errorMessage && (
                  <p role="alert" className="text-[13px] text-danger">
                    {errorMessage}
                  </p>
                )}
                <p className="text-xs leading-normal text-ink-subtle text-pretty">
                  Nothing after a minute or two? Check spam, and make sure it's the address the Guild
                  has for you.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setResendState("idle");
                    setErrorMessage(null);
                  }}
                  className="-mt-1 inline-flex min-h-11 items-center self-start text-[13px] font-medium text-brand underline underline-offset-2 hover:text-brand-hover"
                >
                  Use a different email
                </button>
              </div>
            </CanvasCard>
          ) : (
            <CanvasCard>
              <div className="flex flex-col gap-[9px]">
                {next && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                    Member Portal
                  </p>
                )}
                <CanvasHeading>Member sign in</CanvasHeading>
                <p className={leadClass}>
                  Enter the email the Guild has for you and we'll send a link that signs you in. No
                  password to remember.
                </p>
              </div>

              {notice && NOTICE_MESSAGES[notice] && <NoticeBox>{NOTICE_MESSAGES[notice]}</NoticeBox>}

              <form onSubmit={onSubmit} className="flex flex-col gap-[22px]">
                <div className="flex flex-col gap-[7px]">
                  <label htmlFor="signin-email" className={labelClass}>
                    Email
                  </label>
                  <input
                    id="signin-email"
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={status === "error" ? true : undefined}
                    aria-describedby={status === "error" && errorMessage ? "signin-error" : undefined}
                    className={`${inputClass} h-[52px]`}
                  />
                  {status === "error" && errorMessage && (
                    <p id="signin-error" role="alert" className="text-[13px] text-danger">
                      {errorMessage}
                    </p>
                  )}
                </div>

                <button type="submit" disabled={status === "sending"} className={primaryButtonClass}>
                  {status === "sending" ? "Sending…" : "Email me a link"}
                </button>
              </form>

              <div className="flex flex-col gap-2.5 border-t border-canvas-border pt-[18px]">
                <p className="text-[13px] leading-[1.55] text-ink-muted text-pretty">
                  Not sure which address? It's whatever the Guild sent your invitation to. If that's
                  changed,{" "}
                  <Link to="/contact" className={cardLinkClass}>
                    get in touch
                  </Link>{" "}
                  and we'll update it.
                </p>
                <p className="text-[13px] leading-[1.55] text-ink-muted text-pretty">
                  Not a member?{" "}
                  <Link to="/contact" className={cardLinkClass}>
                    Ask us about joining
                  </Link>
                  .
                </p>
              </div>
            </CanvasCard>
          )}
        </div>
      </div>
    </div>
  );
}
