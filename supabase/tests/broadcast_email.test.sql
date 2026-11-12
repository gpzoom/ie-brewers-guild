-- Broadcast email (20261113100000_broadcast_email.sql): broadcast_emails,
-- broadcast_draft, broadcast_unsubscribes and the private broadcast-attachments
-- bucket. Only the super admin can read the history, the unsubscribe list or
-- the attachment files; nobody writes through the client (the Worker uses the
-- service key). Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(62);

insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-4000-8000-000000000007', 'pgtap-super@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, is_guild_admin, is_super_admin)
values ('f0000000-0000-4000-8000-000000000007', true, true);

-- Seed one row in each table (as the table owner) so "can't see it" is meaningful.
insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count)
values ('f0000000-0000-4000-8000-000000000007', 'pgTAP subject', '<p>hi</p>', 'all', 3);
insert into public.broadcast_draft (audience_type, subject, body_html) values ('all', 'draft', '');
insert into public.broadcast_unsubscribes (user_id) values ('f0000000-0000-4000-8000-000000000006');
insert into storage.objects (bucket_id, name) values ('broadcast-attachments', 'pgtap/seed.pdf');

-- Shape: bucket, constraints
insert into _tap (line) select is((select public from storage.buckets where id = 'broadcast-attachments'), false,
  'bucket: broadcast-attachments exists and is private');
insert into _tap (line) select is((select file_size_limit from storage.buckets where id = 'broadcast-attachments'), 10485760::bigint,
  'bucket: 10 MB limit');
insert into _tap (line) select is(
  (select array_agg(m order by m) from storage.buckets b, unnest(b.allowed_mime_types) m where b.id = 'broadcast-attachments'),
  (select array_agg(m order by m) from unnest(array['application/pdf','image/jpeg','image/png','image/gif','image/webp',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) m),
  'bucket: the 9 allowed MIME types');
insert into _tap (line) select throws_ok(
  $q$ insert into public.broadcast_draft (audience_type, subject, body_html) values ('all', 'second', '') $q$,
  '23505', null, 'broadcast_draft: a second row is rejected');
insert into _tap (line) select throws_ok(
  $q$ insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count)
      values ('f0000000-0000-4000-8000-000000000007', 's', 'b', 'everyone', 1) $q$,
  '23514', null, 'broadcast_emails: audience_type ''everyone'' rejected');
insert into _tap (line) select throws_ok(
  $q$ insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count, status)
      values ('f0000000-0000-4000-8000-000000000007', 's', 'b', 'all', 1, 'pending') $q$,
  '23514', null, 'broadcast_emails: status ''pending'' rejected');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_emails $q$, 'anon: sees no broadcast history');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count) values ('f0000000-0000-4000-8000-000000000007', 'x', 'x', 'all', 1) $q$, '42501', null, 'anon: can''t insert a broadcast');
