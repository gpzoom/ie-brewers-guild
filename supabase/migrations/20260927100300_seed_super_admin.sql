-- Seeds the one super admin (docs/member-profiles.md, "Super admin" >
-- "Accounts"): boblelle77+sa@gmail.com. Only a migration can grant super
-- admin (20260927100000_super_admin_role.sql's trigger lets nothing else).
--
-- A migration can't create a Supabase Auth account cleanly, so the sign-in
-- account itself is created first by scripts/seed-super-admin-account.ts
-- (it grants nothing). This migration fails loudly if it's missing.
--
-- is_guild_admin is set too: several server checks read that column
-- directly, and the super admin can do everything a Guild admin can.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = 'boblelle77+sa@gmail.com';

  if v_user_id is null then
    raise exception 'No account for boblelle77+sa@gmail.com yet. Run: node --env-file=.env scripts/seed-super-admin-account.ts';
  end if;

  insert into public.profiles (id, is_guild_admin, is_super_admin)
  values (v_user_id, true, true)
  on conflict (id) do update set is_guild_admin = true, is_super_admin = true;
end;
$$;
