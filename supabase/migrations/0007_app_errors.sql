-- Server error capture so crashes can be diagnosed without platform log access.
create table app_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  digest text,
  path text,
  method text,
  route text,
  message text,
  stack text
);
alter table app_errors enable row level security;
create policy "anyone_insert" on app_errors for insert to anon, authenticated with check (true);
create policy "admin_select" on app_errors for select using (public.is_app_admin());
