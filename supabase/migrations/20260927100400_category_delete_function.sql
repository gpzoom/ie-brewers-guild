-- Deleting a category (super admin only; docs/member-profiles.md, "Super
-- admin"). member_categories rows go with it (on delete cascade), but a
-- member's DRAFT keeps the id in discount.category_ids -- and their next
-- publish would then fail on the foreign key. So deleting goes through one
-- function that, in one transaction, checks the caller is the super admin,
-- takes the id out of every draft, and deletes the category.
--
-- category_usage() tells the confirmation how many members use it, live or
-- in a draft (Guild admins and the super admin).

create or replace function public.category_usage(p_category_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_guild_admin() then
    raise exception 'Only a Guild admin can see how a category is used.' using errcode = '42501';
  end if;
  return (
    select count(*)::integer from (
      select mc.member_id from public.member_categories mc where mc.category_id = p_category_id
      union
      select d.member_id from public.member_drafts d
      where coalesce(d.data #> '{discount,category_ids}', '[]'::jsonb) ? p_category_id::text
    ) used
  );
end;
$$;

create or replace function public.delete_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can delete a category.' using errcode = '42501';
  end if;

  update public.member_drafts d
  set data = jsonb_set(
    d.data,
    '{discount,category_ids}',
    coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(d.data #> '{discount,category_ids}') e
      where e #>> '{}' <> p_category_id::text
    ), '[]'::jsonb)
  )
  where coalesce(d.data #> '{discount,category_ids}', '[]'::jsonb) ? p_category_id::text;

  delete from public.categories c where c.id = p_category_id;
  if not found then
    raise exception 'That category could not be found — it may already have been deleted.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.category_usage(uuid) from public, anon;
revoke execute on function public.delete_category(uuid) from public, anon;
grant execute on function public.category_usage(uuid) to authenticated;
grant execute on function public.delete_category(uuid) to authenticated;
