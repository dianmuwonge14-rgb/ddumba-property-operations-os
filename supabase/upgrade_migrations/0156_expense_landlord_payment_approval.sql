-- Phase 156: Expense-routed landlord payment approvals.
-- Additive only. Office users submit landlord-paid expenses for Admin approval.

create table if not exists public.landlord_payment_expense_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    expense_id uuid references public.expenses(id) on delete set null,
    monthly_payable_id uuid references public.landlord_monthly_payables(id) on delete set null,
    requested_amount numeric(14,2) not null check (requested_amount > 0),
    payment_date date not null,
    payment_method text not null default 'cash',
    notes text,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    submitted_by uuid,
    reviewed_by uuid,
    reviewed_at timestamptz,
    admin_comment text,
    approved_landlord_payment_id uuid references public.landlord_payments(id) on delete set null,
    approved_at timestamptz,
    rejected_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.landlord_payment_expense_requests enable row level security;

create index if not exists idx_landlord_payment_expense_requests_scope
    on public.landlord_payment_expense_requests(company_id, office_id, status, created_at desc);

create index if not exists idx_landlord_payment_expense_requests_landlord
    on public.landlord_payment_expense_requests(company_id, landlord_id, payment_date desc);

create index if not exists idx_landlord_payment_expense_requests_pending
    on public.landlord_payment_expense_requests(company_id, status)
    where status = 'pending';

drop policy if exists landlord_payment_expense_requests_admin_all on public.landlord_payment_expense_requests;
create policy landlord_payment_expense_requests_admin_all
on public.landlord_payment_expense_requests
for all
using (
    exists (
        select 1
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.company_id = landlord_payment_expense_requests.company_id
          and u.role in ('admin','super_admin','owner')
    )
)
with check (
    exists (
        select 1
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.company_id = landlord_payment_expense_requests.company_id
          and u.role in ('admin','super_admin','owner')
    )
);

drop policy if exists landlord_payment_expense_requests_office_read_insert on public.landlord_payment_expense_requests;
create policy landlord_payment_expense_requests_office_read_insert
on public.landlord_payment_expense_requests
for all
using (
    exists (
        select 1
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.company_id = landlord_payment_expense_requests.company_id
          and u.office_id = landlord_payment_expense_requests.office_id
    )
)
with check (
    status = 'pending'
    and exists (
        select 1
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.company_id = landlord_payment_expense_requests.company_id
          and u.office_id = landlord_payment_expense_requests.office_id
    )
);
