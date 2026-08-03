-- Personal Salary Centre linkage repair.
-- Personal login accounts should resolve payroll through one genuine employee_id.

alter table public.users
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_users_employee_profile_link
  on public.users(company_id, employee_id)
  where employee_id is not null;

with candidate_links as (
  select
    u.id as user_id,
    e.id as employee_id
  from public.users u
  join public.employees e
    on e.company_id = u.company_id
   and public.ddumba_is_genuine_payroll_employee(e.id)
   and coalesce(e.user_id, u.id) = u.id
   and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') <> ''
   and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(u.phone, ''), '\D', '', 'g')
   and lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = lower(regexp_replace(coalesce(u.full_name, ''), '\s+', ' ', 'g'))
  where u.employee_id is null
    and e.user_id is null
    and lower(coalesce(u.account_type, '')) not in ('office', 'office_workspace', 'service', 'system', 'shared')
    and not exists (
      select 1
      from public.employees other_e
      where other_e.company_id = e.company_id
        and other_e.id <> e.id
        and public.ddumba_is_genuine_payroll_employee(other_e.id)
        and regexp_replace(coalesce(other_e.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(e.phone, ''), '\D', '', 'g')
    )
    and not exists (
      select 1
      from public.users other_u
      where other_u.company_id = u.company_id
        and other_u.id <> u.id
        and regexp_replace(coalesce(other_u.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(u.phone, ''), '\D', '', 'g')
        and lower(coalesce(other_u.account_type, '')) not in ('office', 'office_workspace', 'service', 'system', 'shared')
    )
)
update public.users u
set employee_id = c.employee_id,
    updated_at = now()
from candidate_links c
where u.id = c.user_id;

update public.users u
set employee_id = e.id,
    updated_at = now()
from public.employees e
where e.user_id = u.id
  and e.company_id = u.company_id
  and public.ddumba_is_genuine_payroll_employee(e.id)
  and u.employee_id is distinct from e.id;

update public.users u
set employee_id = uor.employee_id,
    updated_at = now()
from public.user_office_roles uor
where uor.user_id = u.id
  and uor.company_id = u.company_id
  and uor.employee_id is not null
  and public.ddumba_is_genuine_payroll_employee(uor.employee_id)
  and u.employee_id is null
  and coalesce(lower(uor.status), 'active') = 'active'
  and uor.effective_to is null;

update public.employees e
set user_id = u.id,
    updated_at = now()
from public.users u
where u.employee_id = e.id
  and u.company_id = e.company_id
  and public.ddumba_is_genuine_payroll_employee(e.id)
  and e.user_id is null;

update public.user_office_roles uor
set employee_id = u.employee_id,
    updated_at = now()
from public.users u
where u.id = uor.user_id
  and u.company_id = uor.company_id
  and u.employee_id is not null
  and uor.employee_id is null
  and public.ddumba_is_genuine_payroll_employee(u.employee_id)
  and coalesce(lower(uor.status), 'active') = 'active'
  and uor.effective_to is null;

update public.employees e
set office_id = coalesce(e.office_id, uor.office_id, u.default_office_id),
    updated_at = now()
from public.users u
left join public.user_office_roles uor
  on uor.user_id = u.id
 and uor.company_id = u.company_id
 and uor.employee_id = u.employee_id
 and coalesce(lower(uor.status), 'active') = 'active'
 and uor.effective_to is null
where u.employee_id = e.id
  and e.company_id = u.company_id
  and e.office_id is null
  and coalesce(uor.office_id, u.default_office_id) is not null
  and public.ddumba_is_genuine_payroll_employee(e.id);

update public.payroll_profiles pp
set office_id = coalesce(pp.office_id, e.office_id),
    updated_at = now()
from public.employees e
where e.id = pp.employee_id
  and e.company_id = pp.company_id
  and pp.office_id is null
  and e.office_id is not null
  and public.ddumba_is_genuine_payroll_employee(e.id);

insert into public.payroll_profiles (
  company_id,
  employee_id,
  office_id,
  base_salary,
  salary_payment_day,
  salary_type,
  active,
  effective_start_date,
  updated_at
)
select
  e.company_id,
  e.id,
  e.office_id,
  e.basic_salary,
  coalesce(e.salary_payment_day, e.salary_receiving_day, 1),
  coalesce(e.salary_type, 'monthly'),
  true,
  coalesce(e.salary_effective_start_date, current_date),
  now()
from public.employees e
where public.ddumba_is_genuine_payroll_employee(e.id)
  and coalesce(e.basic_salary, 0) > 0
  and not exists (
    select 1
    from public.payroll_profiles pp
    where pp.company_id = e.company_id
      and pp.employee_id = e.id
      and coalesce(pp.active, true) = true
  );

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
  e.company_id,
  e.office_id,
  e.id,
  date_trunc('month', now() at time zone 'Africa/Kampala')::date,
  date_trunc('month', now() at time zone 'Africa/Kampala')::date,
  coalesce(pp.base_salary, e.basic_salary, 0),
  coalesce(pp.base_salary, e.basic_salary, 0),
  coalesce(pp.allowances, 0),
  coalesce(pp.deductions, 0),
  greatest(0, coalesce(pp.base_salary, e.basic_salary, 0) + coalesce(pp.allowances, 0) - coalesce(pp.deductions, 0)),
  greatest(0, coalesce(pp.base_salary, e.basic_salary, 0) + coalesce(pp.allowances, 0) - coalesce(pp.deductions, 0)),
  0,
  greatest(0, coalesce(pp.base_salary, e.basic_salary, 0) + coalesce(pp.allowances, 0) - coalesce(pp.deductions, 0)),
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
from public.employees e
left join public.payroll_profiles pp
  on pp.company_id = e.company_id
 and pp.employee_id = e.id
 and coalesce(pp.active, true) = true
where public.ddumba_is_genuine_payroll_employee(e.id)
  and coalesce(pp.base_salary, e.basic_salary, 0) > 0
  and (
    e.user_id is not null
    or exists (
      select 1
      from public.users u
      where u.employee_id = e.id
        and u.company_id = e.company_id
    )
    or exists (
      select 1
      from public.user_office_roles uor
      where uor.employee_id = e.id
        and uor.company_id = e.company_id
        and coalesce(lower(uor.status), 'active') = 'active'
        and uor.effective_to is null
    )
  )
  and not exists (
    select 1
    from public.employee_payroll_months pm
    where pm.company_id = e.company_id
      and pm.employee_id = e.id
      and pm.month_key = date_trunc('month', now() at time zone 'Africa/Kampala')::date
      and coalesce(pm.active, true) = true
  );

insert into public.audit_logs(company_id, action, entity_type, entity_id, after_data)
select
  e.company_id,
  'personal_salary_employee_linkage_backfilled',
  'employee',
  e.id,
  jsonb_build_object(
    'employee_id', e.id,
    'employee_name', e.full_name,
    'user_id', e.user_id,
    'office_id', e.office_id,
    'reason', 'Personal salary lookup now links authenticated login accounts to genuine employee payroll records.'
  )
from public.employees e
where public.ddumba_is_genuine_payroll_employee(e.id)
  and e.user_id is not null
  and e.updated_at >= now() - interval '5 minutes';
