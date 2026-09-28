-- Admin access without a service-role key.
-- An admin is either an email in app_admin_emails or an app_users row with restriction_level 'none'.
-- Admins can read every user's profiles, cases, reports and report PDFs, and manage team users
-- through SECURITY DEFINER functions that check is_app_admin() first.

create table if not exists app_admin_emails (email text primary key);
alter table app_admin_emails enable row level security; -- no policies: not readable by clients
insert into app_admin_emails (email) values ('ipaliboboma@gmail.com') on conflict do nothing;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
      select 1 from auth.users u
      where u.id = auth.uid() and lower(u.email) in (select lower(email) from public.app_admin_emails)
    )
    or exists (select 1 from public.app_users a where a.id = auth.uid() and a.restriction_level = 'none');
$$;
grant execute on function public.is_app_admin() to authenticated;

-- Admin read access across users.
create policy "admin_select" on profiles for select using (public.is_app_admin());
create policy "admin_select" on fy_cases for select using (public.is_app_admin());
create policy "admin_select" on reports for select using (public.is_app_admin());
create policy "admin_select" on app_users for select using (public.is_app_admin());
create policy "admin_select" on audit_log for select using (public.is_app_admin());
create policy "case_documents_admin_select" on storage.objects for select
  using (bucket_id = 'case-documents' and public.is_app_admin());

-- Internal: create an auth user + identity + app_users row. Not callable by clients.
-- p_password is the already-derived password (the app hashes the short code with a server pepper).
create or replace function public._create_team_user(p_username text, p_display text, p_password text, p_level text, p_created_by uuid)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(p_username) || '@team.tax-intake.local';
begin
  if p_username !~ '^[a-z0-9_.-]{2,40}$' then raise exception 'Username must be 2-40 lowercase letters, numbers, dots, dashes or underscores'; end if;
  if p_level not in ('none','full','standard','restricted','view_only') then raise exception 'Unknown restriction level'; end if;
  if exists (select 1 from auth.users where email = v_email) then raise exception 'That username is taken'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', lower(p_username), 'display_name', p_display), now(), now(),
    '', '', '', '', '', '', '', '', false, false);
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  insert into public.app_users (id, username, display_name, role, restriction_level, created_by)
  values (v_id, lower(p_username), coalesce(nullif(trim(p_display), ''), lower(p_username)),
          case when p_level = 'none' then 'admin' else 'member' end, p_level, p_created_by);
  return v_id;
end $$;
revoke all on function public._create_team_user(text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.admin_create_team_user(p_username text, p_display text, p_password text, p_level text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;
  v_id := public._create_team_user(p_username, p_display, p_password, p_level, auth.uid());
  insert into audit_log (owner_id, entity, entity_id, action, detail)
  values (auth.uid(), 'app_user', v_id, 'create', jsonb_build_object('username', p_username, 'level', p_level));
  return v_id;
end $$;

create or replace function public.admin_set_restriction(p_user uuid, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;
  if p_level not in ('none','full','standard','restricted','view_only') then raise exception 'Unknown restriction level'; end if;
  update app_users set restriction_level = p_level, role = case when p_level = 'none' then 'admin' else 'member' end where id = p_user;
  insert into audit_log (owner_id, entity, entity_id, action, detail) values (auth.uid(), 'app_user', p_user, 'restriction', jsonb_build_object('level', p_level));
end $$;

create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.app_users where id = p_user) then raise exception 'Not a team user'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  insert into public.audit_log (owner_id, entity, entity_id, action) values (auth.uid(), 'app_user', p_user, 'reset_code');
end $$;

create or replace function public.admin_delete_team_user(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  if not exists (select 1 from public.app_users where id = p_user) then raise exception 'Not a team user'; end if;
  delete from auth.users where id = p_user; -- cascades to app_users, profiles, cases, reports
  insert into public.audit_log (owner_id, entity, entity_id, action) values (auth.uid(), 'app_user', p_user, 'delete');
end $$;

grant execute on function public.admin_create_team_user(text, text, text, text) to authenticated;
grant execute on function public.admin_set_restriction(uuid, text) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_team_user(uuid) to authenticated;

-- Owner label for the admin reports list (email for normal accounts, name for team users).
create or replace function public.admin_user_labels()
returns table (id uuid, label text) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;
  return query
    select u.id, coalesce(a.display_name || ' (' || a.username || ')', u.email::text)
    from auth.users u left join public.app_users a on a.id = u.id;
end $$;
grant execute on function public.admin_user_labels() to authenticated;
