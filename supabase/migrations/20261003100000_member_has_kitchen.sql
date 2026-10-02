-- "We have our own kitchen" (owner, 2026-10-02): a producer's switch on the
-- Food section. On, an open day with nothing tagged #food reads "Kitchen
-- open" instead of "Bring your own food". Not drafted (like the food
-- calendar it belongs to): it changes straight away. Members can't write
-- `members` directly (20260925210100), so it goes through this function,
-- which -- like the food calendar's connection -- only the profile's owner
-- (or a Guild admin, e.g. Edit as them) may call.
alter table public.members add column has_kitchen boolean not null default false;
-- Visitors read it on the profile (the food week), like logo_background.
grant select (has_kitchen) on public.members to anon;

create or replace function public.set_member_has_kitchen(p_member_id uuid, p_has_kitchen boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if not (coalesce(public.member_role(p_member_id) = 'owner', false) or public.is_guild_admin()) then
    raise exception 'Only the profile''s owner can change this.' using errcode = '42501';
  end if;
  select member_type into v_type from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_type <> 'producer' then
    raise exception 'Only producers have a kitchen switch.' using errcode = '22023';
  end if;
  update public.members set has_kitchen = coalesce(p_has_kitchen, false) where id = p_member_id;
  return coalesce(p_has_kitchen, false);
end;
$$;

revoke execute on function public.set_member_has_kitchen(uuid, boolean) from public, anon;
grant execute on function public.set_member_has_kitchen(uuid, boolean) to authenticated;
