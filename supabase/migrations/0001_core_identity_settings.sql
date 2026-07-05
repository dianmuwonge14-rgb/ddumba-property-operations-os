-- Ddumba Property Operations OS v1.0 Enterprise Edition
-- Phase 1A: extensions, core tenancy, identity, roles, security, settings.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  city text,
  region text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  employee_code text,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active','inactive','suspended','archived')),
  default_office_id uuid references public.offices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, employee_code)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  office_id uuid references public.offices(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  job_title text,
  department text,
  employment_type text not null default 'full_time',
  hire_date date,
  termination_date date,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active','inactive','terminated','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, employee_code)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  key text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(role_id, permission_id)
);

create table if not exists public.user_office_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  scope text not null default 'office' check (scope in ('company','office')),
  created_at timestamptz not null default now(),
  unique(user_id, office_id, role_id)
);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  device_fingerprint text not null,
  device_name text,
  platform text,
  status text not null default 'pending' check (status in ('pending','approved','blocked','revoked')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, device_fingerprint)
);

create table if not exists public.pin_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  pin_hash text not null,
  status text not null default 'active' check (status in ('active','expired','revoked','locked')),
  failed_attempts int not null default 0,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.office_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(office_id, key)
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  rollout jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.settings_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  setting_scope text not null check (setting_scope in ('system','company','office','feature')),
  setting_key text not null,
  old_value jsonb,
  new_value jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_by uuid references public.users(id) on delete set null,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.settings_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  setting_scope text not null,
  setting_key text not null,
  value jsonb not null,
  version int not null,
  changed_by uuid references public.users(id) on delete set null,
  change_request_id uuid references public.settings_change_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id, office_id, setting_scope, setting_key, version)
);

create table if not exists public.configuration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  setting_scope text not null,
  setting_key text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
