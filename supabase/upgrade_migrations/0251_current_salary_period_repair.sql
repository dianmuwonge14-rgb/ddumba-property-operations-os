-- Salary linkage repair: configured active employees should have a current salary-period row.
-- This never invents a salary. It only materialises the current period from an active payroll profile.

insert into public.employee_payroll_months (
  company_id,
  office_id,
  employee_id,
  month_key,
  salary_month,
  basic_salary,
  gross_salary,
  allowances,
  deductions,
  net_salary,
  final_salary_payable,
  amount_paid,
  remaining_balance,
  due_date,
  payment_status,
  status,
  active,
  updated_at
)
select
  pp.company_id,
  coalesce(pp.office_id, e.office_id),
  e.id,
  date_trunc('month', now() at time zone 'Africa/Kampala')::date,
  date_trunc('month', now() at time zone 'Africa/Kampala')::date,
  coalesce(pp.base_salary, 0),
  coalesce(pp.base_salary, 0) + coalesce(pp.allowances, 0),
  coalesce(pp.allowances, 0),
  coalesce(pp.deductions, 0),
  greatest(0, coalesce(pp.base_salary, 0) + coalesce(pp.allowances, 0) - coalesce(pp.deductions, 0)),
  greatest(0, coalesce(pp.base_salary, 0) + coalesce(pp.allowances, 0) - coalesce(pp.deductions, 0)),
  0,
  greatest(0, coalesce(pp.base_salary, 0) + coalesce(pp.allowances, 0) - coalesce(pp.deductions, 0)),
  (
    date_trunc('month', now() at time zone 'Africa/Kampala')::date
    + (
      least(
        coalesce(pp.salary_payment_day, e.salary_payment_day, e.salary_receiving_day, 1),
        extract(day from (date_trunc('month', now() at time zone 'Africa/Kampala') + interval '1 month - 1 day'))::int
      ) - 1
    ) * interval '1 day'
  )::date,
  'pending_payment',
  'pending_payment',
  true,
  now()
from public.payroll_profiles pp
join public.employees e
  on e.id = pp.employee_id
 and e.company_id = pp.company_id
where coalesce(pp.active, true)
  and coalesce(pp.base_salary, 0) > 0
  and public.ddumba_is_genuine_payroll_employee(e.id)
  and lower(coalesce(e.status, 'active')) not in ('archived', 'deleted', 'inactive', 'terminated')
  and not exists (
    select 1
    from public.employee_payroll_months pm
    where pm.company_id = pp.company_id
      and pm.employee_id = pp.employee_id
      and pm.month_key = date_trunc('month', now() at time zone 'Africa/Kampala')::date
      and coalesce(pm.active, true)
  );

create index if not exists idx_employee_payroll_months_current_lookup
  on public.employee_payroll_months(company_id, employee_id, month_key)
  where coalesce(active, true);
