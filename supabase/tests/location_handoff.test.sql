-- Hand-off and take-back (20261018100000_location_handoff.sql): the
-- business manager hands one location to its own manager by invite; the
-- invitee becomes owner and the manager editor; take-back reverses it.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(25);

insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-000000000101', 'pgtap-ho-a', 'producer', 'PgTap Hand', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-000000000102', 'pgtap-ho-b', 'producer', 'PgTap Hand', 'Riverside', 'draft');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-000000000101';
grant select on _biz to public;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_business_mode((select id from _biz), 'one_manager');
select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000006');

-- Someone else can't hand off.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-other@example.test') $$,
  '42501', null, 'a member who isn''t the business manager can''t hand off');

-- The manager hands Riverside off.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'not-an-email') $$,
  'P0001', 'Enter a valid email address.', 'a bad address is refused');
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'PGTAP-NOBODY@example.test') $$,
  'P0001', 'You already manage this location.', 'the manager can''t hand off to themselves');
insert into _tap (line) select is(
  public.hand_off_location('f1000000-0000-4000-8000-000000000102', '  PgTap-Other@Example.test ') ->> 'refreshed',
  'false', 'the manager hands off Riverside');
reset role;
insert into _tap (line) select is(
  (select role || ' ' || email from public.member_invites
    where member_id = 'f1000000-0000-4000-8000-000000000102' and accepted_at is null and cancelled_at is null),
  'owner pgtap-other@example.test', 'a pending owner invite, address trimmed and lower-cased');
insert into _tap (line) select ok(
  exists (select 1 from public.audit_log where table_name = 'member_invites'
          and member_id = 'f1000000-0000-4000-8000-000000000102'
          and actor_user_id = 'f0000000-0000-4000-8000-000000000006'),
  'the hand-off is audit-logged against the manager');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test') $$,
  'P0001', 'A hand-off to pgtap-other@example.test is already waiting. Cancel it first.',
  'a second hand-off to someone else is refused');
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-other@example.test') $$,
  'P0001', 'An invite just went to pgtap-other@example.test. You can send it again in a few minutes.',
  'resending within five minutes is refused');
reset role;

-- Accepting: wrong user is refused; the right user becomes owner, the manager editor.
insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
    'f0000000-0000-4000-8000-000000000001'),
  false, 'someone with a different address can''t accept');
insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
    'f0000000-0000-4000-8000-000000000005'),
  true, 'the invitee accepts');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000005'), 'owner', 'the invitee is the location''s owner');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000006'), 'editor', 'the business manager is now its editor');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
  1, 'exactly one owner');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000101'
     and user_id = 'f0000000-0000-4000-8000-000000000006'), 'owner', 'the manager still owns Redlands');
insert into _tap (line) select ok(
  (select accepted_at is not null from public.member_invites
    where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
  'the invite is marked accepted');

-- A handed-off location can't be handed off again.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test') $$,
  'P0001', 'PgTap Hand · Riverside is already handed off. Take it back first.',
  'a handed-off location can''t be handed off again');

-- Take-back: the location manager can't; the business manager can.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.take_back_location('f1000000-0000-4000-8000-000000000102') $$,
  '42501', null, 'the location manager can''t take it back');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.take_back_location('f1000000-0000-4000-8000-000000000101') $$,
  'P0001', 'PgTap Hand · Redlands isn''t handed off.', 'a location that isn''t handed off can''t be taken back');
insert into _tap (line) select lives_ok(
  $$ select public.take_back_location('f1000000-0000-4000-8000-000000000102') $$,
  'the business manager takes Riverside back');
reset role;
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000006'), 'owner', 'the manager owns Riverside again');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000005'), 0, 'the location manager''s link is gone');

-- An open editor invite to the same address becomes the hand-off; a stale
-- hand-off accepted after a take-back changes nothing and is canceled.
insert into public.member_invites (member_id, email, role, invited_by_user_id, updated_at)
values ('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test', 'editor',
        'f0000000-0000-4000-8000-000000000006', now() - interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test') ->> 'refreshed',
  'true', 'an open editor invite to the same address becomes the hand-off');
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
     and accepted_at is null and cancelled_at is null and role = 'owner'), 1, 'one open hand-off, no duplicate');
-- The Guild's take-back would refuse (not handed off), so simulate the race: someone else became owner.
update public.member_users set role = 'editor'
  where member_id = 'f1000000-0000-4000-8000-000000000102' and user_id = 'f0000000-0000-4000-8000-000000000006';
insert into public.member_users (member_id, user_id, role)
  values ('f1000000-0000-4000-8000-000000000102', 'f0000000-0000-4000-8000-000000000001', 'owner');
insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
       and role = 'owner' and accepted_at is null and cancelled_at is null),
    'f0000000-0000-4000-8000-000000000002'),
  false, 'a hand-off whose location is already someone else''s is not accepted');
insert into _tap (line) select is(
  (select count(*)::int from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
     and role = 'owner' and cancelled_at is not null), 1, 'and it is canceled');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
