-- Categories per member type (owner's request, 2026-09-26). Until now every
-- category was an Allied Member supply category; Mobile members now get
-- their own list (Entertainment, Food Truck, Pop-up Food Vendor). The Guild
-- manages both on one Categories page with a tab for each.
--
-- Existing rows are Allied categories. member_categories and the drafts'
-- category_ids are unchanged: a member's picks are whatever categories they
-- chose, and the picker and the public page show the ones for the member's
-- current type (a type change never deletes data).
alter table public.categories
  add column member_type text not null default 'allied'
    check (member_type in ('allied', 'mobile'));

create index categories_member_type_sort_idx on public.categories (member_type, sort_order);

insert into public.categories (name, slug, sort_order, member_type) values
  ('Entertainment', 'entertainment', 0, 'mobile'),
  ('Food Truck', 'food-truck', 1, 'mobile'),
  ('Pop-up Food Vendor', 'pop-up-food-vendor', 2, 'mobile')
on conflict do nothing;
