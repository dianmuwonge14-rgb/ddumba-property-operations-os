-- Additive enterprise tables for upgrading the existing Ddumba-attendance project.
-- Generated from the approved v1 schema, excluding tables that already exist remotely.
-- No DROP, DELETE, or TRUNCATE statements.

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

create table if not exists public.rent_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  lease_id uuid not null references public.leases(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null,
  due_date date not null,
  subtotal numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('draft','open','partially_paid','paid','void','written_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, invoice_number)
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.rent_invoices(id) on delete cascade,
  line_type text not null,
  description text not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lease_id uuid references public.leases(id) on delete set null,
  reference_number text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null,
  paid_at timestamptz not null default now(),
  received_by uuid references public.users(id) on delete set null,
  status text not null default 'posted' check (status in ('pending','posted','reversed','void')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, reference_number)
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete restrict,
  invoice_id uuid not null references public.rent_invoices(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(payment_id, invoice_id)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  receipt_number text not null,
  issued_to text not null,
  issued_by uuid references public.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  status text not null default 'issued' check (status in ('issued','cancelled','reissued')),
  file_url text,
  unique(company_id, receipt_number)
);

create table if not exists public.tenant_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lease_id uuid references public.leases(id) on delete set null,
  source_type text not null,
  source_id uuid,
  entry_type text not null check (entry_type in ('debit','credit')),
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2),
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.collector_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  collector_user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  active boolean not null default true,
  assigned_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lease_id uuid references public.leases(id) on delete set null,
  invoice_id uuid references public.rent_invoices(id) on delete set null,
  action_type text not null,
  outcome text,
  notes text,
  next_follow_up_at timestamptz,
  performed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.promise_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  promise_id uuid not null references public.promises(id) on delete cascade,
  action_type text not null,
  outcome text,
  notes text,
  performed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.arrears_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  lease_id uuid references public.leases(id) on delete cascade,
  snapshot_date date not null,
  arrears_amount numeric(14,2) not null default 0,
  days_overdue int not null default 0,
  risk_band text,
  created_at timestamptz not null default now()
);

create table if not exists public.landlord_settlement_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landlord_id uuid not null references public.landlords(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','processing','closed','cancelled')),
  created_at timestamptz not null default now(),
  unique(landlord_id, period_start, period_end),
  check(period_end >= period_start)
);

create table if not exists public.management_fee_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  landlord_id uuid references public.landlords(id) on delete cascade,
  fee_type text not null check (fee_type in ('percentage','fixed')),
  fee_value numeric(14,4) not null check (fee_value >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landlord_id uuid not null references public.landlords(id) on delete restrict,
  settlement_period_id uuid not null references public.landlord_settlement_periods(id) on delete restrict,
  gross_collections numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  management_fees numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','approved','paid','cancelled')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  settlement_id uuid not null references public.landlord_settlements(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  source_type text not null,
  source_id uuid,
  description text not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.landlord_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  settlement_id uuid not null references public.landlord_settlements(id) on delete cascade,
  statement_number text not null,
  file_url text,
  delivery_status text not null default 'pending',
  generated_at timestamptz not null default now(),
  unique(company_id, statement_number)
);

create table if not exists public.landlord_payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landlord_id uuid not null references public.landlords(id) on delete restrict,
  settlement_id uuid references public.landlord_settlements(id) on delete set null,
  payout_reference text not null,
  amount numeric(14,2) not null check (amount > 0),
  payout_method text not null,
  paid_at timestamptz,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, payout_reference)
);

create table if not exists public.landlord_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payout_id uuid not null references public.landlord_payouts(id) on delete cascade,
  settlement_line_id uuid not null references public.landlord_settlement_lines(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  provider text not null check (provider in ('mtn_mobile_money','airtel_money','bank','cash','other')),
  account_name text not null,
  account_number text not null,
  currency text not null default 'UGX',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider, account_number)
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  provider_account_id uuid references public.payment_provider_accounts(id) on delete set null,
  account_type text not null check (account_type in ('office_cash','petty_cash','bank','mobile_money','hq_cash')),
  name text not null,
  currency text not null default 'UGX',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  currency text not null default 'UGX',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, account_number)
);

