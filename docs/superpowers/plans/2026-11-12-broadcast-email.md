# Broadcast Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super-admin-only screen at `/guild/broadcast` that sends one email (rich text + attachments) to the owner and co-owners of a chosen set of active members, with per-person unsubscribe, one saved draft, a test send, an audit row per send and a Recent broadcasts list.

**Architecture:** Pure, unit-tested modules hold the logic (audience → recipients, HTML sanitizing, unsubscribe tokens, attachment rules, paced sending with an injected `fetch`); one `broadcast.server.ts` of `createServerFn`s gates every call on `requireSuperAdmin` and then uses the service-role client; one migration adds three tables and a private storage bucket. The screen follows artboard AA; the editor is TipTap.

**Tech Stack:** TanStack Start (React 19, `createServerFn`, file routes), Supabase Postgres + Storage (RLS, pgTAP), Cloudflare Workers, Resend HTTP API, Vitest, TipTap v3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`).

**Spec:** `docs/member-profiles.md` — "Broadcast email screen" (with the 12 November 2026 decisions 1–9), the Super admin only table row, Menus, Enforcement, Data model `broadcast_emails` / `broadcast_draft` / `broadcast_unsubscribes`, and the `broadcast-attachments` storage note. Visual reference: artboard AA, saved at `C:/Users/boble/AppData/Local/Temp/claude/8258c428a2ebfd98/e0bf07eb-fc3c-416d-891c-13a5e8ea207a/scratchpad/artifact-files/453d2589-9f30-45ee-9a1f-f0da38bc1b08/project/GuildBroadcast.dc.html`.

## Global Constraints

- Branch `broadcast-email`. Do not merge or push to `staging`/`main`; the controller does that.
- Never run `supabase db push`; the site owner gives that go-ahead separately. Local `npm run test:db` is fine.
- Every server function: `requireSuperAdmin(sessionClient, "<action>")` from `src/lib/auth/super-admin.ts` BEFORE `getSupabaseServiceRoleClient()` is called.
- From: `ISC Brewers Guild <hello@iscbrewersguild.org>` (build it from `ORG_SHORT_NAME` only if that equals "ISC Brewers Guild"; otherwise use the literal). `reply_to`: the sending super admin's own email.
- Active members only: `members.status in ('published','draft')`.
- Recipients: per member, `pickOwnerLevelUserIds` (`src/lib/members/account-user.ts`) over its `member_users` rows ordered by `created_at` asc — owner plus every co-owner; editor rows never. Then drop users in `broadcast_unsubscribes`, and dedupe by user id and by lowercased email (one person gets one email even when they own two members).
- Attachments: at most 5 files, at most 10 MB (10 485 760 bytes) in total; MIME types exactly: `application/pdf`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Allowed body HTML: `p, br, strong, b, em, i, u, a, ul, ol, li`; `a` keeps only `href` with `http:`, `https:` or `mailto:`; everything else is unwrapped (text kept) or dropped (`script`, `style`, `iframe` with contents).
- Paced sending: one Resend POST per person, at least 550 ms apart (Resend default limit: 2 requests/second).
- Unsubscribe tokens are signed with `HOURS_CONFIRM_SECRET` (already set on both Workers) using the payload prefix `unsubscribe:` so they can never be mistaken for an hours token; no expiry.
- All on-screen text in US English. Touch targets ≥ 44 px where the artboard allows.
- Any new `*.server.ts` imported by a route goes in `vite.config.ts` `importProtection.client.excludeFiles` only if every export is a `createServerFn`. Plain helpers live in non-`.server` files.
- Local build needs placeholder env for that one command only: `VITE_SUPABASE_URL=https://placeholder.supabase.co VITE_SUPABASE_ANON_KEY=placeholder VITE_GOOGLE_MAPS_API_KEY=placeholder npm run build`. Known pre-existing failures to ignore: tsc error in `src/routes/survey.tsx`; `supabase/tests/event_hosts.test.sql` (3 assertions).

## Review Focus

