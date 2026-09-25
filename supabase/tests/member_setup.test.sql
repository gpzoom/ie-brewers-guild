-- confirm_member_type / complete_member_setup and the member_type lock
-- (spec, "Member type: confirm once, then locked" and "Wizard or portal:
-- one rule"). Runs entirely inside one transaction that is rolled back at
-- the end -- never committed.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(32);

-- ---------------------------------------------------------------------
-- Before confirmation
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.confirm_member_type('f1000000-0000-4000-8000-000000000001', 'producer') $q$,
  '42501', null, 'media_events: cannot confirm the member type');
insert into _tap (line) select throws_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'media_events: cannot complete setup');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ update public.members set type_confirmed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: cannot set type_confirmed_at directly');
insert into _tap (line) select throws_ok(
  $q$ update public.members set type_confirmed_by_user_id = 'f0000000-0000-4000-8000-000000000001' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: cannot set type_confirmed_by_user_id directly');
insert into _tap (line) select throws_ok(
  $q$ update public.members set setup_completed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: cannot set setup_completed_at directly');
insert into _tap (line) select throws_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000001') $q$,
  '22023', 'Confirm the member type first.', 'owner: setup cannot complete before the type is confirmed');
-- The functions' bypass flag is ignored for client roles: setting it from
-- a client session changes nothing.
set local app.member_fn = 'on';
insert into _tap (line) select throws_ok(
  $q$ update public.members set setup_completed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: a forged app.member_fn flag is ignored for a client role');
insert into _tap (line) select throws_ok(
  $q$ update public.members set type_confirmed_at = now() where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: a forged app.member_fn flag can''t confirm the type either');
set local app.member_fn = '';
-- m5 is still 'applied': not a working member yet.
insert into _tap (line) select throws_ok(
  $q$ select public.confirm_member_type('f1000000-0000-4000-8000-000000000005', 'producer') $q$,
  '42501', null, 'owner: an applied member cannot lock its type');
insert into _tap (line) select throws_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000005') $q$,
  '42501', null, 'owner: an applied member cannot complete setup');
-- Today's /admin Basics editor can still change the type of an
-- unconfirmed member -- the lock only starts at confirmation.
insert into _tap (line) select lives_ok(
  $q$ update public.members set member_type = 'allied' where id = 'f1000000-0000-4000-8000-000000000003' $q$,
  'owner: an unconfirmed type can still be changed directly');

-- ---------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $q$ select public.confirm_member_type('f1000000-0000-4000-8000-000000000001', 'brewery') $q$,
  '22023', null, 'unknown member type refused');
insert into _tap (line) select is(
  public.confirm_member_type('f1000000-0000-4000-8000-000000000001', 'allied'),
  '{"old_type":"producer","new_type":"allied","changed":true}'::jsonb,
  'owner: confirm with a different type returns old and new');

reset role;
insert into _tap (line) select ok(
  (select member_type = 'allied' and type_confirmed_at is not null
          and type_confirmed_by_user_id = 'f0000000-0000-4000-8000-000000000001'
   from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'confirm: type, confirmed-at and confirmed-by set');
insert into _tap (line) select is(
  (select count(*)::int from public.audit_log
   where actor_user_id = 'f0000000-0000-4000-8000-000000000001'
     and member_id = 'f1000000-0000-4000-8000-000000000001' and table_name = 'members'),
  1, 'confirm: audit row written against the member (not only Guild admins)');

set local role authenticated;
insert into _tap (line) select throws_ok(
  $q$ select public.confirm_member_type('f1000000-0000-4000-8000-000000000001', 'producer') $q$,
  '42501', null, 'owner: cannot confirm a second time');
insert into _tap (line) select throws_ok(
  $q$ update public.members set member_type = 'producer' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: direct member_type change blocked once confirmed');
insert into _tap (line) select throws_ok(
  $q$ update public.members set type_confirmed_at = null where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'owner: cannot clear type_confirmed_at to unlock');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ update public.members set member_type = 'producer' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'editor: direct member_type change blocked once confirmed');
insert into _tap (line) select is(
  public.confirm_member_type('f1000000-0000-4000-8000-000000000004', 'mobile') ->> 'changed',
  'false', 'editor: confirming the same type reports changed = false');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $q$ select public.confirm_member_type('f1000000-0000-4000-8000-000000000003', 'producer') $q$,
  '42501', null, 'unlinked user: cannot confirm');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ update public.members set member_type = 'producer' where id = 'f1000000-0000-4000-8000-000000000001' $q$,
  'guild admin: can change a confirmed type from the roster');
reset role;
insert into _tap (line) select is(
  (select member_type from public.members where id = 'f1000000-0000-4000-8000-000000000001'),
  'producer', 'guild admin change applied');

-- ---------------------------------------------------------------------
-- Completing setup: needs name and city in the draft's basics
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"business_name":"  "}') $q$,
  'owner: a blank name can sit in the draft while typing');
insert into _tap (line) select throws_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000001') $q$,
  '22023', 'Add your business name to continue.', 'complete setup refused: draft name is blank (live name ignored)');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"business_name":"Named Brewing","city":""}') $q$,
  'owner: name filled in, city cleared');
insert into _tap (line) select throws_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000001') $q$,
  '22023', 'Add your city to continue.', 'complete setup refused: draft city is blank');
insert into _tap (line) select lives_ok(
  $q$ select public.save_member_draft_section('f1000000-0000-4000-8000-000000000001', 'basics', '{"city":"Riverside"}') $q$,
  'owner: city filled in');
insert into _tap (line) select lives_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000001') $q$,
  'owner: complete setup');

reset role;
create temp table _setup on commit drop as
select setup_completed_at from public.members where id = 'f1000000-0000-4000-8000-000000000001';
grant select on _setup to public;
insert into _tap (line) select ok((select setup_completed_at is not null from _setup), 'setup_completed_at set');

set local role authenticated;
insert into _tap (line) select is(
  public.complete_member_setup('f1000000-0000-4000-8000-000000000001'),
  (select setup_completed_at from _setup),
  'complete setup again: idempotent, same timestamp');

-- m4 has no draft at all: falls back to the live name and city.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $q$ select public.complete_member_setup('f1000000-0000-4000-8000-000000000004') $q$,
  'editor: complete setup with no draft uses the live name and city');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