create table if not exists public.mobile_money_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  provider text not null check (provider in ('mtn_mobile_money','airtel_money')),
  account_name text not null,
  phone_number text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider, phone_number)
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('inflow','outflow','transfer_in','transfer_out','adjustment')),
  source_type text not null,
  source_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  transaction_date timestamptz not null default now(),
  description text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_account_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id) on delete cascade,
  balance_date date not null,
  opening_balance numeric(14,2) not null default 0,
  closing_balance numeric(14,2) not null default 0,
  calculated_at timestamptz not null default now(),
  unique(cash_account_id, balance_date)
);

create table if not exists public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  to_cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','approved','completed','cancelled')),
  requested_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check(from_cash_account_id <> to_cash_account_id)
);

create table if not exists public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  reconciliation_date date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reconciliation_id uuid not null references public.cash_reconciliations(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  expected_balance numeric(14,2) not null default 0,
  counted_balance numeric(14,2) not null default 0,
  variance numeric(14,2) generated always as (counted_balance - expected_balance) stored,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_cash_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  position_date date not null,
  opening_cash numeric(14,2) not null default 0,
  inflows numeric(14,2) not null default 0,
  outflows numeric(14,2) not null default 0,
  closing_cash numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(office_id, position_date)
);

create table if not exists public.company_cash_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  position_date date not null,
  total_cash numeric(14,2) not null default 0,
  total_bank numeric(14,2) not null default 0,
  total_mobile_money numeric(14,2) not null default 0,
  total_position numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(company_id, position_date)
);

create table if not exists public.external_transaction_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid not null references public.payment_provider_accounts(id) on delete restrict,
  source_file_attachment_id uuid references public.attachments(id) on delete set null,
  imported_by uuid references public.users(id) on delete set null,
  status text not null default 'pending',
  imported_at timestamptz not null default now()
);

create table if not exists public.external_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid not null references public.payment_provider_accounts(id) on delete restrict,
  import_id uuid references public.external_transaction_imports(id) on delete set null,
  provider_reference text not null,
  transaction_time timestamptz not null,
  amount numeric(14,2) not null,
  direction text not null check (direction in ('inflow','outflow')),
  counterparty text,
  raw_payload jsonb not null default '{}',
  status text not null default 'unmatched',
  created_at timestamptz not null default now(),
  unique(provider_account_id, provider_reference)
);

create table if not exists public.transaction_reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_transaction_id uuid not null references public.external_transactions(id) on delete restrict,
  cash_transaction_id uuid references public.cash_transactions(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  match_type text not null,
  confidence numeric(5,2),
  matched_by uuid references public.users(id) on delete set null,
  matched_at timestamptz not null default now()
);

create table if not exists public.transaction_reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_transaction_id uuid not null references public.external_transactions(id) on delete cascade,
  exception_type text not null,
  status text not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.payment_provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid references public.payment_provider_accounts(id) on delete set null,
  provider text not null,
  event_id text,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, event_id)
);

create table if not exists public.reversal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  external_transaction_id uuid references public.external_transactions(id) on delete set null,
  reason text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  purpose text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.withdrawal_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  withdrawal_request_id uuid not null references public.withdrawal_requests(id) on delete cascade,
  approver_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('approved','rejected','returned')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.expense_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  attachment_id uuid references public.attachments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.petty_cash_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  purpose text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.petty_cash_disbursements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  petty_cash_request_id uuid not null references public.petty_cash_requests(id) on delete restrict,
  cash_transaction_id uuid references public.cash_transactions(id) on delete set null,
  disbursed_by uuid references public.users(id) on delete set null,
  disbursed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  entity_type text not null,
  min_amount numeric(14,2),
  max_amount numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null references public.approval_workflows(id) on delete cascade,
  step_order int not null check (step_order > 0),
  role_id uuid references public.roles(id) on delete set null,
  required_permission text,
  created_at timestamptz not null default now(),
  unique(workflow_id, step_order)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  workflow_id uuid references public.approval_workflows(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_order int,
  actor_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('approved','rejected','returned','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.field_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  office_id uuid not null references public.offices(id) on delete cascade,
  agent_type text not null default 'collector',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id)
);

create table if not exists public.field_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  field_agent_id uuid not null references public.field_agents(id) on delete cascade,
  route_date date not null,
  status text not null default 'planned',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_route_stops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid not null references public.field_routes(id) on delete cascade,
  stop_order int not null,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  purpose text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(route_id, stop_order)
);

