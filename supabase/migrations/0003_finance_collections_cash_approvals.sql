-- Phase 1C: collections, ledger, landlord settlements, cash engine, reconciliation, expenses, approvals.

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

create table if not exists public.promises (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  lease_id uuid not null references public.leases(id) on delete restrict,
  promised_amount numeric(14,2) not null check (promised_amount > 0),
  promised_date date not null,
  status text not null default 'open' check (status in ('open','fulfilled','broken','cancelled')),
  fulfilled_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid references public.properties(id) on delete set null,
  category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  vendor text,
  description text,
  status text not null default 'pending',
  submitted_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
