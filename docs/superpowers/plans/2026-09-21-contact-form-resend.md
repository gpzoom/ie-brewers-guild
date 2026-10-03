# Contact Form + Resend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public contact form (artboard O) from a client-only fake into a real, rate-limited, honeypot-protected endpoint that writes to the `inquiries` table, and implement `sendTransactionalEmail()` for real against Resend so all five of the spec's transactional-email triggers actually send mail.

**Architecture:** A new pure content-builder module (`build-email-content.ts`) owns the `TransactionalEmailPayload` union and the exact subject/HTML/text for each of the five triggers, fully unit-testable with no I/O. A new recipient-resolution module (`resolve-recipient.server.ts`) maps a payload to a "to" address — directly from the payload for three triggers, from the Guild's own notification constant for one, and via a `member_users` → `auth.admin.getUserById()` lookup (reusing the Member Admin phase's own tie-break rule) for the two memberId-only triggers. `src/lib/email/send.ts` (created as a throwing stub by the Member Admin phase, extended with a third variant by the Guild Admin phase) is rewritten to call these two modules and then a single `fetch()` POST against Resend's API — no new npm dependency. The public write path is one `createServerFn` (`submit-contact-form.server.ts`) that validates input, drops silently on a tripped honeypot, inserts into `inquiries` with the service-role client (RLS blocks all public access), and fires both contact-form email triggers independently in their own `try/catch`, gating `confirmation_sent_at` on the sender-confirmation send specifically. The `/contact` route's own `server.handlers.POST` is the request boundary that checks the Cloudflare `ratelimits` binding the Member Admin phase already wired for creator uploads, keyed by a new `contact:<ip>` namespace rather than a second rate-limiting mechanism. `src/routes/contact.tsx`'s existing layout is kept; its field set is reconciled to the spec (name, email, phone, message, one membership checkbox) and its fake `toast.success()` submit handler is replaced with a real `fetch` call and inline, accessible success/error states.

**Tech Stack:** TanStack Start (`createServerFn`, file-route `server.handlers`), Supabase (`@supabase/supabase-js` service-role client — no new session/auth code, this endpoint is intentionally unauthenticated), Cloudflare Workers' native `ratelimits` binding (already declared by the Member Admin phase — no `wrangler.jsonc` change in this plan), plain `fetch` against Resend's HTTP API (no `resend` npm package — see Task 4's rationale), Vitest (already a dependency per the Member Admin phase's own "Vitest (existing)" tag — see the note at the top of Task 1 if running against a checkout where no earlier phase has executed yet).