create table if not exists public.field_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  field_agent_id uuid not null references public.field_agents(id) on delete cascade,
  route_stop_id uuid references public.field_route_stops(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  visit_type text not null,
  visit_date timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'started',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_visit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_visit_id uuid not null references public.field_visits(id) on delete cascade,
  event_type text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  center_latitude numeric(10,7) not null,
  center_longitude numeric(10,7) not null,
  radius_meters int not null check (radius_meters > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gps_validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  geofence_id uuid references public.geofences(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  distance_meters numeric(10,2),
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.property_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  field_agent_id uuid references public.field_agents(id) on delete set null,
  inspection_date timestamptz not null default now(),
  status text not null default 'draft',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.property_inspections(id) on delete cascade,
  item_name text not null,
  result text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  inspection_id uuid references public.property_inspections(id) on delete cascade,
  severity text not null default 'medium',
  title text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  finding_id uuid references public.inspection_findings(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  name text not null,
  check_in_time time not null,
  check_out_time time not null,
  grace_minutes int not null default 0,
  require_gps boolean not null default true,
  require_approved_device boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  schedule jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  schedule_id uuid not null references public.work_schedules(id) on delete restrict,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('check_in','break_start','break_end','check_out')),
  event_time timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  device_id uuid references public.user_devices(id) on delete set null,
  gps_validation_id uuid references public.gps_validations(id) on delete set null,
  source text not null default 'web',
  status text not null default 'valid',
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  first_check_in timestamptz,
  last_check_out timestamptz,
  total_minutes int not null default 0,
  break_minutes int not null default 0,
  late_minutes int not null default 0,
  status text not null default 'absent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, work_date)
);

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  requested_change jsonb not null,
  reason text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_correction_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  correction_id uuid not null references public.attendance_corrections(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.absence_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  absence_date date not null,
  absence_type text not null,
  status text not null default 'recorded',
  created_at timestamptz not null default now(),
  unique(employee_id, absence_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(ends_on >= starts_on)
);

create table if not exists public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, holiday_date)
);

create table if not exists public.device_attendance_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  device_id uuid not null references public.user_devices(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(employee_id, device_id)
);

create table if not exists public.payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  salary_type text not null default 'monthly',
  base_salary numeric(14,2) not null default 0,
  payment_method text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id)
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique(company_id, period_start, period_end),
  check(period_end >= period_start)
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  status text not null default 'draft',
  run_by uuid references public.users(id) on delete set null,
  run_at timestamptz not null default now()
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  gross_pay numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(payroll_run_id, employee_id)
);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  adjustment_type text not null,
  amount numeric(14,2) not null,
  reason text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  file_url text,
  status text not null default 'pending',
  exported_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  channel text not null check (channel in ('sms','whatsapp','email','in_app')),
  provider text,
  config jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  channel text not null,
  subject text,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, key, channel)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  channel_id uuid references public.communication_channels(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  subject text,
  body text not null,
  status text not null default 'queued',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  recipient_type text not null,
  recipient_id uuid,
  destination text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.message_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_recipient_id uuid not null references public.message_recipients(id) on delete cascade,
  attempt_number int not null,
  provider text,
  provider_message_id text,
  status text not null,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create table if not exists public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_recipient_id uuid not null references public.message_recipients(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.communication_provider_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null,
  provider text not null,
  direction text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_failures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_recipient_id uuid references public.message_recipients(id) on delete cascade,
  failure_reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.escalation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  entity_type text not null,
  conditions jsonb not null default '{}',
  actions jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  title text not null,
  body text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_type text not null,
  recipient_id uuid not null,
  channel text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recipient_type, recipient_id, channel)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  report_type text not null,
  config jsonb not null default '{}',
  visibility text not null default 'private',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  run_by uuid references public.users(id) on delete set null,
  filters jsonb not null default '{}',
  status text not null default 'queued',
  file_url text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.saved_report_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.report_access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  report_run_id uuid references public.report_runs(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null,
  formula text,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  metric_definition_id uuid not null references public.metric_definitions(id) on delete restrict,
  metric_date date not null,
  value numeric(18,4) not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(company_id, office_id, metric_definition_id, metric_date)
);

create table if not exists public.office_collection_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(office_id, period_start, period_end)
);

