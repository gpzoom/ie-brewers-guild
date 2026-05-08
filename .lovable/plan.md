## Update social media links

Replace the placeholder `#` social links in `src/components/site/Header.tsx` and `src/components/site/Footer.tsx` with the real guild URLs.

### Changes

**`src/components/site/Header.tsx`**
- Facebook `href="#"` → `https://www.facebook.com/iebrewersguild/`
- Instagram `href="#"` → `https://www.instagram.com/iebrewers/`
- Add `target="_blank" rel="noreferrer"` to both

**`src/components/site/Footer.tsx`**
- Facebook `href="#"` → `https://www.facebook.com/iebrewersguild/`
- Instagram `href="#"` → `https://www.instagram.com/iebrewers/`
- Twitter link: leave as `#` (no URL provided)
- Add `target="_blank" rel="noreferrer"` to Facebook and Instagram

No other files affected.