1. The same person owns two matched members → exactly one email and counted once (Task 2 test `dedupes a person who owns two members`).
2. A member with no `member_users` rows (unclaimed) or whose owner has no email → silently not a recipient, never a crash (Task 2 test `skips unclaimed members and missing emails`).
3. Pasted Word/Google Docs HTML in the body (`<span style>`, `<font>`, `<o:p>`, `javascript:` links) → sanitized, text kept (Task 2 test `sanitizes pasted office html`).
4. Resend refuses some addresses (422) or rate-limits (429) → the rest still send; 429 is retried once after 1 s; result lists failures; `status='failed'` only if none sent (Task 3 tests).
5. An unsubscribe link prefetched by a mail scanner → nothing changes until the person presses the button; the one-click POST works without a session; a tampered token changes nothing (Task 4 tests).

---

### Task 1: Database — tables, bucket, policies

**Files:**
- Create: `supabase/migrations/20261113100000_broadcast_email.sql`
- Create: `supabase/tests/broadcast_email.test.sql`

**Interfaces:**
- Produces tables `broadcast_emails`, `broadcast_draft`, `broadcast_unsubscribes` and private bucket `broadcast-attachments`, exactly as the spec's Data model sections describe. Attachment JSON shape everywhere: `{ path: string, filename: string, size_bytes: number, content_type: string }` (adds `content_type` to the spec's shape — needed to send the file).

- [ ] **Step 1: Write the pgTAP test** (style of `supabase/tests/super_admin.test.sql`, fixtures from `_fixtures.psql`): as anon, as a member owner (fixture), as a Guild admin (`f0…04`) and as the super admin (`f0…07`):
  - `broadcast_emails`: select returns rows only for the super admin; insert/update/delete denied for all four roles.
  - `broadcast_draft`, `broadcast_unsubscribes`: no client select/insert/update/delete except `broadcast_unsubscribes` select for the super admin.
  - `broadcast_draft` rejects a second row (`id` must be `true`).
  - `broadcast_emails.audience_type` rejects `'everyone'`; `status` rejects `'pending'`.
  - bucket `broadcast-attachments` exists with `public = false`, `file_size_limit = 10485760`, and the 9 MIME types above.
  - storage.objects in that bucket: super admin can insert; Guild admin and anon cannot select or insert.
- [ ] **Step 2:** `npm run test:db` → the new file fails (tables missing).
- [ ] **Step 3: Write the migration.** Tables per spec (`broadcast_emails` also gets `failed_emails text[] not null default '{}'` for decision 6). RLS enabled on all three; select policies `using (public.is_super_admin())` for `broadcast_emails` and `broadcast_unsubscribes`; no other policies. Bucket insert like `20260928100000_homepage_settings.sql` but `public = false`; one storage policy `for all to authenticated using/with check (bucket_id = 'broadcast-attachments' and public.is_super_admin())`.
- [ ] **Step 4:** `npm run test:db` → new file passes; only the known `event_hosts` failures remain.
- [ ] **Step 5: Commit** `feat(broadcast): tables, private attachments bucket, policies`.

### Task 2: Pure logic — audience, sanitizing, attachments, email body

**Files:**
- Create: `src/lib/guild/broadcast-audience.ts`, `src/lib/guild/broadcast-html.ts`, `src/lib/guild/broadcast-attachments.ts`
- Test: matching `*.test.ts` beside each

**Interfaces:**
- Produces:
  - `type BroadcastAudience = { type: "all" } | { type: "type_or_category"; memberType: "producer" | "mobile" | "allied" | null; categoryId: string | null } | { type: "members"; memberIds: string[] }`
  - `type AudienceMember = { id: string; business_name: string; member_type: string; status: string; categoryIds: string[] }`
  - `type AudienceUserRow = { member_id: string; user_id: string; role: string | null; created_at: string }`
  - `matchMembers(members: AudienceMember[], audience: BroadcastAudience): AudienceMember[]` — active only; `type_or_category` with both null matches nothing.
  - `buildRecipients(matched: AudienceMember[], userRows: AudienceUserRow[], emailsByUserId: Map<string, string | null>, unsubscribed: Set<string>): { recipients: { userId: string; email: string }[]; memberCount: number; unsubscribedCount: number }`
  - `audienceLabel(audience, memberNames: Map<string,string>, categoryNames: Map<string,string>): string` — "All members", "Producers", "Mobile members", "Affiliate Members", "<Category>", "Producers · <Category>", "3 picked members".
  - `sanitizeBroadcastHtml(html: string): string` (allowed list in Global Constraints; regex/tokenizer, no DOM — runs in the Worker).
  - `htmlToText(html: string): string` (links as "text (url)", list items as "- ").
  - `buildBroadcastEmail(p: { bodyHtml: string; unsubscribeUrl: string }): { html: string; text: string }` — wraps the body in a simple branded shell and appends the footer "You're getting this because you're on a member profile with the ISC Brewers Guild. Unsubscribe from Guild broadcasts: <link>". Test sends call it with `unsubscribeUrl` = `""` and get no footer.
  - `BROADCAST_ATTACHMENT_LIMITS = { maxFiles: 5, maxTotalBytes: 10485760, mimeTypes: [...9] }`
  - `checkAttachmentAdd(existing: {size_bytes:number}[], file: { size: number; type: string }): { ok: true } | { ok: false; message: string }` — messages: "Up to 5 files.", "Attachments can total 10 MB at most.", "That file type can't be attached. Use PDF, an image, Word or Excel."
