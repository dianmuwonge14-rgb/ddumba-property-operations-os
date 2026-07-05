-- Phase 1B: landlords, properties, rooms, tenants, documents, leases, lifecycle.

create table if not exists public.landlords (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  national_id text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landlord_id uuid not null references public.landlords(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  branch_name text,
  currency text not null default 'UGX',
  is_default boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  name text not null,
  code text not null,
  property_type text not null default 'commercial',
  address text,
  city text,
  region text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'active' check (status in ('active','inactive','maintenance','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table if not exists public.property_landlords (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  landlord_id uuid not null references public.landlords(id) on delete restrict,
  ownership_percentage numeric(6,3) not null default 100 check (ownership_percentage > 0 and ownership_percentage <= 100),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(property_id, landlord_id)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_number text not null,
  floor text,
  size_sq_m numeric(10,2),
  monthly_rent numeric(14,2) not null default 0 check (monthly_rent >= 0),
  status text not null default 'vacant' check (status in ('vacant','occupied','maintenance','blocked','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, room_number)
);

create table if not exists public.room_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  old_status text,
  new_status text not null,
  reason text,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tenant_code text not null,
  full_name text not null,
  phone text,
  email text,
  national_id text,
  tenant_type text not null default 'individual' check (tenant_type in ('individual','business')),
  risk_score numeric(5,2) not null default 0,
  reliability_score numeric(5,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive','evicted','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, tenant_code)
);

create table if not exists public.tenant_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  relationship text,
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  entity_type text not null,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  bucket text not null,
  object_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(bucket, object_path)
);

create table if not exists public.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_type_id uuid references public.document_types(id) on delete set null,
  attachment_id uuid references public.attachments(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tenant_document_id uuid not null references public.tenant_documents(id) on delete cascade,
  status text not null check (status in ('verified','rejected')),
  notes text,
  verified_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  start_date date not null,
  end_date date,
  monthly_rent numeric(14,2) not null check (monthly_rent >= 0),
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  billing_day int not null default 1 check (billing_day between 1 and 28),
  status text not null default 'active' check (status in ('draft','active','terminated','expired','evicted','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create unique index if not exists uniq_active_lease_per_room
  on public.leases(room_id)
  where status = 'active';

create table if not exists public.lease_charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  charge_type text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  frequency text not null default 'monthly',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lease_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  attachment_id uuid references public.attachments(id) on delete set null,
  document_type text not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.move_in_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  room_condition text,
  meter_readings jsonb not null default '{}',
  keys_issued int not null default 0,
  notes text,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.move_out_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  room_condition text,
  final_balance numeric(14,2) not null default 0,
  deposit_deductions numeric(14,2) not null default 0,
  notes text,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.eviction_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lease_id uuid not null references public.leases(id) on delete restrict,
  reason text not null,
  status text not null default 'open' check (status in ('open','notice_served','legal','resolved','cancelled')),
  opened_by uuid references public.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.eviction_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  eviction_case_id uuid not null references public.eviction_cases(id) on delete cascade,
  step_type text not null,
  status text not null default 'pending',
  due_date date,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
