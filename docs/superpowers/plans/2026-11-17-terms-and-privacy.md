# Terms of Use and Privacy Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plain-English /privacy and /terms pages, link them in the footer, and show a one-line agreement notice beside Join's Submit and every Publish button.

**Architecture:** One constants module holds the legal facts (name, contact email, effective date, county). Two static routes render the documents with the About page's look. A small `LegalNotice` component (plain `<a>` links, opening in a new tab so editors don't lose their place) is dropped beside the existing buttons.

**Tech Stack:** TanStack Start routes, React, Tailwind, Vitest (Node environment; components tested with `renderToStaticMarkup`).

**Spec:** docs/superpowers/specs/2026-11-17-terms-and-privacy-design.md

## Global Constraints

- Legal name: `Inland Southern California Brewers Guild`; `501(c)(6)` nonprofit trade association.
- Contact: `legal@iscbrewersguild.org` (owner sets it up before go-live; Claude walks them through Cloudflare Email Routing).
- Disputes: California law, `San Bernardino County`.
- Content reuse decision B: website + Guild social media, newsletters and event promotion, credited; opt out by emailing legal@.
- Notice text, exact: Join — `By submitting, you agree to the Terms and Privacy Policy.`; Publish — `By publishing, you agree to the Terms and Privacy Policy.` ("Terms" → /terms, "Privacy Policy" → /privacy).
- US English (color, canceled, "check the box"). No checkbox. No email is sent by any of this.
- `npm run build` (placeholder VITE_ vars) before every staging push; Member Guide updated before main.

## Review Focus

1. A media_events editor's "Publish photos" button also gets the notice (it is still a Publish).
2. Mobile members publish without the hours dialog (direct `runPublish`): the notice must be visible in the publish bar itself, not only in the dialog.
3. Maintenance mode on: /terms and /privacy still load for the public.
4. Notice links open in a new tab, so an editor mid-publish doesn't lose the page.
5. Phone width: the notice wraps under the buttons without pushing the publish bar off-screen.

---

### Task 1: Legal constants and the LegalNotice component

**Files:**
- Create: `src/lib/site/legal.ts`, `src/components/site/LegalNotice.tsx`
- Test: `src/components/site/LegalNotice.test.ts`

**Interfaces — Produces:**
- `LEGAL` = `{ name, shortName: "ISC Brewers Guild", entity: "a 501(c)(6) nonprofit trade association", email: "legal@iscbrewersguild.org", county: "San Bernardino County", effectiveDate: "<Month D, YYYY>" }`
- `LegalNotice({ action: "submitting" | "publishing", className?: string })` renders `<p>` with the exact notice text, links `href="/terms"` and `href="/privacy"`, `target="_blank" rel="noreferrer"`.

- [ ] Test: `renderToStaticMarkup(<LegalNotice action="publishing" />)` contains `By publishing, you agree to the`, `href="/terms"`, `href="/privacy"`, `target="_blank"`; `action="submitting"` gives `By submitting`.
- [ ] Run it, see it fail; implement; run it, see it pass; commit.

### Task 2: /privacy and /terms pages, footer links, maintenance exemption

**Files:**
- Create: `src/routes/privacy.tsx`, `src/routes/terms.tsx`, `src/components/site/LegalPage.tsx` (shared layout: title, effective date, sections, "please have a lawyer review" is NOT shown publicly — it lives in the spec)
- Modify: `src/components/site/Footer.tsx` (bottom row: Privacy, Terms), `src/lib/site/maintenance.ts` (`/terms`, `/privacy` in OPEN_PREFIXES)
- Test: `src/lib/site/maintenance.test.ts` (both paths open while on), `src/components/site/LegalPage.test.ts` (privacy and terms page components render the legal name, legal@, San Bernardino County on terms, the Google terms/privacy links on privacy, "Do Not Track" on privacy, the effective date)

Content follows the spec's Content section exactly (every listed point present). Head: title `Privacy Policy — ISC Brewers Guild` / `Terms of Use — ISC Brewers Guild`, meta description.

- [ ] Tests first, fail, implement, pass, commit.

### Task 3: Notices beside Submit and every Publish

**Files:**
- Modify: `src/components/join/JoinPreview.tsx` (under Submit to the Guild), `src/components/admin/PublishGateDialog.tsx` (publish bar, under the buttons, whenever the Publish button shows; and in the dialog footer beside the confirm button), `src/components/portal/setup/FinishSteps.tsx` (the wizard's publish step, when not up to date and not blocked)
- Test: extend an existing pure test or add `LegalNotice` placement checks where a component is already render-tested; otherwise verify by build + screenshot.

- [ ] Implement, `npx tsc --noEmit`, full `npx vitest run`, build, commit, push to staging.

### Task 4: Member Guide

- [ ] Find guide screenshots showing a Publish button (11-preview, 12-last-check, any others); re-take or re-stamp them so they show the notice; add one line to page 1 "Good to know" only if it fits; `npm run build:guides`; check pages; commit; push to staging.

### Task 5: legal@ address (with the owner)

- [ ] Walk the owner through Cloudflare Email Routing → Routing rules → Create address `legal` → destination the owner picks (boblelle77@gmail.com is already verified). Test from a different account. Optional: Gmail "Send mail as" using the existing "Gmail - webmaster" Resend key.
- [ ] Only after legal@ is confirmed working and the owner says "go": merge to main.

### Task 6: Announcement to existing members (owner sends)

Owner decision 2026-11-17: published members agreed to website display by publishing, but not to reuse beyond the website (decision B). They are told once, by the owner, after the pages are live.

- [ ] Draft the broadcast text for the owner (subject + body, US English, plain): the Guild has posted Terms of Use and a Privacy Policy (links); nothing changes in how profiles work; the Guild may now feature member logos and photos on social media, newsletters and event promotion, always credited; to opt out, email legal@iscbrewersguild.org; keeping a profile published means agreeing to the Terms.
- [ ] The owner sends it with the Guild Broadcast tool (no code sends anything). Claude never sends it.
- [ ] Rule for the Guild: no reuse of an existing member's content beyond the website until 30 days after the send date. Opt-outs are kept in the legal@ inbox (a Gmail label "Opted out"); no database change.
- [ ] Save the send date and the 30-day date to memory.
