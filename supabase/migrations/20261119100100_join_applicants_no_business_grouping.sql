-- Join the Guild: an applicant never joins a business automatically.
--
-- The name rule below runs on every members insert. A Join applicant is
-- created by an anonymous visitor (through the server's service role), so
-- without this an applicant whose name matched an existing member elsewhere
-- would join that member's business -- and, if the sibling had none, create
-- a business and change the sibling's business_id. Approval later changes
-- only status (not business_name), so the rule doesn't fire then either: the
-- Guild groups an approved applicant with "Part of" when it's really another
-- location.
--
-- Redefined from its latest definition (20261016100000_business_functions.sql)
-- with one added early return for status 'applied', and applied rows left
-- out of the sibling lookup (a new member never groups with an applicant).
create or replace function public.members_join_business_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sibling record;
  v_business uuid;
begin
  if new.business_id is not null then
    return new;
  end if;
  -- Join applicants are never grouped automatically.
  if new.status = 'applied' then
    return new;
  end if;
  -- A publish re-saves the same name; that must not undo a Part of choice.
  if tg_op = 'UPDATE' and new.business_name is not distinct from old.business_name then
    return new;
  end if;

  select m.id, m.business_id into v_sibling
  from public.members m
  left join public.businesses b on b.id = m.business_id
  where btrim(m.business_name) = btrim(new.business_name)
    and m.id <> new.id
    -- Nor is anyone grouped with an applicant.
    and m.status <> 'applied'
    and (m.business_id is null or b.management_mode = 'separate')
  -- An existing business wins over a member the Guild took out of one.
  order by (m.business_id is null), m.created_at
  limit 1;

  if not found then
    return new;
  end if;

  v_business := v_sibling.business_id;
  if v_business is null then
    insert into public.businesses (name) values (btrim(new.business_name))
    returning id into v_business;
    update public.members set business_id = v_business where id = v_sibling.id;
  end if;

  new.business_id := v_business;
  return new;
end;
$$;
