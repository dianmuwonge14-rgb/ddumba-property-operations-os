-- Phase 145: Employee Management Centre rule corrections.
-- Additive only. No employee, landlord, room, or finance history is removed.

alter table public.employees
    add column if not exists probation_start_date date,
    add column if not exists probation_end_date date,
    add column if not exists probation_salary numeric(14,2) not null default 0,
    add column if not exists normal_salary_after_probation numeric(14,2) not null default 0,
    add column if not exists probation_status text not null default 'not_started',
    add column if not exists is_field_agent boolean not null default false,
    add column if not exists primary_office_id uuid references public.offices(id) on delete set null;

alter table public.employee_expenses
    add column if not exists recorded_by_office boolean not null default false,
    add column if not exists approved_for_payroll boolean not null default true,
    add column if not exists expense_source text not null default 'admin',
    add column if not exists reviewed_by uuid references public.users(id) on delete set null,
    add column if not exists reviewed_at timestamptz;

create table if not exists public.employee_advance_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    amount numeric(14,2) not null check (amount > 0),
    reason text not null,
    request_date date not null default current_date,
    status text not null default 'pending',
    requested_by uuid references public.users(id) on delete set null,
    decided_by uuid references public.users(id) on delete set null,
    decided_at timestamptz,
    admin_comment text,
    approved_advance_id uuid references public.employee_advances(id) on delete set null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_off_day_balances (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    monthly_entitlement int not null default 4,
    carried_forward int not null default 0,
    used_days int not null default 0,
    available_days int not null default 4,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, employee_id, month_key)
);

create table if not exists public.employee_off_day_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    start_date date not null,
    end_date date not null,
    requested_days int not null check (requested_days > 0 and requested_days <= 7),
    reason text,
    is_long_leave boolean not null default false,
    submitted_at timestamptz not null default now(),
    status text not null default 'pending',
    requested_by uuid references public.users(id) on delete set null,
    decided_by uuid references public.users(id) on delete set null,
    decided_at timestamptz,
    admin_comment text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_field_agent_assignments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    employee_id uuid not null references public.employees(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    assignment_type text not null default 'active',
    effective_from date not null default current_date,
    effective_to date,
    reason text,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, employee_id, office_id, assignment_type, effective_from)
);

create index if not exists idx_employee_advance_requests_scope on public.employee_advance_requests(company_id, office_id, employee_id, status, active);
create index if not exists idx_employee_off_day_requests_scope on public.employee_off_day_requests(company_id, office_id, employee_id, status, active);
create index if not exists idx_employee_off_day_balances_scope on public.employee_off_day_balances(company_id, office_id, employee_id, month_key, active);
create index if not exists idx_employee_field_agent_assignments_scope on public.employee_field_agent_assignments(company_id, office_id, employee_id, active);
create index if not exists idx_employees_probation on public.employees(company_id, office_id, probation_status, probation_end_date);
create index if not exists idx_employees_field_agents on public.employees(company_id, is_field_agent, status);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'employee_advance_requests',
        'employee_off_day_balances',
        'employee_off_day_requests',
        'employee_field_agent_assignments'
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

drop policy if exists employee_expenses_office_insert on public.employee_expenses;
create policy employee_expenses_office_insert on public.employee_expenses
for insert with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and office_id is not null
        and public.ddumba_v1_can_access_office(office_id)
        and recorded_by_office = true
        and expense_source = 'office'
    )
);

drop policy if exists employee_advance_requests_office_insert on public.employee_advance_requests;
create policy employee_advance_requests_office_insert on public.employee_advance_requests
for insert with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and office_id is not null
        and public.ddumba_v1_can_access_office(office_id)
        and status = 'pending'
    )
);

drop policy if exists employee_off_day_requests_office_insert on public.employee_off_day_requests;
create policy employee_off_day_requests_office_insert on public.employee_off_day_requests
for insert with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and office_id is not null
        and public.ddumba_v1_can_access_office(office_id)
        and status = 'pending'
    )
);
