-- Local-first desktop authentication sessions.
-- These tokens are for installed desktop clients only; the raw token is never stored.

create extension if not exists pgcrypto;

create table if not exists public.desktop_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  office_id uuid references public.offices(id) on delete set null,
  device_id text not null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  auth_mode text not null default 'office',
  scope jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_desktop_auth_sessions_user_device
  on public.desktop_auth_sessions(company_id, user_id, device_id, status);

create index if not exists idx_desktop_auth_sessions_expiry
  on public.desktop_auth_sessions(status, expires_at);

alter table public.desktop_auth_sessions enable row level security;

drop policy if exists desktop_auth_sessions_service_all on public.desktop_auth_sessions;
create policy desktop_auth_sessions_service_all on public.desktop_auth_sessions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
