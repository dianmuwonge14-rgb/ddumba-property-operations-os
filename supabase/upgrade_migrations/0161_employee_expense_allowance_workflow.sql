-- Employee expense allowance workflow for expense-entry routing.
-- Additive only: no existing employee, expense, payroll, or finance records are removed.

alter table public.employees
    add column if not exists is_field_agent boolean not null default false;

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
    recorded_by_office boolean not null default false,
    approved_for_payroll boolean not null default true,
    expense_source text not null default 'admin',
    reviewed_by uuid references public.users(id) on delete set null,
    reviewed_at timestamptz,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.employee_expenses
    add column if not exists recorded_by_office boolean not null default false,
    add column if not exists approved_for_payroll boolean not null default true,
    add column if not exists expense_source text not null default 'admin',
    add column if not exists reviewed_by uuid references public.users(id) on delete set null,
    add column if not exists reviewed_at timestamptz;

create table if not exists public.employee_expense_allowances (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid references public.employees(id) on delete cascade,
    role_key text,
    expense_item_key text not null,
    expense_item_name text not null,
    period_month date not null,
    allowance_amount numeric(14,2) not null default 0 check (allowance_amount >= 0),
    treatment text not null default 'company_expense' check (treatment in ('company_expense','employee_personal_expense')),
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_expense_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    allowance_id uuid references public.employee_expense_allowances(id) on delete set null,
    expense_id uuid references public.expenses(id) on delete set null,
    employee_expense_id uuid references public.employee_expenses(id) on delete set null,
    approved_expense_id uuid references public.expenses(id) on delete set null,
    approved_employee_expense_id uuid references public.employee_expenses(id) on delete set null,
    requested_item_key text not null,
    requested_item_name text not null,
    expense_date date not null default current_date,
    month_key date not null,
    requested_amount numeric(14,2) not null default 0 check (requested_amount >= 0),
    allowed_amount numeric(14,2) not null default 0 check (allowed_amount >= 0),
    already_spent_amount numeric(14,2) not null default 0 check (already_spent_amount >= 0),
    pending_amount numeric(14,2) not null default 0 check (pending_amount >= 0),
    remaining_allowance_before numeric(14,2) not null default 0,
    extra_amount numeric(14,2) not null default 0 check (extra_amount >= 0),
    note text,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    requested_by uuid references public.users(id) on delete set null,
    reviewed_by uuid references public.users(id) on delete set null,
    reviewed_at timestamptz,
    approved_at timestamptz,
    rejected_at timestamptz,
    admin_comment text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_employee_expense_allowances_scope
    on public.employee_expense_allowances(company_id, office_id, employee_id, expense_item_key, period_month, active);

create index if not exists idx_employee_expense_allowances_role
    on public.employee_expense_allowances(company_id, office_id, role_key, expense_item_key, period_month, active);

create index if not exists idx_employee_expense_requests_scope
    on public.employee_expense_requests(company_id, office_id, employee_id, status, active, created_at desc);

create index if not exists idx_employee_expenses_item_period
    on public.employee_expenses(company_id, office_id, employee_id, category, month_key, active);

alter table public.employee_expense_allowances enable row level security;
alter table public.employee_expense_requests enable row level security;
alter table public.employee_expenses enable row level security;

drop policy if exists employee_expenses_admin_all on public.employee_expenses;
create policy employee_expenses_admin_all
on public.employee_expenses
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        employee_expenses.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        employee_expenses.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists employee_expenses_office_read_insert on public.employee_expenses;
create policy employee_expenses_office_read_insert
on public.employee_expenses
for all
using (
    employee_expenses.company_id = public.ddumba_v1_current_company_id()
    and employee_expenses.office_id is not null
    and public.ddumba_v1_can_access_office(employee_expenses.office_id)
)
with check (
    employee_expenses.company_id = public.ddumba_v1_current_company_id()
    and employee_expenses.office_id is not null
    and public.ddumba_v1_can_access_office(employee_expenses.office_id)
    and employee_expenses.recorded_by_office = true
);

drop policy if exists employee_expense_allowances_admin_all on public.employee_expense_allowances;
create policy employee_expense_allowances_admin_all
on public.employee_expense_allowances
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        employee_expense_allowances.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        employee_expense_allowances.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists employee_expense_allowances_office_read on public.employee_expense_allowances;
create policy employee_expense_allowances_office_read
on public.employee_expense_allowances
for select
using (
    employee_expense_allowances.company_id = public.ddumba_v1_current_company_id()
    and (
        employee_expense_allowances.office_id is null
        or public.ddumba_v1_can_access_office(employee_expense_allowances.office_id)
    )
);

drop policy if exists employee_expense_requests_admin_all on public.employee_expense_requests;
create policy employee_expense_requests_admin_all
on public.employee_expense_requests
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        employee_expense_requests.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        employee_expense_requests.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists employee_expense_requests_office_read_insert on public.employee_expense_requests;
create policy employee_expense_requests_office_read_insert
on public.employee_expense_requests
for all
using (
    employee_expense_requests.company_id = public.ddumba_v1_current_company_id()
    and employee_expense_requests.office_id is not null
    and public.ddumba_v1_can_access_office(employee_expense_requests.office_id)
)
with check (
    employee_expense_requests.company_id = public.ddumba_v1_current_company_id()
    and employee_expense_requests.office_id is not null
    and public.ddumba_v1_can_access_office(employee_expense_requests.office_id)
    and employee_expense_requests.status = 'pending'
);