- [ ] **Step 1: Write failing tests**, including the Review Focus cases:
  - `dedupes a person who owns two members` (same user on two members, and two users sharing one email differing in case → 1 recipient; memberCount 2).
  - `skips unclaimed members and missing emails`.
  - `excludes editor and media_events rows` and `includes owner and every co-owner`.
  - `drops unsubscribed users and counts them` (unsubscribedCount 1).
  - `matches only published and draft members` (applied/declined/suspended excluded) for all three audience types.
  - `sanitizes pasted office html`: `<p><span style="x"><font>Hi</font></span><o:p></o:p></p><a href="javascript:alert(1)">x</a><script>bad()</script>` → `<p>Hi</p>x`.
  - keeps `<a href="https://a.b">`, `<a href="mailto:a@b.c">`, lists and `<u>`.
  - attachment rule messages for 6th file, 10 MB + 1 byte total, `application/zip`.
- [ ] **Step 2:** `npx vitest run src/lib/guild/broadcast-` → fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: Commit** `feat(broadcast): audience, sanitizing and attachment rules`.

### Task 3: Unsubscribe tokens and the paced sender

**Files:**
- Create: `src/lib/email/unsubscribe-token.ts`, `src/lib/guild/broadcast-send.ts`
- Modify: `src/lib/hours/confirm-token.ts` (export its base64url/HMAC/timing-safe helpers, or move them to `src/lib/crypto/hmac.ts` and import from both — no behavior change; its tests must still pass)
- Test: `src/lib/email/unsubscribe-token.test.ts`, `src/lib/guild/broadcast-send.test.ts`

**Interfaces:**
- Produces:
  - `signUnsubscribeToken(userId: string, secret: string): Promise<string>`; `verifyUnsubscribeToken(token: string, secret: string): Promise<{ valid: true; userId: string } | { valid: false }>` — payload `unsubscribe:<userId>`; an hours token must not verify.
  - `type OutgoingAttachment = { filename: string; content: string /* base64 */ }`
  - `sendBroadcastEmails(p: { apiKey: string; from: string; replyTo: string; subject: string; recipients: { email: string; html: string; text: string; unsubscribeUrl: string | null; oneClickUrl: string | null }[]; attachments: OutgoingAttachment[]; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; gapMs?: number }): Promise<{ sent: string[]; failed: string[] }>` — POST `https://api.resend.com/emails` per recipient; when `oneClickUrl` is set, the Resend body gets `headers: { "List-Unsubscribe": "<${oneClickUrl}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }`; test sends pass both URLs as null and get no such headers; waits `gapMs` (default 550) between requests; a 429 is retried once after 1000 ms; never throws for one bad address.
- [ ] **Step 1: Failing tests:** token round-trip; tampered token invalid; hours token invalid as unsubscribe; sender posts one request per recipient with the right body, headers and attachments; sleeps between requests (fake sleep records 550s); 422 for one address → others sent and that address in `failed`; 429 then 200 → sent, with one 1000 ms sleep; network throw → failed.
- [ ] **Step 2:** run → fail. **Step 3:** implement. **Step 4:** `npx vitest run src/lib/email src/lib/guild/broadcast-send src/lib/hours` → pass.
- [ ] **Step 5: Commit** `feat(broadcast): unsubscribe tokens and paced Resend sender`.

### Task 4: Unsubscribe page and one-click endpoint

