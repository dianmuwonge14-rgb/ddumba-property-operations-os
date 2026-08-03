-- Salary Centre must only include genuine employee records, never shared office/workspace accounts.

create or replace function public.ddumba_is_genuine_payroll_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    left join public.users u on u.id = e.user_id
    where e.id = p_employee_id
      and lower(coalesce(e.status, 'active')) not in ('archived', 'deleted', 'inactive', 'terminated')
      and lower(coalesce(u.account_type, '')) not in ('office', 'office_workspace', 'service', 'system', 'shared')
      and lower(coalesce(e.full_name, '')) not like '%office account%'
      and lower(coalesce(e.full_name, '')) not like '% office login'
      and lower(coalesce(e.full_name, '')) not like '% office qa'
      and lower(coalesce(e.full_name, '')) <> 'nakiwogo office'
      and lower(coalesce(e.employee_code, '')) not like 'off-%'
      and lower(coalesce(e.role_name, '')) not like '%office account%'
      and lower(coalesce(e.job_title, '')) <> 'office user'
  )
$$;

create or replace function public.ddumba_guard_salary_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employee_id is null or not public.ddumba_is_genuine_payroll_employee(new.employee_id) then
    raise exception 'Operational account — not eligible for payroll.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payroll_profiles_genuine_employee on public.payroll_profiles;
create trigger trg_payroll_profiles_genuine_employee
before insert or update of employee_id
on public.payroll_profiles
for each row
execute function public.ddumba_guard_salary_employee();

drop trigger if exists trg_employee_payroll_months_genuine_employee on public.employee_payroll_months;
create trigger trg_employee_payroll_months_genuine_employee
before insert or update of employee_id
on public.employee_payroll_months
for each row
execute function public.ddumba_guard_salary_employee();

drop trigger if exists trg_employee_salary_payments_genuine_employee on public.employee_salary_payments;
create trigger trg_employee_salary_payments_genuine_employee
before insert or update of employee_id
on public.employee_salary_payments
for each row
execute function public.ddumba_guard_salary_employee();

update public.payroll_profiles
set active = false,
    updated_at = now()
where active = true
  and not public.ddumba_is_genuine_payroll_employee(employee_id);

update public.employee_payroll_months
set active = false,
    payment_status = coalesce(payment_status, 'admin_review_required'),
    status = coalesce(status, 'admin_review_required'),
    updated_at = now(),
    notes = trim(concat(coalesce(notes, ''), ' Payroll entry excluded: operational account not eligible for payroll.'))
where coalesce(active, true) = true
  and not public.ddumba_is_genuine_payroll_employee(employee_id);

insert into public.audit_logs(company_id, action, entity_type, entity_id, after_data)
select
  e.company_id,
  'salary_operational_account_excluded',
  'employee',
  e.id,
  jsonb_build_object(
    'employee_id', e.id,
    'employee_name', e.full_name,
    'user_id', e.user_id,
    'reason', 'Operational account excluded from Salary Centre and payroll calculations'
  )
from public.employees e
left join public.users u on u.id = e.user_id
where not public.ddumba_is_genuine_payroll_employee(e.id)
  and (
    exists (select 1 from public.payroll_profiles p where p.employee_id = e.id)
    or exists (select 1 from public.employee_payroll_months pm where pm.employee_id = e.id)
    or exists (select 1 from public.employee_salary_payments sp where sp.employee_id = e.id)
  );