insert into _tap (line) select is_empty($q$ update public.broadcast_emails set subject = 'hacked' returning 1 $q$, 'anon: can''t update a broadcast');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_emails returning 1 $q$, 'anon: can''t delete a broadcast');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_draft $q$, 'anon: sees no draft');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_draft (id, audience_type, subject, body_html) values (true, 'all', 'x', '') $q$, '42501', null, 'anon: can''t insert a draft');
insert into _tap (line) select is_empty($q$ update public.broadcast_draft set subject = 'hacked' returning 1 $q$, 'anon: can''t update the draft');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_draft returning 1 $q$, 'anon: can''t delete the draft');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_unsubscribes $q$, 'anon: sees no unsubscribes');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_unsubscribes (user_id) values ('f0000000-0000-4000-8000-000000000005') $q$, '42501', null, 'anon: can''t unsubscribe someone');
insert into _tap (line) select is_empty($q$ update public.broadcast_unsubscribes set created_at = now() returning 1 $q$, 'anon: can''t update unsubscribes');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_unsubscribes returning 1 $q$, 'anon: can''t delete unsubscribes');
insert into _tap (line) select is_empty($q$ select 1 from storage.objects where bucket_id = 'broadcast-attachments' $q$, 'anon: sees no attachment files');
insert into _tap (line) select throws_ok($q$ insert into storage.objects (bucket_id, name) values ('broadcast-attachments', 'pgtap/x.pdf') $q$, '42501', null, 'anon: can''t upload an attachment');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_emails $q$, 'member owner: sees no broadcast history');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count) values ('f0000000-0000-4000-8000-000000000007', 'x', 'x', 'all', 1) $q$, '42501', null, 'member owner: can''t insert a broadcast');
insert into _tap (line) select is_empty($q$ update public.broadcast_emails set subject = 'hacked' returning 1 $q$, 'member owner: can''t update a broadcast');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_emails returning 1 $q$, 'member owner: can''t delete a broadcast');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_draft $q$, 'member owner: sees no draft');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_draft (id, audience_type, subject, body_html) values (true, 'all', 'x', '') $q$, '42501', null, 'member owner: can''t insert a draft');
insert into _tap (line) select is_empty($q$ update public.broadcast_draft set subject = 'hacked' returning 1 $q$, 'member owner: can''t update the draft');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_draft returning 1 $q$, 'member owner: can''t delete the draft');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_unsubscribes $q$, 'member owner: sees no unsubscribes');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_unsubscribes (user_id) values ('f0000000-0000-4000-8000-000000000005') $q$, '42501', null, 'member owner: can''t unsubscribe someone');
insert into _tap (line) select is_empty($q$ update public.broadcast_unsubscribes set created_at = now() returning 1 $q$, 'member owner: can''t update unsubscribes');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_unsubscribes returning 1 $q$, 'member owner: can''t delete unsubscribes');
insert into _tap (line) select is_empty($q$ select 1 from storage.objects where bucket_id = 'broadcast-attachments' $q$, 'member owner: sees no attachment files');
insert into _tap (line) select throws_ok($q$ insert into storage.objects (bucket_id, name) values ('broadcast-attachments', 'pgtap/x.pdf') $q$, '42501', null, 'member owner: can''t upload an attachment');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_emails $q$, 'guild admin: sees no broadcast history');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count) values ('f0000000-0000-4000-8000-000000000007', 'x', 'x', 'all', 1) $q$, '42501', null, 'guild admin: can''t insert a broadcast');
insert into _tap (line) select is_empty($q$ update public.broadcast_emails set subject = 'hacked' returning 1 $q$, 'guild admin: can''t update a broadcast');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_emails returning 1 $q$, 'guild admin: can''t delete a broadcast');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_draft $q$, 'guild admin: sees no draft');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_draft (id, audience_type, subject, body_html) values (true, 'all', 'x', '') $q$, '42501', null, 'guild admin: can''t insert a draft');
insert into _tap (line) select is_empty($q$ update public.broadcast_draft set subject = 'hacked' returning 1 $q$, 'guild admin: can''t update the draft');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_draft returning 1 $q$, 'guild admin: can''t delete the draft');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_unsubscribes $q$, 'guild admin: sees no unsubscribes');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_unsubscribes (user_id) values ('f0000000-0000-4000-8000-000000000005') $q$, '42501', null, 'guild admin: can''t unsubscribe someone');
insert into _tap (line) select is_empty($q$ update public.broadcast_unsubscribes set created_at = now() returning 1 $q$, 'guild admin: can''t update unsubscribes');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_unsubscribes returning 1 $q$, 'guild admin: can''t delete unsubscribes');
insert into _tap (line) select is_empty($q$ select 1 from storage.objects where bucket_id = 'broadcast-attachments' $q$, 'guild admin: sees no attachment files');
insert into _tap (line) select throws_ok($q$ insert into storage.objects (bucket_id, name) values ('broadcast-attachments', 'pgtap/x.pdf') $q$, '42501', null, 'guild admin: can''t upload an attachment');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000007","role":"authenticated"}';

insert into _tap (line) select isnt_empty($q$ select 1 from public.broadcast_emails $q$, 'super admin: reads the broadcast history');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_emails (sent_by_user_id, subject, body_html, audience_type, recipient_count) values ('f0000000-0000-4000-8000-000000000007', 'x', 'x', 'all', 1) $q$, '42501', null, 'super admin: still can''t insert a broadcast (Worker only)');
insert into _tap (line) select is_empty($q$ update public.broadcast_emails set subject = 'hacked' returning 1 $q$, 'super admin: can''t update a broadcast');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_emails returning 1 $q$, 'super admin: can''t delete a broadcast');
insert into _tap (line) select is_empty($q$ select 1 from public.broadcast_draft $q$, 'super admin: draft is Worker-only (no client select)');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_draft (id, audience_type, subject, body_html) values (true, 'all', 'x', '') $q$, '42501', null, 'super admin: no client draft insert');
insert into _tap (line) select is_empty($q$ update public.broadcast_draft set subject = 'hacked' returning 1 $q$, 'super admin: no client draft update');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_draft returning 1 $q$, 'super admin: no client draft delete');
insert into _tap (line) select isnt_empty($q$ select 1 from public.broadcast_unsubscribes $q$, 'super admin: reads the unsubscribe list');
insert into _tap (line) select throws_ok($q$ insert into public.broadcast_unsubscribes (user_id) values ('f0000000-0000-4000-8000-000000000005') $q$, '42501', null, 'super admin: no client unsubscribe insert');
insert into _tap (line) select is_empty($q$ update public.broadcast_unsubscribes set created_at = now() returning 1 $q$, 'super admin: no client unsubscribe update');
insert into _tap (line) select is_empty($q$ delete from public.broadcast_unsubscribes returning 1 $q$, 'super admin: no client unsubscribe delete');
insert into _tap (line) select lives_ok($q$ insert into storage.objects (bucket_id, name) values ('broadcast-attachments', 'pgtap/x.pdf') $q$, 'super admin: uploads an attachment');
insert into _tap (line) select isnt_empty($q$ select 1 from storage.objects where bucket_id = 'broadcast-attachments' $q$, 'super admin: sees attachment files');

reset role;
insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