**Files:**
- Create: `src/lib/email/unsubscribe.server.ts` (server functions), `src/lib/email/unsubscribe-core.ts` (pure core with injected store), `src/routes/unsubscribe.$token.tsx` (page), `src/routes/api.unsubscribe.$token.ts` (POST handler, pattern of `src/routes/api.member-media.$assetId.ts` `server.handlers`)
- Modify: `vite.config.ts` excludeFiles (add `unsubscribe.server.ts` if the page imports it — its exports must all be server functions)
- Test: `src/lib/email/unsubscribe-core.test.ts`

**Interfaces:**
- Consumes: `verifyUnsubscribeToken` (Task 3); table `broadcast_unsubscribes` (Task 1).
- Produces: `checkUnsubscribe({token}) → { valid: boolean; unsubscribed: boolean }` (GET, read-only), `setBroadcastSubscription({token, subscribed: boolean}) → { ok: true }` (POST). Page URL `${siteUrl}/unsubscribe/<token>`, one-click URL `${siteUrl}/api/unsubscribe/<token>`.
- [ ] **Step 1: Failing core tests:** valid token + unsubscribe → upsert row; resubscribe → delete row; invalid token → no store call and `{ valid:false }`; a check (GET) never writes; one-click POST with body `List-Unsubscribe=One-Click` writes and returns 200, any other body → 400, bad token → 400 without writing.
- [ ] **Step 2–4:** implement, pass. Page (mobile-first, Guild public styling like `src/routes/api.confirm-hours.$token.tsx`): unsubscribed state heading "You won't get Guild broadcast emails anymore", text "Other emails about your profile, like sign-in links and hours reminders, still arrive.", button **Subscribe again**; subscribed state shows button **Unsubscribe from Guild broadcasts** (the link itself never writes); invalid token: "This unsubscribe link isn't valid. Reply to any Guild email and we'll take you off the list." Read the secret like `readHoursConfirmSecret()` in `src/lib/hours/confirm-token.server.ts`.
- [ ] **Step 5: Commit** `feat(broadcast): unsubscribe page and one-click endpoint`.

### Task 5: Server functions for the screen

**Files:**
- Create: `src/lib/guild/broadcast.server.ts` (createServerFn only), `src/lib/guild/broadcast-core.ts` (pure core with an injected `BroadcastStore`, in the style of `src/lib/guild/guild-admins.ts`)
- Modify: `vite.config.ts` excludeFiles (add `src/lib/guild/broadcast.server.ts` next to `guild-admins.server.ts`); `src/lib/guild/audit-log-view.ts` (label rows with `table_name = 'broadcast_emails'` as "Broadcast email sent")
- Test: `src/lib/guild/broadcast-core.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces (all POST except the first; each starts with `requireSuperAdmin`):
  - `getBroadcastPage() → { draft: BroadcastDraft | null; recent: { id, sent_at, subject, audienceLabel, recipient_count, status, failedCount }[] (newest first, 20); members: { id, business_name, member_type }[] (active, by name); categories: { id, name }[]; superAdminEmail: string }`
  - `previewBroadcastAudience({ audience }) → { memberCount, peopleCount, unsubscribedCount }`
  - `saveBroadcastDraft({ audience, subject, bodyHtml, attachments }) → { ok: true }` (upsert the single row, body sanitized)
  - `uploadBroadcastAttachment(FormData{file}) → Attachment` (checks `checkAttachmentAdd` against the current draft's attachments; stores at `draft/<uuid>/<sanitized filename>`; adds it to the draft)
  - `removeBroadcastAttachment({ path }) → { ok: true }` (only `draft/` paths; deletes object and draft entry)
  - `sendBroadcastTest({ subject, bodyHtml, attachments }) → { sentTo: string }` (to the super admin's own address, no footer, no row, no audit)
  - `sendBroadcast({ audience, subject, bodyHtml, attachments }) → { sent: number; failed: string[]; memberCount: number }` — subject required (trimmed, ≤ 200 chars), body non-empty after sanitizing, ≥ 1 recipient; resolves recipients fresh at send time; per-recipient unsubscribe links; inserts `broadcast_emails` (status `sent` if any sent else `failed`, `recipient_count` = sent count, `failed_emails`); writes audit_log `{ actor_user_id, member_id: null, table_name: 'broadcast_emails', row_id, action: 'insert', details: { subject, recipient_count, failed_count, audience: audienceLabel } }` (audit failure is logged, never thrown); clears the draft row; attachments stay in the bucket (the sent row references them).
- [ ] **Step 1: Failing core tests:** non-super-admin → throws before any store call; send validates subject/body/recipients with messages "Add a subject.", "Write a message.", "No one to send to."; send writes the row, the audit entry and clears the draft; all failed → `status 'failed'`; test send goes only to the super admin, with no row and no audit; preview counts match `buildRecipients`.
- [ ] **Step 2–4:** implement, pass.
- [ ] **Step 5: Commit** `feat(broadcast): server functions`.

### Task 6: The screen and the sidebar item

**Files:**
- Create: `src/routes/guild.broadcast.tsx` (gate like `src/routes/guild.audit.tsx`: `beforeLoad` redirect when `!context.isSuperAdmin`, `staleTime: 0`, loader `getBroadcastPage()`), `src/components/guild/BroadcastScreen.tsx`, `src/components/guild/BroadcastEditor.tsx`
- Modify: `src/components/guild/GuildShell.tsx` (Super admin group: "Broadcast email" between Guild admins and Audit log, `broadcastActive`); `package.json` (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` v3)
- Test: `src/components/guild/BroadcastScreen.test.tsx` if the repo has component tests with Testing Library; otherwise a pure helper test for the button label and confirm text.

