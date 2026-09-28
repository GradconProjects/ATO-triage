create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  relationship text not null check (relationship in ('self','spouse','family','client','other')),
  birth_year int check (birth_year between 1900 and 2100),
  occupations text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fy_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  financial_year text not null check (financial_year ~ '^20[0-9]{2}-[0-9]{2}$'),
  purpose text not null check (purpose in ('pre_lodgment','assessment_review','amendment','planning')),
  status text not null default 'draft' check (status in ('draft','in_review','final')),
  rule_set_version text,
  created_at timestamptz not null default now(),
  unique (profile_id, financial_year, purpose)
);

create table repeater_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null,          -- e.g. 'employer', 'rental_property', 'cgt_event', 'lump_sum_e_year'
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  repeater_item_id uuid references repeater_items(id) on delete cascade,
  value jsonb,
  state text not null check (state in ('answered','not_sure','skipped','not_applicable_by_rule','imported')),
  source text not null default 'user' check (source in ('user','document','prefill_confirmed')),
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index on answers (case_id, question_id, repeater_item_id, version desc);

create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  doc_type text not null,
  original_name text,
  created_at timestamptz not null default now()
);

create table estimates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_set_version text not null,
  result jsonb not null,           -- totals + explained lines
  confidence text not null check (confidence in ('high','medium','low')),
  completeness_pct int not null,
  created_at timestamptz not null default now()
);

create table flags (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  estimate_id uuid references estimates(id) on delete cascade,
  kind text not null check (kind in ('review','opportunity','consistency','missing')),
  severity text not null check (severity in ('info','warning','blocker')),
  code text not null,
  message text not null,
  question_ids text[] not null default '{}'
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,         -- answers + estimate + flags + rule version, frozen
  pdf_path text,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  owner_id uuid not null,
  entity text not null,
  entity_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