create table if not exists public.collector_collection_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_target_id uuid not null references public.office_collection_targets(id) on delete cascade,
  collector_user_id uuid not null references public.users(id) on delete cascade,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.office_performance_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_score_id uuid not null references public.office_scores(id) on delete cascade,
  component_key text not null,
  component_score numeric(5,2) not null default 0,
  weight numeric(5,2) not null default 1,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.office_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(office_id, snapshot_date)
);

create table if not exists public.office_rankings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  ranking_date date not null,
  rank int not null,
  total_score numeric(5,2) not null,
  created_at timestamptz not null default now(),
  unique(company_id, ranking_date, office_id)
);

create table if not exists public.executive_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(company_id, snapshot_date)
);

create table if not exists public.dashboard_cache_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dashboard_key text not null,
  cache_key text not null,
  payload jsonb not null default '{}',
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, dashboard_key, cache_key)
);

create table if not exists public.dashboard_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dashboard_key text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.kpi_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_definition_id uuid references public.metric_definitions(id) on delete set null,
  status text not null,
  inputs jsonb not null default '{}',
  result jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.company_reporting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique(company_id, period_start, period_end)
);

create table if not exists public.company_consolidation_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporting_period_id uuid not null references public.company_reporting_periods(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(reporting_period_id)
);

create table if not exists public.office_consolidation_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  reporting_period_id uuid not null references public.company_reporting_periods(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(office_id, reporting_period_id)
);

create table if not exists public.consolidation_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  consolidation_snapshot_id uuid not null references public.company_consolidation_snapshots(id) on delete cascade,
  adjustment_type text not null,
  amount numeric(14,2),
  reason text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.consolidated_report_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  consolidation_snapshot_id uuid not null references public.company_consolidation_snapshots(id) on delete cascade,
  file_url text,
  status text not null default 'pending',
  exported_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_scorecards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(company_id, score_date)
);

create table if not exists public.performance_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  metric_key text not null,
  period_start date not null,
  period_end date not null,
  target_value numeric(18,4) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_master_spreadsheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  name text not null,
  source text not null,
  status text not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_spreadsheet_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  spreadsheet_id uuid not null references public.ai_master_spreadsheets(id) on delete cascade,
  row_number int not null,
  entity_type text not null,
  raw_data jsonb not null default '{}',
  normalized_data jsonb not null default '{}',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(spreadsheet_id, row_number)
);

create table if not exists public.ai_validation_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  row_id uuid not null references public.ai_spreadsheet_rows(id) on delete cascade,
  status text not null,
  findings jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.data_quality_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  entity_type text not null,
  rule jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.data_quality_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  check_id uuid references public.data_quality_checks(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  severity text not null default 'medium',
  status text not null default 'open',
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  primary_entity_id uuid,
  duplicate_entity_id uuid,
  confidence numeric(5,2),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_entity_suggestions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  suggestion_type text not null,
  entity_type text not null,
  entity_id uuid,
  suggested_data jsonb not null default '{}',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz
);

create table if not exists public.ai_action_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ai_insight_id uuid references public.ai_insights(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  feedback text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  conditions jsonb not null default '{}',
  actions jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  automation_rule_id uuid references public.automation_rules(id) on delete set null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.automation_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  automation_run_id uuid references public.automation_runs(id) on delete cascade,
  task_type text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued',
  run_after timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  schedule_expression text not null,
  payload jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  scope jsonb not null default '{}',
  schedule_expression text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  backup_job_id uuid references public.backup_jobs(id) on delete set null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  size_bytes bigint,
  error_message text
);

create table if not exists public.backup_artifacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  backup_run_id uuid not null references public.backup_runs(id) on delete cascade,
  storage_path text not null,
  checksum text,
  encrypted boolean not null default true,
  retention_until date,
  created_at timestamptz not null default now()
);

create table if not exists public.restore_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  backup_artifact_id uuid references public.backup_artifacts(id) on delete set null,
  reason text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.restore_drills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  restore_request_id uuid references public.restore_requests(id) on delete set null,
  status text not null,
  notes text,
  tested_at timestamptz not null default now()
);

create table if not exists public.data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  entity_type text not null,
  retention_days int not null check (retention_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, entity_type)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

