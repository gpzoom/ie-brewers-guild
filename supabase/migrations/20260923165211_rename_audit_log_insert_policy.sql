drop policy "audit_log: guild admins can insert rows attributed to themselves" on public.audit_log;

create policy "audit_log: guild admins can insert their own rows"
  on public.audit_log for insert
  to authenticated
  with check (public.is_guild_admin() and actor_user_id = auth.uid());
