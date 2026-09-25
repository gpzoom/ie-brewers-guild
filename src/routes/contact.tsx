import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { submitContactForm } from "@/lib/contact/submit-contact-form.server";
import {
  validateContactFormInput,
  type ContactFormFieldErrors,
} from "@/lib/contact/contact-form-validation";
import { GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import {
  CanvasCard,
  CanvasHeading,
  CheckCard,
  IconTile,
  InstagramIcon,
  MailIcon,
  NoticeBox,
  fieldErrorClass,
  hintClass,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/public-forms/PublicFormParts";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Inland Southern California Brewers Guild" },
      { name: "description", content: "Get in touch with the Inland Southern California Brewers Guild — membership, press, and general inquiries." },
      { property: "og:title", content: "Contact — Inland Southern California Brewers Guild" },
      { property: "og:description", content: "Membership, press, and general inquiries." },
    ],
  }),
  component: ContactPage,
});

const GUILD_INSTAGRAM_URL = "https://www.instagram.com/iebrewers/";
const GUILD_INSTAGRAM_HANDLE = "@iebrewers";

const EMPTY_FORM = { name: "", email: "", phone: "", message: "", wantsMembershipInfo: false, honeypot: "" };

/**
 * Artboard O (docs/design/artboards/ContactForm.dc.html). A public page, so
 * the site header/footer stay (the artboard shows the site's menu button);
 * the form sits on a light card on the dark site ground.
 */
function ContactPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<ContactFormFieldErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [sentWithMembership, setSentWithMembership] = useState(false);

  function validateField(field: keyof ContactFormFieldErrors) {
    const result = validateContactFormInput(form);
    setFieldErrors((prev) => ({ ...prev, [field]: result.valid ? undefined : result.errors[field] }));
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const validation = validateContactFormInput(form);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setStatus("error");
      setFormError("Fix the highlighted fields and try again.");
      return;
    }

    setStatus("sending");
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await submitContactForm({ data: form });

      if (!result.ok) {
        setStatus("error");
        if (result.errors?.message) {
          setFormError(result.errors.message);
        } else {
          setFieldErrors(result.errors ?? {});
          setFormError("Fix the highlighted fields and try again.");
        }
        return;
      }

      setSentWithMembership(form.wantsMembershipInfo);
      setStatus("sent");
      setForm(EMPTY_FORM);
    } catch {
      setStatus("error");
      setFormError("Something went wrong sending your message. Try again in a moment.");
    }
  };

  const describedBy = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined;

  return (
    <section className="bg-bg px-2.5 pb-16 pt-6 font-sans sm:px-6 sm:pb-24 sm:pt-12">
      <div className="mx-auto w-full max-w-[640px]">
        {status === "sent" ? (
          <CanvasCard className="gap-[18px]">
            <IconTile>
              <MailIcon />
            </IconTile>
            <div className="flex flex-col gap-[9px]" role="status">
              <CanvasHeading>Thanks — your message is on its way</CanvasHeading>
              <p className={leadClass}>
                We've received it and sent a confirmation to your email.{" "}
                {sentWithMembership
                  ? "A Guild representative will get in touch to talk through membership."
                  : "Someone from the Guild will come back to you."}
              </p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={() => setStatus("idle")}>
              Send another message
            </button>
          </CanvasCard>
        ) : (
          <CanvasCard>
            <div className="flex flex-col gap-[9px]">
              <CanvasHeading>Get in touch</CanvasHeading>
              <p className={leadClass}>
                Questions about the Guild, our members, or joining us? Send a note and someone will come
                back to you.
              </p>
            </div>

            <form onSubmit={onSubmit} className="relative flex flex-col gap-[22px]" noValidate>
              {/* Honeypot: a hidden field a real visitor never sees or fills, that a
                  form-filling bot often does. aria-hidden + tabIndex={-1} keep it out
                  of the tab order and off screen readers entirely (this plan's
                  Decision 2). */}
              <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
                <label htmlFor="company">Company</label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.honeypot}
                  onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="name" className={labelClass}>
                  Your name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => validateField("name")}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "name-error" : undefined}
                  className={inputClass}
                />
                {fieldErrors.name && (
                  <p id="name-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="email" className={labelClass}>
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={320}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => validateField("email")}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={describedBy("email-hint", fieldErrors.email && "email-error")}
                  className={inputClass}
                />
                <p id="email-hint" className={hintClass}>
                  We'll send a confirmation here.
                </p>
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="phone" className={labelClass}>
                  Phone <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={32}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  onBlur={() => validateField("phone")}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                  className={inputClass}
                />
                {fieldErrors.phone && (
                  <p id="phone-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="message" className={labelClass}>
                  What's on your mind?
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  maxLength={5000}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  onBlur={() => validateField("message")}
                  aria-invalid={Boolean(fieldErrors.message)}
                  aria-describedby={fieldErrors.message ? "message-error" : undefined}
                  className={textareaClass}
                />
                {fieldErrors.message && (
                  <p id="message-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.message}
                  </p>
                )}
              </div>

              <CheckCard
                id="membership-interest"
                tone="accent"
                checked={form.wantsMembershipInfo}
                onChange={(checked) => setForm({ ...form, wantsMembershipInfo: checked })}
                title="I want to learn more about becoming a member"
                description="A Guild representative will get in touch to talk through membership."
              />

              {status === "error" && formError && <NoticeBox tone="danger">{formError}</NoticeBox>}

              <div className="flex flex-col gap-3">
                <button type="submit" disabled={status === "sending"} className={primaryButtonClass}>
                  {status === "sending" ? "Sending…" : "Send"}
                </button>
                <p className="text-xs leading-[1.55] text-ink-muted text-pretty">
                  We use what you send here only to reply to you. Nothing is shared with our members or
                  anyone else.
                </p>
              </div>
            </form>

            <div className="flex flex-col gap-[9px] border-t border-canvas-border pt-[18px]">
              <h2 className="font-sans text-[10px] font-semibold normal-case tracking-[0.15em] text-ink-muted">
                RATHER NOT USE A FORM?
              </h2>
              <a
                href={`mailto:${GUILD_NOTIFICATION_EMAIL}`}
                className="flex min-h-11 items-center gap-[11px] text-[15px] text-ink no-underline hover:text-brand"
              >
                <MailIcon size={17} />
                <span className="break-all">{GUILD_NOTIFICATION_EMAIL}</span>
              </a>
              <a
                href={GUILD_INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center gap-[11px] text-[15px] text-ink no-underline hover:text-brand"
              >
                <InstagramIcon />
                {GUILD_INSTAGRAM_HANDLE} on Instagram
              </a>
            </div>
          </CanvasCard>
        )}
      </div>
    </section>
  );
}
