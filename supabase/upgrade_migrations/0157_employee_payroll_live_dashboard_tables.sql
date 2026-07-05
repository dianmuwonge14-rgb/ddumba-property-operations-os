-- Phase 157: Ensure Monthly Profit Intelligence payroll tables exist.
-- Additive only. This does not reset, delete, or overwrite business data.

create table if not exists public.employee_fines (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    attendance_event_id uuid references public.attendance_events(id) on delete set null,
    month_key date not null,
    amount numeric(14,2) not null check (amount >= 0),
    reason text not null default 'Fine',
    fine_type text not null default 'custom',
    fine_date date not null default current_date,
    status text not null default 'active',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_payroll_months (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    basic_salary numeric(14,2) not null default 0,
    bonuses numeric(14,2) not null default 0,
    personal_expenses numeric(14,2) not null default 0,
    advances numeric(14,2) not null default 0,
    fines numeric(14,2) not null default 0,
    final_salary_payable numeric(14,2) not null default 0,
    amount_paid numeric(14,2) not null default 0,
    status text not null default 'unpaid',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, employee_id, month_key)
);

create table if not exists public.employee_salary_payments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    payroll_month_id uuid references public.employee_payroll_months(id) on delete set null,
    month_key date not null,
    paid_amount numeric(14,2) not null check (paid_amount >= 0),
    payment_method text,
    reference text,
    paid_by uuid references public.users(id) on delete set null,
    paid_at timestamptz not null default now(),
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_employee_fines_month
    on public.employee_fines(company_id, office_id, employee_id, month_key, active);

create index if not exists idx_employee_payroll_months_scope
    on public.employee_payroll_months(company_id, office_id, month_key, status);

create index if not exists idx_employee_salary_payments_month
    on public.employee_salary_payments(company_id, office_id, month_key, paid_at desc);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'employee_fines',
        'employee_payroll_months',
        'employee_salary_payments'
    ]
    loop
        execute format('alter table public.%I enable row level security', table_name);

        execute format('drop policy if exists %I_admin_read on public.%I', table_name, table_name);
        execute format(
            'create policy %I_admin_read on public.%I for select using (
                public.ddumba_v1_is_service_role()
                or (
                    company_id = public.ddumba_v1_current_company_id()
                    and (
                        public.ddumba_v1_is_company_admin()
                        or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
                    )
                )
            )',
            table_name,
            table_name
        );

        execute format('drop policy if exists %I_admin_write on public.%I', table_name, table_name);
        execute format(
            'create policy %I_admin_write on public.%I for all using (
                public.ddumba_v1_is_service_role()
                or (
                    company_id = public.ddumba_v1_current_company_id()
                    and public.ddumba_v1_is_company_admin()
                )
            ) with check (
                public.ddumba_v1_is_service_role()
                or (
                    company_id = public.ddumba_v1_current_company_id()
                    and public.ddumba_v1_is_company_admin()
                )
            )',
            table_name,
            table_name
        );
    end loop;
end $$;
