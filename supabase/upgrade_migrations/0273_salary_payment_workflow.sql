create table if not exists public.employee_salary_payment_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    employee_id uuid not null references public.employees(id) on delete cascade,
    payroll_office_id uuid references public.offices(id) on delete set null,
    requesting_office_id uuid references public.offices(id) on delete set null,
    month_key date not null,
    salary_due_date date,
    monthly_salary numeric(14,2) not null default 0,
    already_paid numeric(14,2) not null default 0,
    eligible_salary numeric(14,2) not null default 0,
    requested_amount numeric(14,2) not null check (requested_amount > 0),
    salary_amount numeric(14,2) not null default 0,
    advance_amount numeric(14,2) not null default 0,
    payment_method text not null default 'cash',
    reference text,
    notes text,
    supporting_document jsonb,
    proof_url text,
    status text not null default 'pending',
    requested_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    rejected_by uuid references public.users(id) on delete set null,
    rejected_at timestamptz,
    admin_comment text,
    payroll_month_id uuid references public.employee_payroll_months(id) on delete set null,
    salary_payment_id uuid references public.employee_salary_payments(id) on delete set null,
    salary_expense_id uuid references public.expenses(id) on delete set null,
    advance_id uuid references public.employee_advances(id) on delete set null,
    advance_expense_id uuid references public.expenses(id) on delete set null,
    audit_reference text not null default ('SAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_employee_salary_payment_requests_company_status
    on public.employee_salary_payment_requests(company_id, status, created_at desc);

create index if not exists idx_employee_salary_payment_requests_employee_month
    on public.employee_salary_payment_requests(company_id, employee_id, month_key, status);

create unique index if not exists idx_employee_salary_payment_requests_one_pending_period
    on public.employee_salary_payment_requests(company_id, employee_id, month_key)
    where active = true and status = 'pending';

alter table public.employee_salary_payment_requests enable row level security;

drop policy if exists employee_salary_payment_requests_admin_all on public.employee_salary_payment_requests;
create policy employee_salary_payment_requests_admin_all
on public.employee_salary_payment_requests
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

drop policy if exists employee_salary_payment_requests_office_read on public.employee_salary_payment_requests;
create policy employee_salary_payment_requests_office_read
on public.employee_salary_payment_requests
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or (requesting_office_id is not null and public.ddumba_v1_can_access_office(requesting_office_id))
        )
    )
);

drop policy if exists employee_salary_payment_requests_office_insert on public.employee_salary_payment_requests;
create policy employee_salary_payment_requests_office_insert
on public.employee_salary_payment_requests
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or (requesting_office_id is not null and public.ddumba_v1_can_access_office(requesting_office_id))
        )
    )
);
