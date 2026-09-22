/**
 * One-time seed: create the first Guild admin account.
 *
 * Nothing else in this system can be created through the UI until this
 * exists -- the Guild admin UI requires an admin to use it, and there is
 * no signup flow. This is the one and only bootstrap step.
 *
 * Run:
 *   node --env-file=.env scripts/seed-guild-admin.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "boblelle77@gmail.com";

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
  // admin.listUsers() doesn't take an email filter in supabase-js v2, so
  // page through (there won't be more than a handful of users this early).
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return undefined;
    page += 1;
  }
}

async function main() {
  let user = await findExistingUser(ADMIN_EMAIL);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user ${user.id} for ${ADMIN_EMAIL}`);
  } else {
    console.log(`Auth user already exists: ${user.id}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, is_guild_admin: true }, { onConflict: "id" });
  if (profileError) throw profileError;

  console.log(`profiles row set: is_guild_admin = true for ${ADMIN_EMAIL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
