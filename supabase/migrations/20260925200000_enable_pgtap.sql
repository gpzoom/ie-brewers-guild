-- pgTAP, for the database tests under supabase/tests/ (portal/drafts plan,
-- Decision 11). Staging and production share this one database and there is
-- no local Docker, so tests run against the linked project inside a
-- transaction that always ends in `rollback` -- nothing a test creates is
-- ever committed. pgTAP's functions live in the `extensions` schema, which
-- PostgREST doesn't expose, so installing it adds nothing to the public API.
create extension if not exists pgtap with schema extensions;
