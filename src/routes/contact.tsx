import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, type FormEvent } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import heroImg from "@/assets/hero-about.jpg";
import { submitContactForm } from "@/lib/contact/submit-contact-form.server";
import {
  validateContactFormInput,
  type ContactFormFieldErrors,
  type ContactFormInput,
} from "@/lib/contact/contact-form-validation";
import { GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";

/**
 * The rate limiter check lives here, at the request boundary, rather than
 * inside submitContactForm -- a server.handlers POST gives a clean point to
 * check env.CREATOR_UPLOAD_RATE_LIMITER before the createServerFn's own body
 * ever runs. This reuses the Member Admin phase's existing per-token
 * creator-upload rate limiter under a new "contact:<ip>" key namespace
 * (this plan's Decision 8) rather than adding a second ratelimits binding.
 */
export const Route = createFileRoute("/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env } = await import("cloudflare:workers");
        const rateLimiter = (
          env as { CREATOR_UPLOAD_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }
        ).CREATOR_UPLOAD_RATE_LIMITER;
        const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
        const { success } = (await rateLimiter?.limit({ key: `contact:${clientIp}` })) ?? { success: true };

        if (!success) {
          return new Response(
            JSON.stringify({ ok: false, errors: { message: "Too many submissions. Try again in a minute." } }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }

        let body: ContactFormInput;
        try {
          body = (await request.json()) as ContactFormInput;
        } catch {
          return new Response(JSON.stringify({ ok: false, errors: { message: "Malformed request." } }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = await submitContactForm({ data: body });
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
  head: () => ({
    meta: [
      { title: "Contact — IE Brewers Guild" },
      { name: "description", content: "Get in touch with the IE Brewers Guild — membership, press, and general inquiries." },
      { property: "og:title", content: "Contact — IE Brewers Guild" },
      { property: "og:description", content: "Membership, press, and general inquiries." },
    ],
  }),
  component: ContactPage,
});

const EMPTY_FORM = { name: "", email: "", phone: "", message: "", wantsMembershipInfo: false, honeypot: "" };

/**
 * Matches the union the POST handler above actually returns:
 * SubmitContactFormResult's { ok: false; errors: ContactFormFieldErrors }
 * for validation failures, plus the { message } field the handler adds
 * itself for the rate-limit (429) and malformed-request (400) cases.
 */
type ContactSubmitResponse = { ok: true } | { ok: false; errors: ContactFormFieldErrors & { message?: string } };

function ContactPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<ContactFormFieldErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

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
      const response = await fetch("/contact", { method: "POST", body: JSON.stringify(form) });
      const result = (await response.json()) as ContactSubmitResponse;

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

      setStatus("sent");
      setForm(EMPTY_FORM);
    } catch {
      setStatus("error");
      setFormError("Something went wrong sending your message. Try again in a moment.");
    }
  };

  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="Contact"
        title="Get in touch."
        subtitle="Membership, press, sponsorship, or just hello — we'd love to hear from you."
        minHeight="min-h-[45vh]"
      />

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-[1fr_2fr] md:px-6">
        <aside className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Email</div>
            <p className="mt-1 inline-flex items-center gap-2 text-foreground">
              <Mail className="h-4 w-4" /> {GUILD_NOTIFICATION_EMAIL}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Phone</div>
            <p className="mt-1 inline-flex items-center gap-2 text-foreground"><Phone className="h-4 w-4" /> (555) 555-0142</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Mailing</div>
            <p className="mt-1 inline-flex items-start gap-2 text-foreground"><MapPin className="mt-0.5 h-4 w-4" /> 123 Brewery Row<br />Anytown, USA 90000</p>
          </div>
        </aside>

        {status === "sent" ? (
          <div role="status" className="flex flex-col items-start justify-center rounded-lg border border-border bg-card p-6 md:p-8">
            <h2 className="font-display text-2xl text-foreground">Thanks for reaching out.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We've received your message and sent a confirmation to your email.
            </p>
            <Button type="button" className="mt-6 h-11" onClick={() => setStatus("idle")}>
              Send another message
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8" noValidate>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => validateField("name")}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "name-error" : undefined}
                  className="h-11 bg-background"
                />
                {fieldErrors.name && (
                  <p id="name-error" role="alert" className="text-sm text-destructive">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  maxLength={320}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => validateField("email")}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className="h-11 bg-background"
                />
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                maxLength={32}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={() => validateField("phone")}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                className="h-11 bg-background"
              />
              {fieldErrors.phone && (
                <p id="phone-error" role="alert" className="text-sm text-destructive">
                  {fieldErrors.phone}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={6}
                required
                maxLength={5000}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                onBlur={() => validateField("message")}
                aria-invalid={Boolean(fieldErrors.message)}
                aria-describedby={fieldErrors.message ? "message-error" : undefined}
                className="bg-background"
              />
              {fieldErrors.message && (
                <p id="message-error" role="alert" className="text-sm text-destructive">
                  {fieldErrors.message}
                </p>
              )}
            </div>

            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={form.wantsMembershipInfo}
                onCheckedChange={(checked) => setForm({ ...form, wantsMembershipInfo: checked === true })}
              />
              I want to learn more about becoming a member
            </label>

            {status === "error" && formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" disabled={status === "sending"} className="h-11">
              {status === "sending" ? "Sending…" : "Send message"}
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