**Spec:** `docs/member-profiles.md` — "Joining, for now," "Transactional email," the closing rate-limit/honeypot sentence of "Accounts, sign-in and joining"'s "Joining, for now" paragraph, the `inquiries` table section, and the RLS section's `inquiries` row. Built-on plumbing this plan assumes is already in place exactly as written: `docs/superpowers/plans/2026-09-21-guild-admin.md` (Task 1's `inquiries` migration; Task 16's `member_invited` variant and its exact current `send.ts` contents) and `docs/superpowers/plans/2026-09-21-member-admin.md` (Task 19's `send.ts` seam and its two existing variants; Task 20's `CREATOR_UPLOAD_RATE_LIMITER` binding and its `/send/$token` rate-limit-at-the-route-boundary pattern; Task 2's `getSupabaseServiceRoleClient`/`getWorkerEnv` conventions in `src/lib/supabase/server.ts`).

## Global Constraints

- The contact form collects name, email, phone, a message, and one checkbox — "I want to learn more about becoming a member." That flag is the only thing separating a membership lead from a general question. (Spec, "Joining, for now.")
- The contact-form confirmation to the sender reads, verbatim: "Thank you for reaching out. We have received your submission." Plus, only when the membership checkbox was ticked, a line saying a Guild representative will be in touch to discuss membership. (Spec, "Transactional email" table.)
- The contact-form notification to the Guild is the inquiry's content, flagged when it is a membership lead. (Spec, same table.)
- The contact form is a public endpoint that writes rows and sends mail, so it needs a rate limit per IP and a honeypot field at minimum. (Spec, "Accounts, sign-in and joining" → "Joining, for now," closing sentence.)
- `inquiries` RLS: no public select at all; inserts go through the Worker with the service-role key, never a client-side Supabase call. (Spec, "Row level security" and the `inquiries` section.)
- `confirmation_sent_at` is set only once the sender's confirmation email actually sends — it is what lets the Guild-admin inquiries screen tell a delivered auto-reply from one Resend silently failed to send. (Spec, `inquiries` section.)
- Send from `mail.iscbrewersguild.org`, already verified in Resend (SPF/DKIM/DMARC already in place) — no domain-verification work in this plan. (Spec, "Transactional email"; task brief's "Known facts.")
- `RESEND_API_KEY` is a Worker secret read via `cloudflare:workers`'s `env` inside a `createServerFn` handler — never `process.env`, never a `VITE_*` variable. (Task brief's "Known facts," matching the existing `SUPABASE_SERVICE_ROLE_KEY` convention.)
- 44px minimum tap targets; real `<button>`/`<input>` with `<label for>`; 4.5:1 text contrast; inline validation errors announced to assistive tech, not just a color change. (Spec, "Layout and breakpoints," carried over to this phase per the task brief.)
- Use the path alias `@/*` → `./src/*`. (Codebase convention, `tsconfig.json`.)
- Use the CSS tokens that actually exist in `src/styles.css` today (`text-destructive`, `border-border`, `bg-card`, `text-muted-foreground`, `text-primary`) — not the `--danger`/`--warn`/`--open` token names later member-admin/guild-admin plan snippets use, which belong to the not-yet-executed Brand Design Tokens phase.
- No new `wrangler.jsonc`/`wrangler.staging.jsonc` bindings: this plan reuses the Member Admin phase's existing `CREATOR_UPLOAD_RATE_LIMITER` binding under a new key namespace, per the task brief's explicit instruction not to invent a second rate-limiting mechanism.

## Decisions made while filling gaps the spec and task brief left open

1. **Resend is called with plain `fetch`, not the `resend` npm package.** A single `POST https://api.resend.com/emails` call with a bearer token and a JSON body needs nothing an SDK adds, and every other borderline dependency decision already made in this build sequence (EXIF stripping, file-signature detection) came down the same way: prefer a dependency-free implementation over verifying a package's Workers-runtime compatibility when one HTTP call is all that's needed. `fetch` is also trivial to stub in a test without mocking a client class.
2. **The honeypot mechanic is a hidden text input named `company`, checked server-side, that silently returns success with no row written and no mail sent when non-empty.** `company` reads as a plausible field to a bot that fills every input it finds in the DOM, and no real visitor filling out a personal contact form has a reason to see or fill it — it is `aria-hidden`, `tabIndex={-1}`, positioned off-screen (not merely `display:none`, which some bots skip), and excluded from the tab order so a keyboard or screen-reader user never encounters it. "Silently succeed" (task brief's own instruction) means the caller sees the same `{ ok: true }` result a genuine submission gets — nothing in the response distinguishes a caught bot from a real send.
3. **The two memberId-only triggers (`creator_upload_pending`, `hours_stale`) resolve "the member" to the first `member_users` row's user, ordered by `created_at` ascending** — the exact tie-break rule `resolveUserRoleAndTarget` (Member Admin phase, Task 3) already established for "a user with multiple `member_users` rows," reused here rather than inventing a second ordering rule. When a member has no `member_users` row yet (an imported, unclaimed member — spec, "Migrating the existing members"), there is genuinely no one to email; `sendTransactionalEmail` logs and returns rather than throwing, since this is an expected state, not a broken send.
4. **`member_invited`'s content links to a fixed `SITE_URL` constant (`https://iscbrewersguild.org`) plus `/signin`, not a Supabase-issued magic-link token.** `supabase.auth.admin.inviteUserByEmail()` (Guild Admin phase, Task 16) already sends Supabase's own invite email carrying a working auth token; this Resend email is the Guild's own friendlier "you're invited, here's where to sign in" message the spec's `/signin` route was explicitly built to be linkable from ("a real `/signin` route so it can go in emails"). `SITE_URL` is a named constant in `build-email-content.ts`, not repeated inline, so it's correctable in one place if the Guild ever needs the staging Worker's own transactional emails to point somewhere else — this plan does not add a `PUBLIC_SITE_URL` Worker var for that, since the only affected email fires from a Guild-admin-only, low-frequency, almost-always-production action.
5. **`GUILD_NOTIFICATION_EMAIL` (`iscbrewersguild@gmail.com`) is a named constant in `build-email-content.ts`**, exported and reused both by `send.ts`'s recipient resolution and by `src/routes/contact.tsx`'s own on-page display of the Guild's contact address — replacing that page's current, unrelated, and incorrect `hello@craftbrewersguild.org` placeholder. This is the one on-page copy fix this plan makes; the placeholder phone number and mailing address on the same page are left as-is, since no confirmed real values for those exist yet and inventing them is out of scope here.
6. **Contact-form validation lives in one pure module reused on both the client (for instant, accessible inline errors) and the server (as the authoritative check).** `validateContactFormInput` takes no I/O and returns a discriminated `{ valid: true; value }` / `{ valid: false; errors }` shape, so the same function that renders a client-side error under a field is also what the server falls back to if a request ever reaches it with invalid data the client should have caught (a disabled JS environment, a direct API call, or a stale client bundle).
7. **Field length caps: name ≤ 200 characters, email ≤ 320 characters (the RFC 5321 maximum mailbox length), phone ≤ 32 characters, message ≤ 5000 characters.** None of these are in the spec; they exist only to keep a single request from writing an unbounded row, chosen generously enough that no real submitter ever hits them.
8. **Rate limiting reuses the Member Admin phase's `CREATOR_UPLOAD_RATE_LIMITER` binding with keys prefixed `contact:<ip>`**, sharing that binding's fixed `{ limit: 5, period: 60 }` config (5 requests per 60 seconds) rather than adding a second `ratelimits` entry to `wrangler.jsonc`/`wrangler.staging.jsonc`. This is the task brief's own explicit instruction ("reusing Task 20's binding... new key namespace... rather than inventing a second rate-limiting mechanism"); the shared limit is a little coarse for a text form but is an accepted tradeoff of not touching Cloudflare Worker config in this phase. The IP is read from the `CF-Connecting-IP` request header, falling back to the literal string `"unknown"` (which simply means every IP-less request shares one bucket) if it's ever absent.
9. **The failed-Resend-call contract is unchanged from the throwing stub it replaces.** `sendTransactionalEmail` still throws — on a non-2xx Resend response or a missing `RESEND_API_KEY` — and every existing call site (`creator-upload.server.ts`, `hours-stale-cron.server.ts`, `invite-member.server.ts`, and this plan's own `submit-contact-form.server.ts`) already wraps the call in `try/catch` and logs-and-continues, so nothing about those call sites needs to change now that the throw is real instead of unconditional.
10. **If this plan is executed against a checkout where no earlier phase has actually run yet, `npm test` will fail because no `vitest` devDependency or `test` script exists today** (confirmed against the real `package.json` while writing this plan — `Vitest (existing)` in the Member Admin phase's own Tech Stack line assumes an earlier phase installed it). Task 1's first step calls this out explicitly rather than silently assuming the script works.

## File Structure

Pure logic (Vitest, no I/O):
- `src/lib/contact/contact-form-validation.ts` — field validation + honeypot check, shared by client and server.
- `src/lib/email/build-email-content.ts` — the `TransactionalEmailPayload` union, `GUILD_NOTIFICATION_EMAIL`, `SITE_URL`, and `buildEmailContent(payload)`.

Data access / mutations (server-only):
- `src/lib/email/resolve-recipient.server.ts` — new. `resolveRecipient(payload, supabase)`, injectable for testing.
- `src/lib/email/send.ts` — modified. Real `sendTransactionalEmail()`.
- `src/lib/contact/submit-contact-form.server.ts` — new. `submitContactForm`, the public `createServerFn`.

Routes:
- `src/routes/contact.tsx` — modified. Real rate-limited POST boundary + real form UI.

Existing files also modified: `.dev.vars.example` (created if it doesn't exist yet), `.env.example` (documentation only).

---

### Task 1: Pure logic — contact-form validation + honeypot check (TDD)

**Files:**
- Create: `src/lib/contact/contact-form-validation.ts`
- Create: `src/lib/contact/contact-form-validation.test.ts`

**Interfaces:**
- Produces: `ContactFormInput`, `ContactFormFieldErrors`, `ContactFormValidation`, `validateContactFormInput(input)`, `isHoneypotTripped(value)`. Consumed by `src/routes/contact.tsx` (Task 6, client-side) and `submit-contact-form.server.ts` (Task 5, server-side).
- Consumes: nothing.

Before starting: confirm Vitest actually runs in this checkout.

```bash
npm test -- --version
```

If this fails because there is no `test` script or no `vitest` devDependency (expected if no earlier phase in this build sequence has executed against this checkout yet — see this plan's Decision 10), run:

```bash
npm install -D vitest
```

and add `"test": "vitest run"` to `package.json`'s `"scripts"` block before continuing. If `npm test -- --version` already succeeds, skip straight to Step 1.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/contact/contact-form-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isHoneypotTripped, validateContactFormInput, type ContactFormInput } from "./contact-form-validation";

function makeInput(overrides: Partial<ContactFormInput> = {}): ContactFormInput {
  return {
    name: "Jo Rivera",
    email: "jo@example.com",
    phone: "",
    message: "Interested in learning more.",
    wantsMembershipInfo: false,
    honeypot: "",
    ...overrides,
  };
}

describe("validateContactFormInput", () => {
  it("accepts a fully valid submission with an empty phone", () => {
    const result = validateContactFormInput(makeInput());
    expect(result).toEqual({
      valid: true,
      value: {
        name: "Jo Rivera",
        email: "jo@example.com",
        phone: null,
        message: "Interested in learning more.",
        wantsMembershipInfo: false,
      },
    });
  });

  it("trims whitespace from every field", () => {
    const result = validateContactFormInput(
      makeInput({ name: "  Jo Rivera  ", email: "  jo@example.com  ", phone: "  555-0100  ", message: "  hi  " }),
    );
    expect(result).toEqual({
      valid: true,
      value: { name: "Jo Rivera", email: "jo@example.com", phone: "555-0100", message: "hi", wantsMembershipInfo: false },
    });
  });

  it("requires a name", () => {
    const result = validateContactFormInput(makeInput({ name: "" }));
    expect(result).toEqual({ valid: false, errors: { name: "Enter your name." } });
  });

  it("requires an email", () => {
    const result = validateContactFormInput(makeInput({ email: "" }));
    expect(result).toEqual({ valid: false, errors: { email: "Enter your email address." } });
  });

  it("rejects a malformed email", () => {
    const result = validateContactFormInput(makeInput({ email: "not-an-email" }));
    expect(result).toEqual({ valid: false, errors: { email: "Enter a valid email address." } });
  });

  it("requires a message", () => {
    const result = validateContactFormInput(makeInput({ message: "" }));
    expect(result).toEqual({ valid: false, errors: { message: "Enter a message." } });
  });

  it("caps name at 200 characters", () => {
    const result = validateContactFormInput(makeInput({ name: "a".repeat(201) }));
    expect(result).toEqual({ valid: false, errors: { name: "Name must be 200 characters or fewer." } });
  });

  it("caps email at 320 characters", () => {
    const longEmail = `${"a".repeat(311)}@example.com`; // 311 + 13 = 324 chars
    const result = validateContactFormInput(makeInput({ email: longEmail }));
    expect(result).toEqual({ valid: false, errors: { email: "Email must be 320 characters or fewer." } });
  });

  it("caps phone at 32 characters", () => {
    const result = validateContactFormInput(makeInput({ phone: "5".repeat(33) }));
    expect(result).toEqual({ valid: false, errors: { phone: "Phone must be 32 characters or fewer." } });
  });

  it("caps message at 5000 characters", () => {
    const result = validateContactFormInput(makeInput({ message: "a".repeat(5001) }));
    expect(result).toEqual({ valid: false, errors: { message: "Message must be 5000 characters or fewer." } });
  });

  it("collects more than one field error at once", () => {
    const result = validateContactFormInput(makeInput({ name: "", email: "" }));
    expect(result).toEqual({
      valid: false,
      errors: { name: "Enter your name.", email: "Enter your email address." },
    });
  });

  it("passes wantsMembershipInfo through unchanged", () => {
    const result = validateContactFormInput(makeInput({ wantsMembershipInfo: true }));
    expect(result.valid && result.value.wantsMembershipInfo).toBe(true);
  });
});

describe("isHoneypotTripped", () => {
  it("is false for an empty honeypot", () => {
    expect(isHoneypotTripped("")).toBe(false);
  });

  it("is false for a whitespace-only honeypot", () => {
    expect(isHoneypotTripped("   ")).toBe(false);
  });

  it("is true once anything is typed into it", () => {
    expect(isHoneypotTripped("Acme Corp")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- contact-form-validation
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/contact/contact-form-validation.ts`:

```ts
/**
 * Validation for the public contact form (spec, artboard O / "Joining, for
 * now": "collects name, email, phone, a message, and one checkbox"). This
 * module has no I/O so it is reused as-is on both sides of the wire: the
 * client imports it for instant, accessible inline errors, and the server
 * (submit-contact-form.server.ts) imports the exact same function as its
 * authoritative check, since a client can always be bypassed.
 *
 * Length caps (name/email/phone/message) are not in the spec -- they exist
 * only to keep a single public, unauthenticated request from writing an
 * unbounded row. 320 for email is the RFC 5321 maximum mailbox length; the
 * others are generous round numbers no real submitter will ever hit.
 */
export type ContactFormInput = {
  name: string;
  email: string;
  phone: string;
  message: string;
  wantsMembershipInfo: boolean;
  honeypot: string;
};

export type ContactFormFieldErrors = Partial<Record<"name" | "email" | "phone" | "message", string>>;

export type ContactFormValidation =
  | {
      valid: true;
      value: {
        name: string;
        email: string;
        phone: string | null;
        message: string;
        wantsMembershipInfo: boolean;
      };
    }
  | { valid: false; errors: ContactFormFieldErrors };

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const PHONE_MAX = 32;
const MESSAGE_MAX = 5000;

// Deliberately simple -- not full RFC 5322. A basic shape check plus the
// browser's own <input type="email"> validation on the client is a
// reasonable bar for a contact form; Resend will reject anything it can't
// actually deliver to regardless.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactFormInput(input: ContactFormInput): ContactFormValidation {
  const errors: ContactFormFieldErrors = {};

  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const message = input.message.trim();

  if (!name) {
    errors.name = "Enter your name.";
  } else if (name.length > NAME_MAX) {
    errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  }

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (email.length > EMAIL_MAX) {
    errors.email = `Email must be ${EMAIL_MAX} characters or fewer.`;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (phone.length > PHONE_MAX) {
    errors.phone = `Phone must be ${PHONE_MAX} characters or fewer.`;
  }

  if (!message) {
    errors.message = "Enter a message.";
  } else if (message.length > MESSAGE_MAX) {
    errors.message = `Message must be ${MESSAGE_MAX} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: { name, email, phone: phone || null, message, wantsMembershipInfo: input.wantsMembershipInfo },
  };
}

/**
 * A hidden field named "company" that no real visitor to a personal contact
 * form has a reason to see or fill (it is aria-hidden, tabIndex={-1}, and
 * positioned off-screen in the UI -- see contact.tsx, Task 6) but that a
 * bot filling every input it finds in the DOM often does. Whitespace counts
 * as untripped, matching how a real field's own "required" check trims.
 */
export function isHoneypotTripped(honeypotValue: string): boolean {
  return honeypotValue.trim().length > 0;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- contact-form-validation
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contact/contact-form-validation.ts src/lib/contact/contact-form-validation.test.ts package.json package-lock.json
git commit -m "feat: add shared contact-form validation and honeypot check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure logic — transactional email content for all five triggers (TDD)

**Files:**
- Create: `src/lib/email/build-email-content.ts`
- Create: `src/lib/email/build-email-content.test.ts`

**Interfaces:**
- Produces: `TransactionalEmailPayload` (the canonical, five-variant union — re-exported by `send.ts` in Task 4), `EmailContent`, `GUILD_NOTIFICATION_EMAIL`, `SITE_URL`, `buildEmailContent(payload)`. Consumed by `resolve-recipient.server.ts` (Task 3), `send.ts` (Task 4), and `src/routes/contact.tsx` (Task 6, for the on-page Guild-email display).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/email/build-email-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildEmailContent, GUILD_NOTIFICATION_EMAIL, SITE_URL } from "./build-email-content";

describe("named constants", () => {
  it("GUILD_NOTIFICATION_EMAIL is the Guild's real, currently-used contact inbox", () => {
    expect(GUILD_NOTIFICATION_EMAIL).toBe("iscbrewersguild@gmail.com");
  });

  it("SITE_URL is the Guild's real domain", () => {
    expect(SITE_URL).toBe("https://iscbrewersguild.org");
  });
});

describe("buildEmailContent: creator_upload_pending", () => {
  it("mentions the creator by name when one is given", () => {
    const content = buildEmailContent({
      trigger: "creator_upload_pending",
      memberId: "m1",
      assetId: "a1",
      creatorName: "Alex Kim",
    });
    expect(content.text).toContain("Alex Kim");
    expect(content.html).toContain("Alex Kim");
  });

  it("omits any attribution when no creator name was given", () => {
    const content = buildEmailContent({
      trigger: "creator_upload_pending",
      memberId: "m1",
      assetId: "a1",
      creatorName: null,
    });
    expect(content.text).not.toContain("from null");
    expect(content.subject).toBe("Something's waiting for your review");
  });
});

describe("buildEmailContent: hours_stale", () => {
  it("includes the exact confirmUrl and needs no login", () => {
    const content = buildEmailContent({
      trigger: "hours_stale",
      memberId: "m1",
      confirmUrl: "https://iscbrewersguild.org/api/confirm-hours/abc123",
    });
    expect(content.text).toContain("https://iscbrewersguild.org/api/confirm-hours/abc123");
    expect(content.html).toContain("https://iscbrewersguild.org/api/confirm-hours/abc123");
    expect(content.text.toLowerCase()).toContain("no sign-in");
  });
});

describe("buildEmailContent: member_invited", () => {
  it("links to SITE_URL/signin, not a token URL", () => {
    const content = buildEmailContent({ trigger: "member_invited", memberId: "m1", email: "new@example.com" });
    expect(content.text).toContain(`${SITE_URL}/signin`);
    expect(content.html).toContain(`${SITE_URL}/signin`);
  });
});

describe("buildEmailContent: contact_confirmation", () => {
  it("contains the spec's exact required sentence", () => {
    const content = buildEmailContent({
      trigger: "contact_confirmation",
      inquiryId: "i1",
      name: "Jo",
      email: "jo@example.com",
      wantsMembershipInfo: false,
    });
    expect(content.text).toContain("Thank you for reaching out. We have received your submission.");
  });

  it("adds the membership follow-up line only when the checkbox was ticked", () => {
    const withMembership = buildEmailContent({
      trigger: "contact_confirmation",
      inquiryId: "i1",
      name: "Jo",
      email: "jo@example.com",
      wantsMembershipInfo: true,
    });
    const withoutMembership = buildEmailContent({
      trigger: "contact_confirmation",
      inquiryId: "i1",
      name: "Jo",
      email: "jo@example.com",
      wantsMembershipInfo: false,
    });
    expect(withMembership.text.toLowerCase()).toContain("membership");
    expect(withoutMembership.text.toLowerCase()).not.toContain("membership");
  });
});

describe("buildEmailContent: contact_form_submitted", () => {
  it("includes the full inquiry content", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: "555-0100",
      message: "Tell me more.",
      wantsMembershipInfo: false,
    });
    expect(content.text).toContain("Jo Rivera");
    expect(content.text).toContain("jo@example.com");
    expect(content.text).toContain("555-0100");
    expect(content.text).toContain("Tell me more.");
  });

  it("flags the subject and body when it is a membership lead", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: true,
    });
    expect(content.subject).toContain("Membership Lead");
    expect(content.text).toContain("MEMBERSHIP LEAD");
  });

  it("does not flag a plain general question", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: false,
    });
    expect(content.subject).not.toContain("Membership Lead");
    expect(content.text).not.toContain("MEMBERSHIP LEAD");
  });

  it("renders a placeholder for a missing phone or message rather than the literal word null", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo Rivera",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: false,
    });
    expect(content.text).not.toContain("null");
  });

  it("HTML-escapes a submitter-controlled field", () => {
    const content = buildEmailContent({
      trigger: "contact_form_submitted",
      inquiryId: "i1",
      name: "Jo <script>alert(1)</script>",
      email: "jo@example.com",
      phone: null,
      message: null,
      wantsMembershipInfo: false,
    });
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- build-email-content
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/email/build-email-content.ts`:

```ts
/**
 * The canonical shape of every transactional email this build sends (spec,
 * "Transactional email"). This is the single source of truth for
 * TransactionalEmailPayload -- send.ts (Task 4) imports and re-exports it
 * rather than declaring its own copy, so every existing call site
 * (creator-upload.server.ts, hours-stale-cron.server.ts,
 * invite-member.server.ts, and this plan's own submit-contact-form.server.ts)
 * keeps importing the type from "@/lib/email/send" unchanged.
 *
 * This module does no I/O and is safe to import from a client component
 * (src/routes/contact.tsx does, for GUILD_NOTIFICATION_EMAIL) as well as
 * from server-only code.
 */
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string }
  | { trigger: "member_invited"; memberId: string; email: string }
  | { trigger: "contact_confirmation"; inquiryId: string; name: string; email: string; wantsMembershipInfo: boolean }
  | {
      trigger: "contact_form_submitted";
      inquiryId: string;
      name: string;
      email: string;
      phone: string | null;
      message: string | null;
      wantsMembershipInfo: boolean;
    };

export type EmailContent = { subject: string; html: string; text: string };

/**
 * The Guild's real, currently-used contact inbox (confirmed against
 * src/components/site/UnderConstruction.tsx's existing mailto: link this
 * session). A single named constant, not repeated inline, so it's
 * trivially correctable in one place if this guess is ever wrong --
 * reused by send.ts's recipient resolution (Task 3) and by contact.tsx's
 * own on-page display (Task 6).
 */
export const GUILD_NOTIFICATION_EMAIL = "iscbrewersguild@gmail.com";

/** The Guild's real domain, confirmed against the spec and this session's own research. */
export const SITE_URL = "https://iscbrewersguild.org";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapHtml(paragraphs: string[]): string {
  return `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;">${paragraphs
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("\n")}</div>`;
}

export function buildEmailContent(payload: TransactionalEmailPayload): EmailContent {
  switch (payload.trigger) {
    case "creator_upload_pending": {
      const attribution = payload.creatorName ? ` from ${payload.creatorName}` : "";
      const text =
        `Something is waiting for review. A file${attribution} was uploaded to your media gallery and ` +
        `needs your approval before it can appear on your profile.\n\nReview it: ${SITE_URL}/admin/media`;
      return {
        subject: "Something's waiting for your review",
        text,
        html: wrapHtml([
          `Something is waiting for review. A file${escapeHtml(attribution)} was uploaded to your media ` +
            "gallery and needs your approval before it can appear on your profile.",
          `<a href="${SITE_URL}/admin/media">Review it in your admin panel</a>`,
        ]),
      };
    }

    case "hours_stale": {
      const text =
        "It's been a while since you confirmed your posted hours are still accurate. Click below to " +
        `confirm them now — no sign-in needed:\n\n${payload.confirmUrl}`;
      return {
        subject: "Please confirm your hours are still accurate",
        text,
        html: wrapHtml([
          "It's been a while since you confirmed your posted hours are still accurate. Click below to " +
            "confirm them now — no sign-in needed.",
          `<a href="${payload.confirmUrl}">Confirm my hours</a>`,
        ]),
      };
    }

    case "member_invited": {
      const signInUrl = `${SITE_URL}/signin`;
      const text =
        "Welcome to the IE Brewers Guild! The Guild has created a profile for your business on the " +
        `member directory. Sign in anytime with this email address to start filling it in:\n\n${signInUrl}`;
      return {
        subject: "You're invited to the IE Brewers Guild member directory",
        text,
        html: wrapHtml([
          "Welcome to the IE Brewers Guild! The Guild has created a profile for your business on the " +
            "member directory.",
          `Sign in anytime with this email address to start filling it in: <a href="${signInUrl}">${signInUrl}</a>`,
        ]),
      };
    }

    case "contact_confirmation": {
      const membershipLine = payload.wantsMembershipInfo
        ? " A Guild representative will be in touch to discuss membership."
        : "";
      const text = `Thank you for reaching out. We have received your submission.${membershipLine}`;
      return {
        subject: "We've received your message — IE Brewers Guild",
        text,
        html: wrapHtml([`Thank you for reaching out. We have received your submission.${membershipLine}`]),
      };
    }

    case "contact_form_submitted": {
      const isMembershipLead = payload.wantsMembershipInfo;
      const lines = [
        isMembershipLead ? "MEMBERSHIP LEAD" : "General inquiry",
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Phone: ${payload.phone ?? "(not given)"}`,
        `Wants membership info: ${isMembershipLead ? "Yes" : "No"}`,
        `Message: ${payload.message ?? "(no message)"}`,
      ];
      return {
        subject: `${isMembershipLead ? "[Membership Lead] " : ""}New contact form submission`,
        text: lines.join("\n"),
        html: wrapHtml(lines.map(escapeHtml)),
      };
    }
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- build-email-content
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/build-email-content.ts src/lib/email/build-email-content.test.ts
git commit -m "feat: add pure content builder for all five transactional-email triggers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Recipient resolution per trigger (TDD, injectable Supabase client)

**Files:**
- Create: `src/lib/email/resolve-recipient.server.ts`
- Create: `src/lib/email/resolve-recipient.server.test.ts`

**Interfaces:**
- Produces: `resolveRecipient(payload, supabase)`. Consumed by `send.ts` (Task 4).
- Consumes: `TransactionalEmailPayload`, `GUILD_NOTIFICATION_EMAIL` (Task 2); a Supabase client, injected as a parameter (this is what makes the function unit-testable without a real database — same pattern as `resolveUserRoleAndTarget` in the Member Admin phase's `src/lib/auth/role-routing.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/email/resolve-recipient.server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRecipient } from "./resolve-recipient.server";
import { GUILD_NOTIFICATION_EMAIL } from "./build-email-content";

function fakeSupabase(opts: {
  memberUser: { user_id: string } | null;
  userEmail: string | null;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "member_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: opts.memberUser, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: opts.userEmail ? { user: { email: opts.userEmail } } : { user: null },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("resolveRecipient", () => {
  it("member_invited uses the payload's own email, with no DB lookup", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient({ trigger: "member_invited", memberId: "m1", email: "new@example.com" }, supabase);
    expect(to).toBe("new@example.com");
  });

  it("contact_confirmation uses the payload's own email", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient(
      { trigger: "contact_confirmation", inquiryId: "i1", name: "Jo", email: "jo@example.com", wantsMembershipInfo: false },
      supabase,
    );
    expect(to).toBe("jo@example.com");
  });

  it("contact_form_submitted always goes to the Guild's notification address", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient(
      {
        trigger: "contact_form_submitted",
        inquiryId: "i1",
        name: "Jo",
        email: "jo@example.com",
        phone: null,
        message: null,
        wantsMembershipInfo: false,
      },
      supabase,
    );
    expect(to).toBe(GUILD_NOTIFICATION_EMAIL);
  });

  it("creator_upload_pending resolves the first member_users owner's real email", async () => {
    const supabase = fakeSupabase({ memberUser: { user_id: "u1" }, userEmail: "owner@example.com" });
    const to = await resolveRecipient(
      { trigger: "creator_upload_pending", memberId: "m1", assetId: "a1", creatorName: null },
      supabase,
    );
    expect(to).toBe("owner@example.com");
  });

  it("hours_stale resolves the first member_users owner's real email", async () => {
    const supabase = fakeSupabase({ memberUser: { user_id: "u1" }, userEmail: "owner@example.com" });
    const to = await resolveRecipient(
      { trigger: "hours_stale", memberId: "m1", confirmUrl: "https://x/y" },
      supabase,
    );
    expect(to).toBe("owner@example.com");
  });

  it("returns null when the member has no member_users row yet (unclaimed, imported member)", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient(
      { trigger: "hours_stale", memberId: "m1", confirmUrl: "https://x/y" },
      supabase,
    );
    expect(to).toBeNull();
  });

  it("returns null when the member_users row's user can't be looked up", async () => {
    const supabase = fakeSupabase({ memberUser: { user_id: "u1" }, userEmail: null });
    const to = await resolveRecipient(
      { trigger: "creator_upload_pending", memberId: "m1", assetId: "a1", creatorName: null },
      supabase,
    );
    expect(to).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- resolve-recipient
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/email/resolve-recipient.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { GUILD_NOTIFICATION_EMAIL, type TransactionalEmailPayload } from "@/lib/email/build-email-content";

/**
 * "The member" in the spec's transactional-email table, for a trigger whose
 * payload carries only memberId (creator_upload_pending, hours_stale), is
 * whoever member_users says edits that profile. Uses the exact same "first
 * membership found, ordered by created_at ascending" tie-break rule the
 * Member Admin phase's resolveUserRoleAndTarget already established
 * (src/lib/auth/role-routing.ts) -- not a second, differently-ordered rule.
 * Returns null when the member has no member_users row yet, or when that
 * row's user can't be looked up -- both mean "no one to email," which the
 * caller (send.ts) treats as a non-error, not a send failure.
 */
async function resolveMemberOwnerEmail(supabase: SupabaseClient, memberId: string): Promise<string | null> {
  const { data: memberUser, error: memberUserError } = await supabase
    .from("member_users")
    .select("user_id")
    .eq("member_id", memberId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberUserError) throw new Error(memberUserError.message);
  if (!memberUser?.user_id) return null;

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(memberUser.user_id);
  if (userError || !userData?.user?.email) return null;
  return userData.user.email;
}

export async function resolveRecipient(
  payload: TransactionalEmailPayload,
  supabase: SupabaseClient,
): Promise<string | null> {
  switch (payload.trigger) {
    case "member_invited":
      return payload.email;
    case "contact_confirmation":
      return payload.email;
    case "contact_form_submitted":
      return GUILD_NOTIFICATION_EMAIL;
    case "creator_upload_pending":
    case "hours_stale":
      return resolveMemberOwnerEmail(supabase, payload.memberId);
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- resolve-recipient
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/resolve-recipient.server.ts src/lib/email/resolve-recipient.server.test.ts
git commit -m "feat: add per-trigger recipient resolution for transactional email

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Real Resend-calling `sendTransactionalEmail()` + `RESEND_API_KEY` secret

**Files:**
- Modify: `src/lib/email/send.ts`
- Create: `.dev.vars.example` (if it doesn't already exist in this checkout — see Step 3)
- Modify: `.env.example`

**Interfaces:**
- Produces: `sendTransactionalEmail(payload)` (unchanged signature/throwing contract), re-exports `TransactionalEmailPayload`. Consumed, unmodified, by every existing call site (`creator-upload.server.ts`, `hours-stale-cron.server.ts`, `invite-member.server.ts`) and, new in this plan, `submit-contact-form.server.ts` (Task 5).
- Consumes: `buildEmailContent` (Task 2), `resolveRecipient` (Task 3), `getSupabaseServiceRoleClient` (existing, `src/lib/supabase/server.ts`).

`send.ts` currently reads (Member Admin phase's Task 19, as extended by Guild Admin's Task 16 — read this file's real content in your own checkout before editing, since the exact text may have drifted slightly during those phases' actual execution):

```ts
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string }
  | { trigger: "member_invited"; memberId: string; email: string };

export async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void> {
  throw new Error(
    `sendTransactionalEmail() is not implemented yet (trigger: "${payload.trigger}"). ` +
      "Wire this up in the Contact Form + Resend phase — see docs/member-profiles.md, 'Transactional email'.",
  );
}
```

- [ ] **Step 1: Replace the file's contents**

Replace the entire contents of `src/lib/email/send.ts` with:

```ts
/**
 * The real Resend-calling implementation of every transactional email the
 * spec's "Transactional email" table describes (docs/member-profiles.md).
 * Every existing call site already wraps sendTransactionalEmail() in
 * try/catch and logs-and-continues on failure (creator-upload.server.ts,
 * hours-stale-cron.server.ts, invite-member.server.ts, and this phase's own
 * submit-contact-form.server.ts) -- that contract is unchanged from the
 * throwing stub this replaces. It still throws on a genuine send failure
 * (a non-2xx Resend response, or a missing RESEND_API_KEY), so those
 * existing try/catch blocks keep doing something meaningful.
 *
 * It does NOT throw when a memberId-only trigger's target member has no
 * one to email yet (resolveRecipient returns null for an unclaimed,
 * imported member -- spec, "Migrating the existing members") -- that's an
 * expected, non-error state, not a broken send, so it logs a notice and
 * returns instead of raising an alarm for something that isn't failing.
 *
 * A single fetch() call against Resend's HTTP API, not the `resend` npm
 * package -- one POST with a bearer token and a JSON body needs nothing an
 * SDK adds, matching every other borderline-dependency decision already
 * made in this build (see this plan's Decision 1).
 */
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildEmailContent } from "@/lib/email/build-email-content";
import { resolveRecipient } from "@/lib/email/resolve-recipient.server";

export type { TransactionalEmailPayload } from "@/lib/email/build-email-content";
import type { TransactionalEmailPayload } from "@/lib/email/build-email-content";

const RESEND_API_URL = "https://api.resend.com/emails";

// mail.iscbrewersguild.org is already verified in Resend (SPF/DKIM/DMARC in
// place before the first send) -- spec, "Transactional email"; task brief's
// "Known facts." No further domain-verification work belongs in this file.
const TRANSACTIONAL_FROM_ADDRESS = "IE Brewers Guild <notifications@mail.iscbrewersguild.org>";

type EmailWorkerEnv = { RESEND_API_KEY?: string };

// Duplicated locally rather than exported from src/lib/supabase/server.ts's
// own getWorkerEnv, matching the convention the Guild Admin phase's
// impersonation module already established for the same reason: avoid
// widening an existing file's public API for one new env key.
async function getEmailWorkerEnv(): Promise<EmailWorkerEnv> {
  const { env } = await import("cloudflare:workers");
  return env as EmailWorkerEnv;
}

export async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void> {
  const supabase = await getSupabaseServiceRoleClient();
  const to = await resolveRecipient(payload, supabase);

  if (!to) {
    const memberIdNote = "memberId" in payload ? ` (memberId: ${payload.memberId})` : "";
    console.warn(
      `sendTransactionalEmail: no recipient for trigger "${payload.trigger}"${memberIdNote} -- skipping, nothing sent.`,
    );
    return;
  }

  const env = await getEmailWorkerEnv();
  if (!env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in the Worker environment.");
  }

  const content = buildEmailContent(payload);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: TRANSACTIONAL_FROM_ADDRESS,
      to: [to],
      subject: content.subject,
      html: content.html,
      text: content.text,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Resend request failed for trigger "${payload.trigger}" (${response.status} ${response.statusText}): ${responseBody}`,
    );
  }
}
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors. If the real `send.ts` in your checkout has drifted from the text quoted above (e.g. a different comment, or the `member_invited` variant added in a slightly different spot), keep every existing variant of `TransactionalEmailPayload` — this step only replaces the union's *declaration location* (now `build-email-content.ts`, re-exported here) and the function body, not any call site's existing payload shape.

- [ ] **Step 3: Document `RESEND_API_KEY` for local dev**

If `.dev.vars.example` doesn't exist yet in this checkout (it's introduced by the Public Member Profile phase for `SUPABASE_SERVICE_ROLE_KEY` — check first), create it:

```bash
# Copy this file to `.dev.vars` (gitignored) and fill in real values.
#
# These are read at runtime via `cloudflare:workers`'s `env`, inside
# createServerFn/createServerOnlyFn handlers only -- see
# src/lib/supabase/server.ts and src/lib/email/send.ts. This is a
# *different* mechanism from the VITE_* build-time variables in
# .env.example: those get inlined into the client bundle at build time,
# these stay server-only at request time.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
```

If `.dev.vars.example` already exists (an earlier phase created it), instead open it and append:

```bash
# From the Resend dashboard (resend.com/api-keys). Used to send every
# transactional email in src/lib/email/send.ts. mail.iscbrewersguild.org is
# already verified in Resend -- no domain setup needed, just the key.
RESEND_API_KEY=
```

Then copy `.dev.vars.example` to your own local `.dev.vars` (gitignored, no `.gitignore` change needed — it's already covered by the entry the Public Member Profile phase added) and paste in your real Resend API key.

- [ ] **Step 4: Document the production/staging secret**

Add to `.env.example`, after the existing entries:

```bash
# Server-side secret read by src/lib/email/send.ts (never a VITE_* var --
# that would leak it into the browser bundle). Get it from the Resend
# dashboard (resend.com/api-keys). Set it locally in .dev.vars (see
# .dev.vars.example), and in Cloudflare for the real deployments with:
#   npx wrangler secret put RESEND_API_KEY
#   npx wrangler secret put RESEND_API_KEY --config wrangler.staging.jsonc
# Cloudflare secrets are never committed to this repo -- that command
# writes directly to Cloudflare, not to a file here.
```

- [ ] **Step 5: Set the real secret (Guild owner's own action, plain-language)**

This step is for the Guild's own site owner, not something to run in this checkout blind — it needs a real Resend API key:

1. Log into Resend, go to API Keys, and copy an existing key (or create one).
2. In a terminal, in this project's folder, run `npx wrangler secret put RESEND_API_KEY`, paste the key when prompted, and press Enter. This sets it for production.
3. Run it again with `--config wrangler.staging.jsonc` to set the same key for the staging site.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/send.ts .dev.vars.example .env.example
git commit -m "feat: implement sendTransactionalEmail() against Resend for real

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Public contact-form submission path

**Files:**
- Create: `src/lib/contact/submit-contact-form.server.ts`

**Interfaces:**
- Produces: `SubmitContactFormResult`, `submitContactForm(input)` — a `createServerFn`, no auth, everything through the service-role client (RLS blocks all public access to `inquiries`).
- Consumes: `validateContactFormInput`/`isHoneypotTripped` (Task 1), `sendTransactionalEmail` (Task 4), `getSupabaseServiceRoleClient` (existing), `InquiryRow` (Guild Admin phase, Task 4, `src/lib/supabase/types.ts`).

- [ ] **Step 1: Implement the server function**

Create `src/lib/contact/submit-contact-form.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  isHoneypotTripped,
  validateContactFormInput,
  type ContactFormFieldErrors,
  type ContactFormInput,
} from "@/lib/contact/contact-form-validation";
import type { InquiryRow } from "@/lib/supabase/types";

export type SubmitContactFormResult = { ok: true } | { ok: false; errors: ContactFormFieldErrors };

/**
 * No auth by design (spec: "Inserts go through the Worker with the service
 * key, never a client-side Supabase call" -- inquiries' own RLS blocks all
 * public access outright). This function is the one place allowed to
 * bypass that block. The route boundary (src/routes/contact.tsx, Task 6)
 * applies the per-IP rate limit before this function ever runs; this
 * function's own job is the honeypot check, validation, the write, and
 * firing both contact-form email triggers.
 *
 * A tripped honeypot returns the exact same { ok: true } shape a genuine
 * submission gets, with no row written and no mail sent -- a bot can't
 * tell it was caught (this plan's Decision 2).
 */
export const submitContactForm = createServerFn({ method: "POST" })
  .inputValidator((data: ContactFormInput) => data)
  .handler(async ({ data }): Promise<SubmitContactFormResult> => {
    if (isHoneypotTripped(data.honeypot)) {
      return { ok: true };
    }

    const validation = validateContactFormInput(data);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }

    const supabase = await getSupabaseServiceRoleClient();

    const { data: inserted, error: insertError } = await supabase
      .from("inquiries")
      .insert({
        name: validation.value.name,
        email: validation.value.email,
        phone: validation.value.phone,
        message: validation.value.message,
        wants_membership_info: validation.value.wantsMembershipInfo,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Could not save your message. Try again in a moment.");
    }

    const inquiry = inserted as InquiryRow;

    // Fires independently of the Guild notification below. Only a
    // successful send here sets confirmation_sent_at -- that column is
    // exactly what lets the Guild-admin inquiries screen tell a delivered
    // auto-reply from one Resend silently failed to send (spec, inquiries
    // section).
    try {
      await sendTransactionalEmail({
        trigger: "contact_confirmation",
        inquiryId: inquiry.id,
        name: inquiry.name,
        email: inquiry.email,
        wantsMembershipInfo: inquiry.wants_membership_info,
      });
      await supabase
        .from("inquiries")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", inquiry.id);
    } catch (err) {
      console.error("sendTransactionalEmail(contact_confirmation) failed", err);
    }

    try {
      await sendTransactionalEmail({
        trigger: "contact_form_submitted",
        inquiryId: inquiry.id,
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        message: inquiry.message,
        wantsMembershipInfo: inquiry.wants_membership_info,
      });
    } catch (err) {
      console.error("sendTransactionalEmail(contact_form_submitted) failed", err);
    }

    return { ok: true };
  });
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors. (`InquiryRow` must already exist in `src/lib/supabase/types.ts` — Guild Admin phase, Task 4. If this checkout hasn't run that task yet, add the same `InquiryRow` type shown in that plan's Task 4 to `src/lib/supabase/types.ts` before continuing — it is not this plan's to redefine, but it is a hard prerequisite.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/contact/submit-contact-form.server.ts
git commit -m "feat: add the public contact-form submission path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire `/contact` — rate limit, honeypot field, real submit → success/error UI

**Files:**
- Modify: `src/routes/contact.tsx`

**Interfaces:**
- Produces: the real `/contact` page. Its `server.handlers.POST` is the request boundary that checks the rate limiter before calling `submitContactForm`.
- Consumes: `submitContactForm` (Task 5), `validateContactFormInput`/`isHoneypotTripped`/`ContactFormFieldErrors` (Task 1), `GUILD_NOTIFICATION_EMAIL` (Task 2).

The current file (read from the real repo, not guessed at) is a client-only fake: a `useState` form with `name`, `email`, `subject`, `message`, and an `onSubmit` that only calls `toast.success(...)` — no network call at all, and no `phone` field or membership checkbox. `subject` isn't part of the spec's artboard O field set (name, email, phone, message, one checkbox) and is dropped; `phone` and the membership checkbox are added. The aside's hardcoded `hello@craftbrewersguild.org` — a stale placeholder on the wrong domain — is replaced with the real `GUILD_NOTIFICATION_EMAIL` constant; the placeholder phone number and mailing address next to it are left as-is, since no confirmed real values for those exist yet.

- [ ] **Step 1: Replace the file's contents**

Replace the entire contents of `src/routes/contact.tsx` with:

```tsx
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
      const result = await response.json();

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
```

- [ ] **Step 2: Verify the project type-checks**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Verify manually**

```bash
npm run build:staging
```

(The `ratelimits` binding only works under `wrangler dev`/a real Worker, not plain `vite dev` — matching the Member Admin phase's own note about `/send/$token`. Confirm the build succeeds here, then run `npm run dev` and confirm: the form renders with Name/Email/Phone/Message/the membership checkbox and no visible "Company" field; tabbing through the form with the keyboard never lands on the hidden honeypot input; leaving Name or Email blank and blurring shows an inline error; the aside's email line now reads `iscbrewersguild@gmail.com`. Exercising an actual successful submission needs a real Supabase project and `RESEND_API_KEY` set locally per Task 4 — defer that to a staging deploy.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/contact.tsx
git commit -m "feat: wire the public contact form to the real submission path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-review

**1. Spec coverage.**
- "Joining, for now" field set (name, email, phone, message, one membership checkbox) → Task 6's form, validated against Task 1.
- Confirmation email's exact required sentence, plus the conditional membership line → Task 2's `contact_confirmation` case, tested verbatim in Task 2's tests.
- Guild notification, flagged when a membership lead → Task 2's `contact_form_submitted` case (subject and body both flagged), tested.
- Rate limit per IP + honeypot at minimum → Task 6's `server.handlers.POST` (rate limit) and Task 5/1 (honeypot).
- `inquiries` RLS (no public select, service-role-only insert) → Task 5 uses `getSupabaseServiceRoleClient` exclusively, never a session client, matching the Guild Admin phase's Task 1 migration.
- `confirmation_sent_at` set only on a successful sender-confirmation send → Task 5's `try` block sets it inside the same block that awaits the send, not unconditionally.
- All five transactional-email triggers implemented for real → Task 4's `sendTransactionalEmail`, dispatching through Task 2 (content) and Task 3 (recipient) for every variant.
- Resend domain / no domain-verification work → Task 4's `TRANSACTIONAL_FROM_ADDRESS`, no DNS/verification steps anywhere in this plan.
- `RESEND_API_KEY` as a Worker secret, never `VITE_*` → Task 4, Steps 3–5.
- 44px/labels/contrast/accessible inline errors → Task 6's form markup (`h-11` throughout, real `<label htmlFor>`, `role="alert"` + `aria-describedby` + `aria-invalid` on every field, `text-destructive` — the token that actually exists in `src/styles.css` today).

**2. Placeholder scan.** Searched this plan's own text for "TBD," "implement later," "add appropriate," "similar to Task N," and bare prose describing code without showing it. None found. The one place this plan explicitly names an assumption rather than fully resolving it — `member_invited` linking to a fixed `SITE_URL` rather than a request-derived origin (Decision 4), and the shared, slightly-coarse rate limit (Decision 8) — is a stated, reasoned tradeoff, not an unfinished stub; both still produce a fully working, real send/limit today.

**3. Type consistency.** `TransactionalEmailPayload` is declared once, in `build-email-content.ts` (Task 2), and every other file (`resolve-recipient.server.ts`, `send.ts`, `submit-contact-form.server.ts`) imports that exact type rather than redeclaring it — checked by re-reading each file's import line above. `ContactFormFieldErrors`/`ContactFormInput` are likewise declared once, in `contact-form-validation.ts` (Task 1), and reused by name in `submit-contact-form.server.ts` and `contact.tsx`. `GUILD_NOTIFICATION_EMAIL` and `SITE_URL` are each declared exactly once, in `build-email-content.ts`, and every other reference (`send.ts`, `resolve-recipient.server.test.ts`, `contact.tsx`) imports rather than re-literals them, satisfying the task brief's "single named constant... trivially correctable" instruction for both.

**Confirmation this plan's modification steps were written against the real repo, not guessed at:** `src/routes/contact.tsx` was read in full before Task 6 was written — it is exactly the client-only fake described (a `useState` form with `name`/`email`/`subject`/`message` and a `toast.success()`-only submit, no network call), which is why Task 6 explicitly calls out dropping `subject` and adding `phone`/the membership checkbox as a reconciliation against the spec rather than a guess. `src/lib/email/send.ts` does **not exist yet** in this checkout — confirmed by a direct file read (not found) and a directory listing of `src/lib/email/` and `src/lib/` (neither contains it, nor `src/lib/supabase/` at all) — because the Member Admin and Guild Admin phases that create and extend it are themselves still unexecuted plans in this repo, exactly like this plan. Task 4 is therefore written against those two plans' own literal, quoted file contents (read directly from `docs/superpowers/plans/2026-09-21-member-admin.md` Task 19 and `docs/superpowers/plans/2026-09-21-guild-admin.md` Task 16) as the contract for what will exist by the time this plan runs, with an explicit note at Task 4's Step 2 telling the executor to reconcile against whatever the file's real, as-executed content turns out to be if it drifted.
