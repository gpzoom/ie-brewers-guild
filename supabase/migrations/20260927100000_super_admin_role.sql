-- Super admin (docs/member-profiles.md, "Super admin" > "Enforcement";
-- decided with the owner on 27 September 2026). A separate account that can
-- do everything a Guild admin can, plus a short list of site-level and
-- irreversible actions (delete member, brand, sign-in email changes, Guild
-- admins, audit log, Trail switch, category delete).
--
-- 1. profiles.is_super_admin, and public.is_super_admin() -- security
--    definer like is_guild_admin(), since profiles' own RLS only lets a
--    user read their own row.
-- 2. is_guild_admin() is true for a super admin too, so every existing
--    Guild admin check keeps working for them. (The seed also sets
--    is_guild_admin on the super admin's row, because the app reads that
--    column directly in several places.)
-- 3. No client can write profiles at all (there has never been a client
--    write policy; the revoke makes it a privilege error too). Beyond that,
--    a trigger lets ONLY a migration (current_user postgres) grant or remove
--    super admin, or take Guild admin access away from the super admin --
--    not even the service key the Worker uses can.

alter table public.profiles
  add column is_super_admin boolean not null default false;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_super_admin
  );
$$;

create or replace function public.is_guild_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_guild_admin or p.is_super_admin)
  );
$$;

revoke execute on function public.is_super_admin() from anon;
grant execute on function public.is_super_admin() to authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;

create or replace function public.profiles_protect_super_admin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Migrations run as postgres (the seed below this one does).
  if current_user = 'postgres' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.is_super_admin then
      raise exception 'super admin can only be granted by a migration' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_super_admin then
      raise exception 'the super admin''s profile can''t be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'super admin can only be granted or removed by a migration' using errcode = '42501';
  end if;
  if old.is_super_admin and not new.is_guild_admin then
    raise exception 'the super admin''s Guild admin access can''t be removed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_super_admin
  before insert or update or delete on public.profiles
  for each row execute function public.profiles_protect_super_admin();
