-- Employee lunch allowance, carry-forward balance, advance review, and salary impact.
-- Additive only: preserves existing employees, expenses, attendance, payroll, and audit records.

alter table public.employees
    add column if not exists daily_lunch_allowance numeric(14,2) not null default 0 check (daily_lunch_allowance >= 0),
    add column if not exists advance_deduction_rule text not null default 'deduct_current_salary',
    add column if not exists salary_payment_day integer;

update public.employees
set salary_payment_day = coalesce(salary_payment_day, salary_receiving_day, 28)
where salary_payment_day is null;

create table if not exists public.employee_allowance_settings (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    daily_lunch_allowance numeric(14,2) not null default 0 check (daily_lunch_allowance >= 0),
    salary_payment_day integer not null default 28 check (salary_payment_day between 1 and 31),
    basic_salary numeric(14,2) not null default 0 check (basic_salary >= 0),
    advance_deduction_rule text not null default 'deduct_current_salary',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    updated_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_employee_allowance_settings_one_active
    on public.employee_allowance_settings(company_id, employee_id)
    where active = true;

create table if not exists public.employee_lunch_ledger (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    ledger_date date not null,
    month_key date not null,
    entry_type text not null check (entry_type in ('earned','taken','carry_forward','salary_payout','adjustment','voided')),
    earned_amount numeric(14,2) not null default 0,
    taken_amount numeric(14,2) not null default 0,
    balance_after numeric(14,2) not null default 0,
    employee_expense_id uuid references public.employee_expenses(id) on delete set null,
    expense_id uuid references public.expenses(id) on delete set null,
    source text not null default 'system',
    note text,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_employee_lunch_ledger_one_earned_day
    on public.employee_lunch_ledger(company_id, employee_id, ledger_date, entry_type)
    where active = true and entry_type = 'earned';

create index if not exists idx_employee_lunch_ledger_scope
    on public.employee_lunch_ledger(company_id, office_id, employee_id, month_key, ledger_date, active);

alter table public.employee_expense_requests
    add column if not exists converted_to_advance boolean not null default false,
    add column if not exists approved_advance_id uuid references public.employee_advances(id) on delete set null;

create table if not exists public.employee_salary_adjustments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    adjustment_type text not null check (adjustment_type in ('unused_lunch_allowance','advance_deduction','fine','bonus','manual')),
    amount numeric(14,2) not null default 0,
    direction text not null default 'add' check (direction in ('add','deduct')),
    source_table text,
    source_id uuid,
    note text,
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_employee_salary_adjustments_scope
    on public.employee_salary_adjustments(company_id, office_id, employee_id, month_key, adjustment_type, active);

alter table public.employee_payroll_months
    add column if not exists lunch_allowance_earned numeric(14,2) not null default 0,
    add column if not exists lunch_money_taken numeric(14,2) not null default 0,
    add column if not exists unused_lunch_balance numeric(14,2) not null default 0;

alter table public.employee_allowance_settings enable row level security;
alter table public.employee_lunch_ledger enable row level security;
alter table public.employee_salary_adjustments enable row level security;

drop policy if exists employee_allowance_settings_admin_all on public.employee_allowance_settings;
create policy employee_allowance_settings_admin_all
on public.employee_allowance_settings
for all
using (
    public.ddumba_v1_is_service_role()
    or (employee_allowance_settings.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
)
with check (
    public.ddumba_v1_is_service_role()
    or (employee_allowance_settings.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
);

drop policy if exists employee_allowance_settings_office_read on public.employee_allowance_settings;
create policy employee_allowance_settings_office_read
on public.employee_allowance_settings
for select
using (
    employee_allowance_settings.company_id = public.ddumba_v1_current_company_id()
    and employee_allowance_settings.office_id is not null
    and public.ddumba_v1_can_access_office(employee_allowance_settings.office_id)
);

drop policy if exists employee_lunch_ledger_admin_all on public.employee_lunch_ledger;
create policy employee_lunch_ledger_admin_all
on public.employee_lunch_ledger
for all
using (
    public.ddumba_v1_is_service_role()
    or (employee_lunch_ledger.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
)
with check (
    public.ddumba_v1_is_service_role()
    or (employee_lunch_ledger.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
);

drop policy if exists employee_lunch_ledger_office_read_insert on public.employee_lunch_ledger;
create policy employee_lunch_ledger_office_read_insert
on public.employee_lunch_ledger
for all
using (
    employee_lunch_ledger.company_id = public.ddumba_v1_current_company_id()
    and employee_lunch_ledger.office_id is not null
    and public.ddumba_v1_can_access_office(employee_lunch_ledger.office_id)
)
with check (
    employee_lunch_ledger.company_id = public.ddumba_v1_current_company_id()
    and employee_lunch_ledger.office_id is not null
    and public.ddumba_v1_can_access_office(employee_lunch_ledger.office_id)
);

drop policy if exists employee_salary_adjustments_admin_all on public.employee_salary_adjustments;
create policy employee_salary_adjustments_admin_all
on public.employee_salary_adjustments
for all
using (
    public.ddumba_v1_is_service_role()
    or (employee_salary_adjustments.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
)
with check (
    public.ddumba_v1_is_service_role()
    or (employee_salary_adjustments.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
);

drop policy if exists employee_salary_adjustments_office_read on public.employee_salary_adjustments;
create policy employee_salary_adjustments_office_read
on public.employee_salary_adjustments
for select
using (
    employee_salary_adjustments.company_id = public.ddumba_v1_current_company_id()
    and employee_salary_adjustments.office_id is not null
    and public.ddumba_v1_can_access_office(employee_salary_adjustments.office_id)
);
