-- Co-owner (20261112100000_co_owner_role.sql): a member may have co-owners
-- besides its one owner. A co-owner has the owner's calendar, kitchen and
-- support-request rights (is_member_owner_level); hand-off and take-back
-- turn a location's co-owners into full editors and cancel its pending
-- co-owner invites. Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(18);

-- f0..07: co-owner of m1 (owned by f0..01, full editor f0..02).
insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-coowner@example.test', 'authenticated', 'authenticated');

insert into _tap (line) select lives_ok(
  $q$ insert into public.member_users (member_id, user_id, role)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000007', 'co_owner') $q$,
  'a co_owner link can be added');
insert into _tap (line) select throws_ok(
  $q$ insert into public.member_users (member_id, user_id, role)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006', 'owner') $q$,
  '23505', null, 'a second owner is still refused');
insert into _tap (line) select lives_ok(
  $q$ insert into public.member_invites (member_id, email, role)
      values ('f1000000-0000-4000-8000-000000000001', 'pgtap-coinvite@example.test', 'co_owner') $q$,
  'a co_owner invite can be added');

-- As the co-owner.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';
insert into _tap (line) select ok(
  public.is_member_full_editor('f1000000-0000-4000-8000-000000000001'), 'co-owner: is a full editor');
insert into _tap (line) select ok(
  public.is_member_owner_level('f1000000-0000-4000-8000-000000000001'), 'co-owner: has owner-level rights');
insert into _tap (line) select lives_ok(
  $q$ insert into public.calendar_connections (member_id, provider, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'ics', 'https://cal.example.test/a.ics', 'beer') $q$,
  'co-owner: can connect the calendar');
insert into _tap (line) select is(
  public.set_member_has_kitchen('f1000000-0000-4000-8000-000000000001', true),
  true, 'co-owner: can turn the kitchen switch on');
insert into _tap (line) select lives_ok(
  $q$ insert into public.support_requests (member_id, requested_by_user_id, kind, requested_member_type)
      values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000007', 'type_change', 'mobile') $q$,
  'co-owner: can file a type-change request');
insert into _tap (line) select is(
  (select count(*)::int from public.support_requests where member_id = 'f1000000-0000-4000-8000-000000000001'),
  1, 'co-owner: can read the member''s support requests');

-- As the full editor.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select ok(
  not public.is_member_owner_level('f1000000-0000-4000-8000-000000000001'), 'editor: no owner-level rights');
insert into _tap (line) select throws_ok(
  $q$ insert into public.calendar_connections (member_id, provider, ics_url, sync_tag)
      values ('f1000000-0000-4000-8000-000000000001', 'google', null, 'beer') $q$,
  '42501', null, 'editor: can''t connect the calendar');
reset role;

-- Hand-off: a one-manager location with a co-owner and a pending co-owner invite.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-000000000101', 'pgtap-co-a', 'producer', 'PgTap CoOwn', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-000000000102', 'pgtap-co-b', 'producer', 'PgTap CoOwn', 'Riverside', 'draft');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-000000000101';
grant select on _biz to public;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_business_mode((select id from _biz), 'one_manager');
select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000006');
reset role;

insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000102', 'f0000000-0000-4000-8000-000000000007', 'co_owner');
insert into public.member_invites (member_id, email, role, invited_by_user_id) values
  ('f1000000-0000-4000-8000-000000000102', 'pgtap-coinvite@example.test', 'co_owner',
   'f0000000-0000-4000-8000-000000000006');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-other@example.test');
reset role;

insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
       and role = 'owner' and accepted_at is null and cancelled_at is null),
    'f0000000-0000-4000-8000-000000000005'),
  true, 'hand-off: the invitee accepts');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000007'), 'editor', 'hand-off: the co-owner is now a full editor');
insert into _tap (line) select ok(
  (select cancelled_at is not null from public.member_invites
    where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'co_owner'),
  'hand-off: the pending co-owner invite is canceled');
insert into _tap (line) select ok(
  exists (select 1 from public.audit_log a join public.member_invites i on i.id = a.row_id
          where a.table_name = 'member_invites' and a.action = 'update'
          and a.actor_user_id = 'f0000000-0000-4000-8000-000000000005'
          and i.role = 'co_owner' and i.member_id = 'f1000000-0000-4000-8000-000000000102'),
  'hand-off: the co-owner invite cancel is audit-logged against the new owner');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000001'
     and user_id = 'f0000000-0000-4000-8000-000000000007'), 'co_owner', 'hand-off: other members'' co-owners are untouched');

-- Take-back: the new location owner had added a co-owner.
update public.member_users set role = 'co_owner'
  where member_id = 'f1000000-0000-4000-8000-000000000102' and user_id = 'f0000000-0000-4000-8000-000000000007';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.take_back_location('f1000000-0000-4000-8000-000000000102') $q$,
  'take-back: the business manager takes the location back');
reset role;
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000007'), 'editor', 'take-back: the co-owner is now a full editor');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
