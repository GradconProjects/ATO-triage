-- Team users and per-user restriction levels managed by the admin.
-- The auth account itself lives in auth.users; this table carries the app-level identity.
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.-]{2,40}$'),
  display_name text not null,
  role text not null default 'member' check (role in ('admin','member')),
  restriction_level text not null default 'standard'
    check (restriction_level in ('none','full','standard','restricted','view_only')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_users enable row level security;
-- A user may read their own row. All writes go through the service role (admin actions).
create policy "self_select" on app_users for select using (id = auth.uid());

create trigger app_users_set_updated_at before update on app_users
  for each row execute function set_updated_at();
