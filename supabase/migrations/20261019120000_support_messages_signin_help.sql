-- Sign-in help (docs/member-profiles.md, "Sign-in help"): the sign-in page's
-- "contact support" link opens /signin/help, a public form for someone who
-- can't sign in (usually their email changed). Each request is emailed to
-- support@iscbrewersguild.org and saved here, so it shows on the super
-- admin's Help messages screen with the Help button's messages.
--
-- A sign-in help row has kind 'signin', no submitted_by_user_id (nobody is
-- signed in), first_name holding the name they typed, email their new
-- address (replies go there), member_name the business name they typed, and
-- previous_email the address they used to sign in with. Still written only
-- by the server with the service role, after its rate limit and honeypot
-- checks; no insert policy.
alter table public.support_messages
  drop constraint support_messages_kind_check;

alter table public.support_messages
  add constraint support_messages_kind_check check (kind in ('bug', 'feature', 'signin'));

alter table public.support_messages
  add column previous_email text check (previous_email is null or char_length(previous_email) between 3 and 254);
