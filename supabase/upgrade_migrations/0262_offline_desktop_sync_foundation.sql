-- Offline-first desktop foundation.
-- Supabase remains authoritative; these tables register devices and queue
-- offline mutations before dedicated financial sync workers post them.

create extension if not exists pgcrypto;

create table if not exists public.desktop_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  office_id uuid references public.offices(id) on delete set null,
  device_id text not null,
  device_name text not null default 'Desktop device',
  platform text not null default 'desktop',
  app_version text not null default 'unknown',
  user_agent text,
  status text not null default 'active' check (status in ('active', 'revoked', 'blocked')),
  last_online_at timestamptz,
  last_sync_at timestamptz,
  pending_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  revoke_reason text,
  constraint desktop_devices_company_device_unique unique(company_id, device_id)
);

create index if not exists idx_desktop_devices_company_status
  on public.desktop_devices(company_id, status, last_online_at desc);

create index if not exists idx_desktop_devices_employee
  on public.desktop_devices(company_id, employee_id)
  where employee_id is not null;

create table if not exists public.desktop_sync_mutations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  office_id uuid references public.offices(id) on delete set null,
  device_id text not null,
  transaction_uuid uuid not null,
  transaction_type text not null check (transaction_type in ('tenant_payment', 'security_deposit', 'expense_request', 'promise', 'collection_note')),
  business_date date not null,
  local_created_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  base_revision text,
  sync_status text not null default 'waiting_to_sync' check (sync_status in ('saved_offline', 'waiting_to_sync', 'syncing', 'synced', 'conflict', 'failed')),
  retry_count integer not null default 0,
  server_acknowledgement_id uuid,
  server_acknowledgement_table text,
  synced_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint desktop_sync_mutations_company_tx_unique unique(company_id, transaction_uuid)
);

create index if not exists idx_desktop_sync_mutations_worker
  on public.desktop_sync_mutations(company_id, sync_status, created_at)
  where sync_status in ('waiting_to_sync', 'failed', 'conflict');

create index if not exists idx_desktop_sync_mutations_user
  on public.desktop_sync_mutations(company_id, user_id, local_created_at desc);

create index if not exists idx_desktop_sync_mutations_office_date
  on public.desktop_sync_mutations(company_id, office_id, business_date)
  where office_id is not null;

create table if not exists public.desktop_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mutation_id uuid not null references public.desktop_sync_mutations(id) on delete cascade,
  conflict_type text not null,
  conflict_reason text not null,
  server_snapshot jsonb,
  local_payload jsonb,
  status text not null default 'pending_admin_review' check (status in ('pending_admin_review', 'resolved', 'rejected')),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_desktop_sync_conflicts_company_status
  on public.desktop_sync_conflicts(company_id, status, created_at desc);

alter table if exists public.collections
  add column if not exists offline_transaction_uuid uuid,
  add column if not exists offline_device_id text,
  add column if not exists offline_local_created_at timestamptz,
  add column if not exists offline_sync_mutation_id uuid references public.desktop_sync_mutations(id) on delete set null;

create unique index if not exists idx_collections_company_offline_transaction_uuid
  on public.collections(company_id, offline_transaction_uuid)
  where offline_transaction_uuid is not null;

alter table if exists public.payment_receipts
  add column if not exists offline_transaction_uuid uuid,
  add column if not exists provisional_offline_receipt_number text,
  add column if not exists offline_sync_status text;

create index if not exists idx_payment_receipts_offline_transaction_uuid
  on public.payment_receipts(company_id, offline_transaction_uuid)
  where offline_transaction_uuid is not null;

alter table public.desktop_devices enable row level security;
alter table public.desktop_sync_mutations enable row level security;
alter table public.desktop_sync_conflicts enable row level security;

drop policy if exists desktop_devices_service_all on public.desktop_devices;
create policy desktop_devices_service_all on public.desktop_devices
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists desktop_sync_mutations_service_all on public.desktop_sync_mutations;
create policy desktop_sync_mutations_service_all on public.desktop_sync_mutations
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists desktop_sync_conflicts_service_all on public.desktop_sync_conflicts;
create policy desktop_sync_conflicts_service_all on public.desktop_sync_conflicts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
