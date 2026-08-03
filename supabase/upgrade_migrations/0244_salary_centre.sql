-- Phase 244: Salary Centre for personal employee accounts.
-- Additive only. Existing salary, employee, and payment records are preserved.

alter table public.employees
    add column if not exists salary_payment_day integer,
    add column if not exists salary_receiving_day integer,
    add column if not exists salary_type text default 'monthly',
    add column if not exists salary_effective_start_date date,
    add column if not exists salary_payment_method text;

update public.employees
set salary_payment_day = coalesce(salary_payment_day, salary_receiving_day, 1),
    salary_receiving_day = coalesce(salary_receiving_day, salary_payment_day, 1)
where salary_payment_day is null
   or salary_receiving_day is null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'employees_salary_payment_day_range'
          and conrelid = 'public.employees'::regclass
    ) then
        alter table public.employees
            add constraint employees_salary_payment_day_range
            check (salary_payment_day is null or salary_payment_day between 1 and 31) not valid;
    end if;
end $$;

alter table public.payroll_profiles
    add column if not exists office_id uuid references public.offices(id) on delete set null,
    add column if not exists salary_payment_day integer,
    add column if not exists effective_start_date date,
    add column if not exists allowances numeric(14,2) not null default 0,
    add column if not exists deductions numeric(14,2) not null default 0,
    add column if not exists bank_or_mobile_money_details jsonb not null default '{}',
    add column if not exists created_by uuid references public.users(id) on delete set null,
    add column if not exists updated_by uuid references public.users(id) on delete set null;

update public.payroll_profiles p
set salary_payment_day = coalesce(p.salary_payment_day, e.salary_payment_day, e.salary_receiving_day, 1),
    office_id = coalesce(p.office_id, e.office_id)
from public.employees e
where e.id = p.employee_id
  and (p.salary_payment_day is null or p.office_id is null);

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'payroll_profiles_salary_payment_day_range'
          and conrelid = 'public.payroll_profiles'::regclass
    ) then
        alter table public.payroll_profiles
            add constraint payroll_profiles_salary_payment_day_range
            check (salary_payment_day is null or salary_payment_day between 1 and 31) not valid;
    end if;
end $$;

alter table public.employee_payroll_months
    add column if not exists salary_month date,
    add column if not exists gross_salary numeric(14,2) not null default 0,
    add column if not exists allowances numeric(14,2) not null default 0,
    add column if not exists deductions numeric(14,2) not null default 0,
    add column if not exists net_salary numeric(14,2) not null default 0,
    add column if not exists remaining_balance numeric(14,2) not null default 0,
    add column if not exists due_date date,
    add column if not exists payment_status text,
    add column if not exists paid_at timestamptz,
    add column if not exists payment_method text,
    add column if not exists payment_reference text,
    add column if not exists recorded_by uuid references public.users(id) on delete set null,
    add column if not exists approved_by uuid references public.users(id) on delete set null,
    add column if not exists notes text;

update public.employee_payroll_months pm
set salary_month = coalesce(pm.salary_month, pm.month_key),
    gross_salary = case when pm.gross_salary = 0 then coalesce(pm.basic_salary, 0) else pm.gross_salary end,
    allowances = case when pm.allowances = 0 then coalesce(pm.bonuses, 0) else pm.allowances end,
    deductions = case when pm.deductions = 0 then coalesce(pm.personal_expenses, 0) + coalesce(pm.advances, 0) + coalesce(pm.fines, 0) else pm.deductions end,
    net_salary = case when pm.net_salary = 0 then coalesce(pm.final_salary_payable, 0) else pm.net_salary end,
    remaining_balance = greatest(0, coalesce(pm.final_salary_payable, pm.net_salary, 0) - coalesce(pm.amount_paid, 0)),
    payment_status = coalesce(pm.payment_status, pm.status),
    due_date = coalesce(
        pm.due_date,
        (date_trunc('month', pm.month_key)::date
          + (least(coalesce(e.salary_payment_day, e.salary_receiving_day, 1), extract(day from (date_trunc('month', pm.month_key) + interval '1 month - 1 day'))::int) - 1) * interval '1 day')::date
    )
from public.employees e
where e.id = pm.employee_id;

alter table public.employee_salary_payments
    add column if not exists salary_month date,
    add column if not exists approved_by uuid references public.users(id) on delete set null,
    add column if not exists remaining_balance_after numeric(14,2),
    add column if not exists reversed_at timestamptz,
    add column if not exists reversed_by uuid references public.users(id) on delete set null,
    add column if not exists reversal_reason text;

update public.employee_salary_payments
set salary_month = coalesce(salary_month, month_key)
where salary_month is null;

create index if not exists idx_employees_salary_personal_account
    on public.employees(company_id, user_id, status)
    where user_id is not null;

create index if not exists idx_payroll_profiles_employee_active
    on public.payroll_profiles(company_id, employee_id, active);

create index if not exists idx_employee_payroll_months_employee_period
    on public.employee_payroll_months(company_id, employee_id, month_key, payment_status);

create index if not exists idx_employee_salary_payments_employee_period
    on public.employee_salary_payments(company_id, employee_id, month_key, paid_at desc);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'payroll_profiles',
        'employee_payroll_months',
        'employee_salary_payments'
    ]
    loop
        execute format('alter table public.%I enable row level security', table_name);

        execute format('drop policy if exists %I_salary_centre_select on public.%I', table_name, table_name);
        execute format(
            'create policy %I_salary_centre_select on public.%I for select using (
                public.ddumba_v1_is_service_role()
                or (
                    company_id = public.ddumba_v1_current_company_id()
                    and (
                        public.ddumba_v1_is_company_admin()
                        or employee_id in (
                            select e.id from public.employees e
                            where e.company_id = public.ddumba_v1_current_company_id()
                              and e.user_id = auth.uid()
                              and coalesce(e.status, ''active'') not in (''terminated'', ''inactive'', ''archived'')
                        )
                    )
                )
            )',
            table_name,
            table_name
        );

        execute format('drop policy if exists %I_salary_centre_admin_write on public.%I', table_name, table_name);
        execute format(
            'create policy %I_salary_centre_admin_write on public.%I for all using (
                public.ddumba_v1_is_service_role()
                or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
            ) with check (
                public.ddumba_v1_is_service_role()
                or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
            )',
            table_name,
            table_name
        );
    end loop;
end $$;
