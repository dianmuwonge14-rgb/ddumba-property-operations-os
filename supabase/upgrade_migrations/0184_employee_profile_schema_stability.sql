-- Employee Management schema stability.
-- Additive only: keeps Employee profiles alive when optional HR/payroll fields are used by the app.

alter table public.employees
    add column if not exists age integer,
    add column if not exists advance_deduction_rule text not null default 'deduct_current_salary',
    add column if not exists daily_lunch_allowance numeric(14,2) not null default 0 check (daily_lunch_allowance >= 0),
    add column if not exists salary_payment_day integer,
    add column if not exists probation_status text not null default 'not_started',
    add column if not exists normal_salary_after_probation numeric(14,2) not null default 0;

update public.employees
set salary_payment_day = coalesce(salary_payment_day, salary_receiving_day, 28)
where salary_payment_day is null;

alter table public.employees
    alter column salary_payment_day set default 28;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'employees_age_check'
          and conrelid = 'public.employees'::regclass
    ) then
        alter table public.employees
            add constraint employees_age_check check (age is null or (age between 14 and 100));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'employees_salary_payment_day_check'
          and conrelid = 'public.employees'::regclass
    ) then
        alter table public.employees
            add constraint employees_salary_payment_day_check check (salary_payment_day between 1 and 31);
    end if;
end $$;

create table if not exists public.employee_references (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    full_name text not null,
    relationship text,
    phone text,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_advances (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    amount numeric(14,2) not null default 0,
    remaining_balance numeric(14,2) not null default 0,
    reason text,
    status text not null default 'approved',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_fines (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    amount numeric(14,2) not null default 0,
    reason text,
    fine_date date not null default current_date,
    status text not null default 'active',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_employee_references_employee
    on public.employee_references(company_id, employee_id, active);

create index if not exists idx_employee_advances_month
    on public.employee_advances(company_id, office_id, employee_id, month_key, active);

create index if not exists idx_employee_fines_month
    on public.employee_fines(company_id, office_id, employee_id, month_key, active);

alter table public.employee_references enable row level security;
alter table public.employee_advances enable row level security;
alter table public.employee_fines enable row level security;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'employee_references',
        'employee_advances',
        'employee_fines'
    ] loop
        execute format('drop policy if exists %I_admin_all on public.%I', table_name, table_name);
        execute format(
            'create policy %I_admin_all on public.%I for all using (
                public.ddumba_v1_is_service_role()
                or (%I.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
            ) with check (
                public.ddumba_v1_is_service_role()
                or (%I.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
            )',
            table_name,
            table_name,
            table_name,
            table_name
        );

        execute format('drop policy if exists %I_office_read on public.%I', table_name, table_name);
        execute format(
            'create policy %I_office_read on public.%I for select using (
                %I.company_id = public.ddumba_v1_current_company_id()
                and (%I.office_id is null or public.ddumba_v1_can_access_office(%I.office_id))
            )',
            table_name,
            table_name,
            table_name,
            table_name,
            table_name
        );
    end loop;
end $$;
