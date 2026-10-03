import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/safe-next-path";
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

  const sendLink = async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseBrowserClient();
      // `next` has passed safeNextPath, so nothing but an allowlisted path
      // is ever written into the magic link. Without a `next`, the link is
      // exactly what it always was.
      const callback = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: next ? `${callback}?next=${encodeURIComponent(next)}` : callback,
        },
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
                  member, a sign-in link is on its way. It works once, and only for a limited time.
                </p>
              </div>

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
