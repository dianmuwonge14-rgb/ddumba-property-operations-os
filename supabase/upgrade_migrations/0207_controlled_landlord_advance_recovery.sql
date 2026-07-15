-- 0207_controlled_landlord_advance_recovery.sql
-- Controlled landlord advance recovery for landlord payment workflows.
-- Additive only: no existing payments, advances, or monthly payables are deleted or rewritten.

alter table public.landlord_payment_expense_requests
    add column if not exists advance_recovery_amount numeric(14,2) not null default 0,
    add column if not exists advance_balance_before numeric(14,2) not null default 0,
    add column if not exists advance_balance_after numeric(14,2) not null default 0,
    add column if not exists cash_payment_amount numeric(14,2) not null default 0;

alter table public.landlord_payments
    add column if not exists advance_recovery_amount numeric(14,2) not null default 0,
    add column if not exists advance_balance_before numeric(14,2) not null default 0,
    add column if not exists advance_balance_after numeric(14,2) not null default 0,
    add column if not exists cash_payment_amount numeric(14,2) not null default 0,
    add column if not exists new_advance_amount numeric(14,2) not null default 0;

alter table public.landlord_monthly_payable_payments
    add column if not exists advance_recovery_amount numeric(14,2) not null default 0,
    add column if not exists cash_payment_amount numeric(14,2) not null default 0;

create table if not exists public.landlord_advance_recovery_allocations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    landlord_advance_id uuid not null references public.landlord_advances(id) on delete cascade,
    landlord_payment_id uuid references public.landlord_payments(id) on delete set null,
    landlord_payment_request_id uuid references public.landlord_payment_expense_requests(id) on delete set null,
    monthly_payable_id uuid references public.landlord_monthly_payables(id) on delete set null,
    advance_balance_before numeric(14,2) not null default 0,
    recovery_amount numeric(14,2) not null default 0 check (recovery_amount >= 0),
    advance_balance_after numeric(14,2) not null default 0,
    effective_month date not null,
    status text not null default 'approved' check (status in ('pending','approved','rejected','reversed')),
    requested_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    idempotency_key text not null,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, idempotency_key)
);

create index if not exists idx_landlord_advance_recovery_allocations_scope
    on public.landlord_advance_recovery_allocations(company_id, office_id, landlord_id, effective_month, status);

create index if not exists idx_landlord_advance_recovery_allocations_advance
    on public.landlord_advance_recovery_allocations(landlord_advance_id, created_at desc);

create index if not exists idx_landlord_payment_requests_advance_recovery
    on public.landlord_payment_expense_requests(company_id, office_id, landlord_id, status, advance_recovery_amount)
    where advance_recovery_amount > 0;

alter table public.landlord_advance_recovery_allocations enable row level security;

drop policy if exists landlord_advance_recovery_allocations_read on public.landlord_advance_recovery_allocations;
create policy landlord_advance_recovery_allocations_read
on public.landlord_advance_recovery_allocations
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists landlord_advance_recovery_allocations_admin_write on public.landlord_advance_recovery_allocations;
create policy landlord_advance_recovery_allocations_admin_write
on public.landlord_advance_recovery_allocations
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);
