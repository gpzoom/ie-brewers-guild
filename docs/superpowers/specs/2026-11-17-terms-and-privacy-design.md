# Terms of Use and Privacy Policy — design

Date: 2026-11-17. Status: approved by the owner in conversation.

## Why

The site collects personal information from Californians (sign-in emails, contact
form, Join applications, member profiles), so California's CalOPPA requires a
posted privacy policy. Google Maps Platform terms require pointing users to
Google's terms and privacy policy. Members' logos and photos need a clear
permission for the Guild to display and reuse them. The owner wants good,
plain-English policies on both sites (staging and live share one codebase).
Claude is not a lawyer: both pages are drafts the owner should have a lawyer
review; the owner decides when they go live.

## Facts (from the owner)

- Legal name: **Inland Southern California Brewers Guild**, a **501(c)(6)** nonprofit.
- Contact for policy questions: **legal@iscbrewersguild.org** (new; the owner
  sets it up with Claude's walkthrough, Cloudflare Email Routing, before the
  pages go live). webmaster@ is the fallback until legal@ is verified working.
- Disputes: California law, **San Bernardino County**.

## Approaches considered

- Generic generator (Termly, TermsFeed): fast, but lists collection the site
  doesn't do and misses what it does; some charge monthly. Rejected.
- Lawyer-drafted from scratch: best, most expensive. Not now.
- **Chosen:** Claude drafts both documents from what the code actually does,
  in plain English; the owner gets a lawyer to review the draft.

## Owner decisions

- Agreement: **footer links** on every page, plus a **one-line notice** beside
  the buttons members already press, no checkbox:
  - Join preview, beside **Submit to the Guild**: "By submitting, you agree to
    the Terms and Privacy Policy."
  - Every **Publish** button (wizard, portal, /admin incl. Edit as them):
    "By publishing, you agree to the Terms and Privacy Policy."
  - Existing members are covered at their next Publish; no re-acceptance.
- Content reuse: **B** — members keep ownership and grant the Guild permission
  to display their logos, photos and profile content on the website **and** in
  Guild social media, newsletters and event promotion, credited to the member.
  Members can opt out of use beyond the website by emailing legal@.

## Content

**Privacy Policy (/privacy):** who we are; what we collect and why, by group —
visitors (contact form: name, email, phone, message), Join applicants, members
(sign-in email, profile content, photos, logos, calendar links), people sending
photos through a member's sharing link, email list recipients; technical data
(IP addresses for security and rate limiting; sign-in cookies only; a help
widget may remember a first name on the device; no ad or tracking cookies, no
analytics); what's public (published member profiles); service providers
(Cloudflare hosting, Supabase database and storage, Resend email, Google Maps
and Places with links to Google's terms and privacy policy); no selling, no
ads; email choices (unsubscribe link); seeing, correcting and deleting your
information; Do Not Track statement (CalOPPA); retention; children (site is for
adults 21+; not directed at children under 13); security; changes and the
effective date; contact.

**Terms of Use (/terms):** who we are; 21+ and drink responsibly; using the
site; accounts and email sign-in links (keep your email secure); member content
(ownership, license per decision B, opt-out, accuracy of hours/events/jobs,
content rules, Guild may edit or remove, profiles can be unpublished); Join
applications (Guild decides membership); jobs board (Guild not part of hiring;
posters follow employment law); third-party links and Google Maps terms;
information "as is"; limitation of liability; members indemnify the Guild for
their content; ending access; California law, San Bernardino County; changes;
contact.

Both: US English, effective date at the top, same look as the About page,
included in the sitemap if one exists, visible during maintenance mode.

## Where they show

- Footer: "Privacy" and "Terms" links on every public page.
- Join and Sign-in pages: footer covers them; the Join notice is above.
- Member Guide: re-take any screenshot that shows a Publish button now carrying
  the notice, and rebuild the PDFs (owner rule: guide before live).

## Left to the builder

Page layout details, the exact wording within the outline above, which Publish
components carry the notice (all of them), tests pinning the notice text and
the footer links.
