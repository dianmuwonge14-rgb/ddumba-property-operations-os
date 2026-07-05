-- Phase 144: Admin Employee Management Centre.
-- Additive only. No landlord finance logic, office records, or existing employee history is removed.

alter table public.employees
    add column if not exists age int,
    add column if not exists employee_code text,
    add column if not exists phone text,
    add column if not exists email text,
    add column if not exists role_id uuid references public.roles(id) on delete set null,
    add column if not exists role_name text,
    add column if not exists hire_date date,
    add column if not exists basic_salary numeric(14,2) not null default 0,
    add column if not exists salary_receiving_day int default 28 check (salary_receiving_day between 1 and 31),
    add column if not exists salary_receiving_date date,
    add column if not exists off_days text[] not null default '{}',
    add column if not exists status text not null default 'active',
    add column if not exists termination_date date,
    add column if not exists notes text,
    add column if not exists cv_document_id uuid,
    add column if not exists signed_contract_document_id uuid,
    add column if not exists created_by uuid references public.users(id) on delete set null,
    add column if not exists updated_at timestamptz not null default now();

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

create table if not exists public.employee_office_assignments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    employee_id uuid not null references public.employees(id) on delete cascade,
    from_office_id uuid references public.offices(id) on delete set null,
    to_office_id uuid references public.offices(id) on delete set null,
    effective_date date not null default current_date,
    reason text,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.employee_role_assignments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    from_role_id uuid references public.roles(id) on delete set null,
    to_role_id uuid references public.roles(id) on delete set null,
    role_name text,
    effective_date date not null default current_date,
    reason text,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.employee_off_days (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    day_of_week text not null,
    effective_from date not null default current_date,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_expenses (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    amount numeric(14,2) not null check (amount >= 0),
    category text,
    note text,
    expense_date date not null default current_date,
    status text not null default 'active',
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
    amount numeric(14,2) not null check (amount >= 0),
    amount_deducted numeric(14,2) not null default 0,
    remaining_balance numeric(14,2) not null default 0,
    reason text,
    advance_date date not null default current_date,
    status text not null default 'pending',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_bonuses (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    amount numeric(14,2) not null check (amount >= 0),
    reason text,
    bonus_date date not null default current_date,
    status text not null default 'active',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_fines (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    attendance_event_id uuid references public.attendance_events(id) on delete set null,
    month_key date not null,
    amount numeric(14,2) not null check (amount >= 0),
    reason text not null,
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

create table if not exists public.employee_documents (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    document_type text not null,
    file_name text not null,
    file_path text,
    file_url text,
    notes text,
    active boolean not null default true,
    uploaded_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.employee_contracts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    role_id uuid references public.roles(id) on delete set null,
    contract_text text not null,
    status text not null default 'draft',
    generated_by uuid references public.users(id) on delete set null,
    signed_document_id uuid references public.employee_documents(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_termination_records (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    termination_date date not null default current_date,
    reason text not null,
    disable_access boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.employee_performance_scores (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    score numeric(6,2) not null default 0,
    attendance_punctuality numeric(6,2) not null default 0,
    days_present int not null default 0,
    collections_handled int not null default 0,
    promises_followed int not null default 0,
    reports_submitted int not null default 0,
    fines_count int not null default 0,
    warnings_count int not null default 0,
    office_manager_score numeric(6,2) not null default 0,
    task_completion numeric(6,2) not null default 0,
    strengths text,
    issues text,
    ai_recommendation text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, employee_id, month_key)
);

create index if not exists idx_employee_refs_employee on public.employee_references(company_id, employee_id, active);
create index if not exists idx_employee_expenses_month on public.employee_expenses(company_id, office_id, employee_id, month_key, active);
create index if not exists idx_employee_advances_month on public.employee_advances(company_id, office_id, employee_id, month_key, active);
create index if not exists idx_employee_bonuses_month on public.employee_bonuses(company_id, office_id, employee_id, month_key, active);
create index if not exists idx_employee_fines_month on public.employee_fines(company_id, office_id, employee_id, month_key, active);
create index if not exists idx_employee_payroll_months_scope on public.employee_payroll_months(company_id, office_id, month_key, status);
create index if not exists idx_employee_salary_payments_month on public.employee_salary_payments(company_id, office_id, month_key, paid_at desc);
create index if not exists idx_employee_documents_employee on public.employee_documents(company_id, employee_id, document_type, active);
create index if not exists idx_employee_contracts_employee on public.employee_contracts(company_id, employee_id, status);
create index if not exists idx_employee_performance_scores_rank on public.employee_performance_scores(company_id, office_id, month_key, score desc);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'employee_references',
        'employee_office_assignments',
        'employee_role_assignments',
        'employee_off_days',
        'employee_expenses',
        'employee_advances',
        'employee_bonuses',
        'employee_fines',
        'employee_payroll_months',
        'employee_salary_payments',
        'employee_documents',
        'employee_contracts',
        'employee_termination_records',
        'employee_performance_scores'
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