**Interfaces:**
- Consumes: Task 5 server functions.
- Layout and copy from artboard AA, exactly: title "Broadcast email"; intro "One email to your members — a new program, a dues reminder, an event invite. Only you, the super admin, can send one, and every send is recorded in the Audit log."; "TO" card with tabs **All members** / **By type or category** / **Pick specific members**; count line "**N members** · **M people** (every owner and co-owner with an email on file — business-manager editor rows aren't included)" plus " · K unsubscribed" when K > 0; By type: a member-type select (Any type, Producers, Mobile members, Affiliate Members) and a category select (Any category + categories); Pick: search box filtering the active members list, chips for picked ones with remove buttons. Subject input; editor card with toolbar Bold, Italic, Underline, Insert link, Bulleted list, Numbered list, Attach files (aria-labels as in the artboard); attachment chips "name · 2.1 MB" with Remove; "+ Add another file". Footer line "From **ISC Brewers Guild <hello@iscbrewersguild.org>** · replies go to **<super admin email>** · an unsubscribe link is added automatically, as required for bulk email." Buttons **Save draft**, **Send test to yourself**, **Send to M people** (disabled at 0; label "Sending…" while sending). Confirm dialog (existing AlertDialog): "Send to M people?" / "<audience label>. This can't be undone." / buttons Cancel and "Send now". Success banner: "Sent to M people across N members, just now." / "Recorded in the Audit log. Any address that couldn't be sent to is listed there." plus the failed addresses when any, and **Send another** (clears the composer). Recent broadcasts: "RECENT BROADCASTS" list rows "<date>, <time>" (Pacific, like the audit log formatting) · subject · "<audience> · N people" (and " · failed" when status failed); empty state "No broadcasts yet."
- Editor: TipTap with StarterKit (v3 includes Link and Underline; configure Link `openOnClick: false`, `protocols` http/https/mailto), `immediatelyRender: false` for SSR. Insert link uses a small prompt dialog (existing Dialog component), not `window.prompt`.
- Audience changes re-run `previewBroadcastAudience` (debounced 300 ms). Phone width: everything stacks, tabs wrap.
- [ ] **Step 1:** Add packages: `npm i @tiptap/react @tiptap/pm @tiptap/starter-kit` and confirm React 19 peer compatibility.
- [ ] **Step 2:** Build the screen and nav item.
- [ ] **Step 3:** `npx tsc --noEmit` (only the survey.tsx error), `npx vitest run`, placeholder-env `npm run build` → all pass.
- [ ] **Step 4:** Run the app locally signed in as super admin if feasible (see `.playwright-mcp/session.mjs`) and take one desktop and one 390 px screenshot of `/guild/broadcast` to compare with artboard AA; send nothing.
- [ ] **Step 5: Commit** `feat(broadcast): Broadcast email screen and sidebar item`.

### Task 7: Docs

**Files:**
- Modify: `docs/member-profiles.md` (only if the build changed anything the spec states: the `content_type` attachment field, `failed_emails` column, the 20-row Recent list, the reuse of `HOURS_CONFIRM_SECRET`, dedupe of one person across members)
- [ ] **Step 1:** Update the spec lines; **Step 2: Commit** `docs(spec): broadcast email as built`.
