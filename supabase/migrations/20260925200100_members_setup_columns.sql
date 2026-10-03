-- Setup-wizard state on members (spec, "Setup wizard, member portal and
-- drafts" -> "Data model additions"). A member is "in setup" until both
-- type_confirmed_at and setup_completed_at are set; after that /portal never
-- shows the wizard again, for anyone linked to the member.
--
-- None of these are granted to anon: the public profile never reads them,
-- and anon's members access is an explicit column list
-- (20260922153458_final_review_fixes.sql, section 4), so leaving them out of
-- that list is all it takes.
--
-- Members can't write these columns directly. That rule lives in the
-- write-limits trigger, redefined in
-- 20260925201100_member_role_write_limits.sql once the role helpers it also
-- needs exist.
alter table public.members
  add column type_confirmed_at timestamptz,
  add column type_confirmed_by_user_id uuid references auth.users (id) on delete set null,
  add column setup_completed_at timestamptz;

create index members_type_confirmed_by_user_id_idx on public.members (type_confirmed_by_user_id);
