# Sign-in email templates (Supabase)

These replace Supabase's default **Magic Link** and **Confirm signup** emails. That makes sign-in work in any browser or on any device (owner, 5 October 2026). The emails carry two things:

- **A link to the site's "Finish signing in" page** (`/auth/confirm`). It works in any browser or on any device. Opening the page doesn't sign anyone in until they press the button, so email security scanners can't use the link up.
- **The sign-in code**, 6 digits on this project. The member types it on the sign-in page if the link gives them any trouble.

The site code that reads these links is `src/lib/auth/sign-in-link.ts`, `src/routes/auth.callback.tsx`, `src/routes/auth.confirm.tsx` and `src/routes/signin.tsx`.

**Order matters.** The live site must have the new code before these templates go in, because the settings are shared by staging and the live site. Merge first, then paste. Links already sitting in someone's inbox from the old template keep working.

## Where to paste

Supabase dashboard → your project → **Authentication** → **Emails** → **Templates**.

## Magic Link

**Subject:** `Your ISC Brewers Guild sign-in link`

**Body (Source / HTML):**

```html
<h2>Sign in to the ISC Brewers Guild</h2>
<p>Click the button to finish signing in to the Member Portal:</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink" style="display:inline-block;padding:12px 22px;background:#BE5A0A;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Sign in</a></p>
<p>Or type this code on the sign-in page:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>The link and the code work once, for about an hour. If you didn't ask to sign in, you can ignore this email.</p>
```

## Confirm signup

This is the email someone gets the first time they sign in with a new address.

**Subject:** `Your ISC Brewers Guild sign-in link`

**Body (Source / HTML):**

```html
<h2>Sign in to the ISC Brewers Guild</h2>
<p>Click the button to finish signing in to the Member Portal:</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup" style="display:inline-block;padding:12px 22px;background:#BE5A0A;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Sign in</a></p>
<p>Or type this code on the sign-in page:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>The link and the code work once, for about an hour. If you didn't ask to sign in, you can ignore this email.</p>
```

## Why `{{ .RedirectTo }}`

The sign-in page asks Supabase to send people back to the site they signed in from. That's `…/auth/callback?next=…` on staging or the live site, and it always ends in a query string. The template adds `&token_hash=…` to that address, so a sign-in started on staging comes back to staging, and one started on the live site comes back to the live site.
