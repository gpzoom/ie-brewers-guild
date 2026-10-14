-- Logos are PNG only, in storage as well as in the app (security review,
-- 2026-10-14).
--
-- The app already refuses SVG logos: uploadMemberLogo checks the file's
-- real bytes and rejects image/svg+xml (src/lib/media/logo.server.ts).
-- But the member-logos bucket still allowed image/svg+xml
-- (20260922153458_final_review_fixes.sql), and owners and editors can
-- write their own {member_id}/ folder straight through the Supabase API
-- (20260922041434_storage_buckets.sql). So a member could skip the app and
-- put an SVG with a script in it at a public supabase.co URL. The site
-- only ever shows logos through <img>, which never runs scripts, and the
-- file would be on Supabase's domain, not the site's -- low impact, but no
-- reason to allow it.
--
-- Existing files are untouched (none are SVG: 0 of 29 on 2026-10-14). The
-- one-time scripts/import-existing-members.ts would now fail on an .svg
-- logo; that's fine, the import is done and the app refuses SVG anyway.
update storage.buckets
set allowed_mime_types = array['image/png']
where id = 'member-logos';
