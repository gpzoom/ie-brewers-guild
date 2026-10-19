import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  EMPTY_SIGNIN_HELP_FORM,
  SIGNIN_HELP_BUSINESS_MAX,
  SIGNIN_HELP_EMAIL_MAX,
  SIGNIN_HELP_NAME_MAX,
  SIGNIN_HELP_NOTE_MAX,
  validateSignInHelp,
  type SignInHelpFieldErrors,
  type SignInHelpForm,
} from "@/lib/support/signin-help";
import { sendSignInHelp } from "@/lib/support/signin-help.server";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  IconTile,
  MailIcon,
  cardLinkClass,
  fieldErrorClass,
  hintClass,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
  textareaClass,
} from "@/components/public-forms/PublicFormParts";

export const Route = createFileRoute("/signin_/help")({
  head: () => ({ meta: [{ title: "Sign-in help — Inland Southern California Brewers Guild" }] }),
  component: SignInHelpPage,
});

type TextField = Exclude<keyof SignInHelpForm, "honeypot">;

const FIELDS: { key: TextField; label: string; type: "text" | "email"; max: number; autoComplete: string; hint?: string }[] = [
  { key: "name", label: "Your name", type: "text", max: SIGNIN_HELP_NAME_MAX, autoComplete: "name" },
  { key: "businessName", label: "Business name", type: "text", max: SIGNIN_HELP_BUSINESS_MAX, autoComplete: "organization" },
  {
    key: "previousEmail",
    label: "Email you used to sign in with",
    type: "email",
    max: SIGNIN_HELP_EMAIL_MAX,
    autoComplete: "off",
  },
  {
    key: "newEmail",
    label: "Your new email",
    type: "email",
    max: SIGNIN_HELP_EMAIL_MAX,
    autoComplete: "email",
    hint: "We'll sign you in with this one, and reply here.",
  },
];

/**
 * Sign-in help (docs/member-profiles.md, "Sign-in help"): where the sign-in
 * page's "contact support" link goes. A standalone page on the sign-in
 * page's ground and card (artboard T's look); no sign-in needed. Each
 * request is emailed to support@iscbrewersguild.org and listed on the super
 * admin's Help messages screen.
 */
function SignInHelpPage() {
  const [form, setForm] = useState<SignInHelpForm>(EMPTY_SIGNIN_HELP_FORM);
  const [fieldErrors, setFieldErrors] = useState<SignInHelpFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sentTo, setSentTo] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = validateSignInHelp(form);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setFormError("Fix the highlighted fields and try again.");
      return;
    }
    setStatus("sending");
    setFieldErrors({});
    setFormError(null);
    try {
      const result = await sendSignInHelp({ data: form });
      if (!result.ok) {
        setStatus("idle");
        setFieldErrors(result.errors);
        setFormError(result.formError ?? "Fix the highlighted fields and try again.");
        return;
      }
      setSentTo(checked.value.newEmail);
      setStatus("sent");
      setForm(EMPTY_SIGNIN_HELP_FORM);
    } catch {
      setStatus("idle");
      setFormError("Something went wrong sending your request. Try again in a moment.");
    }
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
                <CanvasHeading size="md">Thanks, we got it</CanvasHeading>
                <p className={leadClass}>
                  We'll update your sign-in email and reply to{" "}
                  <strong className="font-semibold text-ink break-all">{sentTo}</strong> when it's done.
                  Then you can sign in with that address.
                </p>
              </div>
              <Link to="/signin" className={cardLinkClass + " self-start text-[14px]"}>
                Back to sign in
              </Link>
            </CanvasCard>
          ) : (
            <CanvasCard>
              <div className="flex flex-col gap-[9px]">
                <CanvasHeading>Sign-in help</CanvasHeading>
                <p className={leadClass}>
                  Your sign-in email changed? Tell us the old one and the new one, and we'll update it
                  for you.
                </p>
              </div>

              <form onSubmit={onSubmit} className="relative flex flex-col gap-[18px]" noValidate>
                {/* Honeypot, as on the Contact page: hidden from people and screen
                    readers, often filled by bots. */}
                <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
                  <label htmlFor="help-company">Company</label>
                  <input
                    id="help-company"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.honeypot}
                    onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
                  />
                </div>

                {FIELDS.map((field) => {
                  const id = `help-${field.key}`;
                  const error = fieldErrors[field.key];
                  const describedBy = [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
                  return (
                    <div key={field.key} className="flex flex-col gap-[7px]">
                      <label htmlFor={id} className={labelClass}>
                        {field.label}
                      </label>
                      <input
                        id={id}
                        type={field.type}
                        inputMode={field.type === "email" ? "email" : undefined}
                        autoComplete={field.autoComplete}
                        maxLength={field.max}
                        value={form[field.key]}
                        disabled={status === "sending"}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy}
                        className={inputClass}
                      />
                      {field.hint && (
                        <p id={`${id}-hint`} className={hintClass}>
                          {field.hint}
                        </p>
                      )}
                      {error && (
                        <p id={`${id}-error`} role="alert" className={fieldErrorClass}>
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-col gap-[7px]">
                  <label htmlFor="help-note" className={labelClass}>
                    Anything else? <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea
                    id="help-note"
                    rows={3}
                    maxLength={SIGNIN_HELP_NOTE_MAX}
                    value={form.note}
                    disabled={status === "sending"}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    aria-invalid={fieldErrors.note ? true : undefined}
                    aria-describedby={fieldErrors.note ? "help-note-error" : undefined}
                    className={textareaClass}
                  />
                  {fieldErrors.note && (
                    <p id="help-note-error" role="alert" className={fieldErrorClass}>
                      {fieldErrors.note}
                    </p>
                  )}
                </div>

                {formError && (
                  <p role="alert" className="text-[13px] text-danger">
                    {formError}
                  </p>
                )}

                <button type="submit" disabled={status === "sending"} className={primaryButtonClass}>
                  {status === "sending" ? "Sending…" : "Send"}
                </button>
              </form>

              <p className="border-t border-canvas-border pt-[18px] text-[13px] leading-[1.55] text-ink-muted text-pretty">
                Remembered it?{" "}
                <Link to="/signin" className={cardLinkClass}>
                  Back to sign in
                </Link>
                .
              </p>
            </CanvasCard>
          )}
        </div>
      </div>
    </div>
  );
}
