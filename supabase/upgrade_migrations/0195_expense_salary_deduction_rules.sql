-- 0195_expense_salary_deduction_rules.sql
-- Make salary deduction explicit for employee expenses.
-- Business rule: Lunch, field facilitation, fuel, airtime, and all defined
-- expense categories are company expenses. Only "Other/Others" employee
-- expenses are deductible from salary.

alter table if exists public.employee_expense_allowances
    add column if not exists salary_deductible boolean not null default false;

alter table if exists public.employee_expenses
    add column if not exists salary_deductible boolean not null default false;

update public.employee_expense_allowances
set
    salary_deductible = case
        when lower(regexp_replace(coalesce(expense_item_key, ''), '[^a-z0-9]+', '_', 'g')) in ('other', 'others') then true
        else false
    end,
    treatment = case
        when lower(regexp_replace(coalesce(expense_item_key, ''), '[^a-z0-9]+', '_', 'g')) in ('other', 'others') then 'employee_personal_expense'
        else 'company_expense'
    end
where expense_item_key is not null;

update public.employee_expenses
set
    salary_deductible = case
        when lower(regexp_replace(coalesce(category, ''), '[^a-z0-9]+', '_', 'g')) in ('other', 'others') then true
        else false
    end,
    approved_for_payroll = case
        when lower(regexp_replace(coalesce(category, ''), '[^a-z0-9]+', '_', 'g')) in ('other', 'others') then approved_for_payroll
        else false
    end
where category is not null;

comment on column public.employee_expense_allowances.salary_deductible is
    'True only for Other/Others employee expenses. Lunch, field facilitation, fuel, airtime, and other defined categories are not deducted from salary.';

comment on column public.employee_expenses.salary_deductible is
    'True only when the approved employee expense should deduct from payroll salary.';
