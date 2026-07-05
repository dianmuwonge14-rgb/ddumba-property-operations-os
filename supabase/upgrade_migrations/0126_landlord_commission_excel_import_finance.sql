-- Phase 26+: Company commission Excel import and monthly finance intelligence.
-- Additive only. No destructive statements.

alter table public.landlords
    add column if not exists commission_input_mode text,
    add column if not exists landlord_net_payable_override numeric(14,2),
    add column if not exists commission_import_batch_id uuid,
    add column if not exists commission_notes text;

create table if not exists public.landlord_commission_import_batches (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    file_name text not null,
    sheet_name text,
    total_rows integer not null default 0,
    matched_rows integer not null default 0,
    unmatched_rows integer not null default 0,
    ambiguous_rows integer not null default 0,
    imported_rows integer not null default 0,
    status text not null default 'dry_run',
    detected_columns jsonb not null default '[]'::jsonb,
    totals jsonb not null default '{}'::jsonb,
    created_by uuid,
    approved_by uuid,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.landlord_commission_import_rows (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.landlord_commission_import_batches(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    row_number integer not null,
    sheet_name text,
    raw_data jsonb not null default '{}'::jsonb,
    detected_landlord_name text,
    detected_phone text,
    detected_office_or_property text,
    detected_portfolio_rent_roll numeric(14,2),
    detected_commission_amount numeric(14,2),
    detected_commission_rate numeric(7,4),
    detected_landlord_net_payable numeric(14,2),
    matched_landlord_id uuid references public.landlords(id) on delete set null,
    match_status text not null default 'unmatched',
    match_confidence integer not null default 0,
    match_reason text,
    calculated_commission_rate numeric(7,4),
    calculated_commission_amount numeric(14,2),
    calculated_landlord_net_payable numeric(14,2),
    error_message text,
    imported_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.company_monthly_finance_snapshots (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    snapshot_month date not null,
    expected_rent_roll numeric(14,2) not null default 0,
    expected_company_commission numeric(14,2) not null default 0,
    expected_landlord_payable numeric(14,2) not null default 0,
    amount_collected numeric(14,2) not null default 0,
    expenses numeric(14,2) not null default 0,
    landlord_payments_made numeric(14,2) not null default 0,
    recovery_deductions_pending numeric(14,2) not null default 0,
    profit_loss numeric(14,2) not null default 0,
    office_performance jsonb not null default '[]'::jsonb,
    landlord_performance jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, snapshot_month)
);

create table if not exists public.office_monthly_finance_snapshots (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    snapshot_month date not null,
    expected_rent_roll numeric(14,2) not null default 0,
    expected_company_commission numeric(14,2) not null default 0,
    expected_landlord_payable numeric(14,2) not null default 0,
    amount_collected numeric(14,2) not null default 0,
    expenses numeric(14,2) not null default 0,
    landlord_payments_made numeric(14,2) not null default 0,
    outstanding_tenant_balances numeric(14,2) not null default 0,
    profit_loss numeric(14,2) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, office_id, snapshot_month)
);

create index if not exists idx_landlord_commission_import_batches_company
    on public.landlord_commission_import_batches(company_id, created_at desc);

create index if not exists idx_landlord_commission_import_rows_batch
    on public.landlord_commission_import_rows(batch_id, match_status, row_number);

create index if not exists idx_landlord_commission_import_rows_landlord
    on public.landlord_commission_import_rows(company_id, matched_landlord_id);

create index if not exists idx_company_monthly_finance_snapshots_month
    on public.company_monthly_finance_snapshots(company_id, snapshot_month desc);

create index if not exists idx_office_monthly_finance_snapshots_month
    on public.office_monthly_finance_snapshots(company_id, office_id, snapshot_month desc);

alter table public.landlord_commission_import_batches enable row level security;
alter table public.landlord_commission_import_rows enable row level security;
alter table public.company_monthly_finance_snapshots enable row level security;
alter table public.office_monthly_finance_snapshots enable row level security;

drop policy if exists landlord_commission_import_batches_admin_v1 on public.landlord_commission_import_batches;
create policy landlord_commission_import_batches_admin_v1
on public.landlord_commission_import_batches
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
);

drop policy if exists landlord_commission_import_rows_admin_v1 on public.landlord_commission_import_rows;
create policy landlord_commission_import_rows_admin_v1
on public.landlord_commission_import_rows
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
);

drop policy if exists company_monthly_finance_snapshots_company_v1 on public.company_monthly_finance_snapshots;
create policy company_monthly_finance_snapshots_company_v1
on public.company_monthly_finance_snapshots
for select
using (
    public.ddumba_v1_is_service_role()
    or company_id = public.ddumba_v1_current_company_id()
);

drop policy if exists office_monthly_finance_snapshots_office_v1 on public.office_monthly_finance_snapshots;
create policy office_monthly_finance_snapshots_office_v1
on public.office_monthly_finance_snapshots
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
    )
);
