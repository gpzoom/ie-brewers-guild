/**
 * Creates the super admin's SIGN-IN ACCOUNT (boblelle77+sa@gmail.com) so
 * the seed migration (supabase/migrations/20260927100300_seed_super_admin.sql)
 * has an auth.users row to grant super admin to. This script grants
 * nothing itself: only that migration sets is_super_admin
 * (docs/member-profiles.md, "Super admin" > "Accounts").
 *
 * Safe to run more than once. Run it before `supabase db push`:
 *   node --env-file=.env scripts/seed-super-admin-account.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPER_ADMIN_EMAIL = "boblelle77+sa@gmail.com";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill both in.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingUser(email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return undefined;
  }
}

async function main() {
  const existing = await findExistingUser(SUPER_ADMIN_EMAIL);
  if (existing) {
    console.log(`Account already exists for ${SUPER_ADMIN_EMAIL}: ${existing.id}`);
    return;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Created account ${data.user.id} for ${SUPER_ADMIN_EMAIL}. Now run the seed migration.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
