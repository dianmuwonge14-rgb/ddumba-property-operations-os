-- Leopard collector linkage repair.
-- Connects the existing collector login/profile/role and collection attribution to one real employee_id.
-- This migration does not change amounts, rooms, tenants, receipt numbers, payment dates, or financial impact.

alter table public.field_collector_profiles
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_field_collector_profiles_company_user_employee
  on public.field_collector_profiles(company_id, user_id, employee_id);

create index if not exists idx_collections_company_recorded_entered_employee
  on public.collections(company_id, recorded_by, entered_by_account_id, payment_date desc)
  where recorded_by is not null or entered_by_account_id is not null;

do $$
declare
  v_company_id uuid := '7744ee11-6375-44bb-953f-fdc8ea17eedd';
  v_employee_id uuid;
  v_user_id uuid;
  v_collector_profile_id uuid;
  v_role_id uuid;
  v_linked_collections integer := 0;
begin
  select e.id
    into v_employee_id
  from public.employees e
  where e.company_id = v_company_id
    and lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = 'leopard'
    and lower(coalesce(e.status, 'active')) = 'active';

  if v_employee_id is null then
    raise exception 'Leopard repair aborted: active Leopard employee was not found.';
  end if;

  if (
    select count(*)
    from public.employees e
    where e.company_id = v_company_id
      and lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) in ('leopard', 'leopold nanjiibwa')
      and lower(coalesce(e.status, 'active')) = 'active'
  ) <> 1 then
    raise exception 'Leopard repair aborted: duplicate or ambiguous Leopard employee records exist.';
  end if;

  select u.id
    into v_user_id
  from public.users u
  where u.company_id = v_company_id
    and lower(regexp_replace(coalesce(u.full_name, ''), '\s+', ' ', 'g')) = 'leopold nanjiibwa'
    and lower(coalesce(u.account_type, '')) in ('field_collector', 'collector')
    and lower(coalesce(u.status, 'active')) = 'active';

  if v_user_id is null then
    raise exception 'Leopard repair aborted: active Leopard field collector user was not found.';
  end if;

  if (
    select count(*)
    from public.users u
    where u.company_id = v_company_id
      and lower(regexp_replace(coalesce(u.full_name, ''), '\s+', ' ', 'g')) = 'leopold nanjiibwa'
      and lower(coalesce(u.account_type, '')) in ('field_collector', 'collector')
      and lower(coalesce(u.status, 'active')) = 'active'
  ) <> 1 then
    raise exception 'Leopard repair aborted: duplicate or ambiguous Leopard collector users exist.';
  end if;

  select fcp.id
    into v_collector_profile_id
  from public.field_collector_profiles fcp
  where fcp.company_id = v_company_id
    and fcp.user_id = v_user_id
    and lower(coalesce(fcp.status, 'active')) = 'active';

  if v_collector_profile_id is null then
    raise exception 'Leopard repair aborted: active Leopard collector profile was not found.';
  end if;

  select r.id
    into v_role_id
  from public.roles r
  where r.company_id = v_company_id
    and r.key = 'field_collector';

  if v_role_id is null then
    raise exception 'Leopard repair aborted: Field Collector role is missing.';
  end if;

  update public.users u
  set employee_id = v_employee_id,
      account_type = 'field_collector',
      status = 'active',
      updated_at = now()
  where u.company_id = v_company_id
    and u.id = v_user_id
    and (
      u.employee_id is distinct from v_employee_id
      or lower(coalesce(u.account_type, '')) <> 'field_collector'
      or lower(coalesce(u.status, 'active')) <> 'active'
    );

  update public.employees e
  set user_id = v_user_id,
      role = coalesce(e.role, 'Field Collector'),
      role_name = coalesce(e.role_name, 'Field Collector'),
      job_title = coalesce(e.job_title, 'Field Collector'),
      updated_at = now()
  where e.company_id = v_company_id
    and e.id = v_employee_id
    and (
      e.user_id is distinct from v_user_id
      or e.role is null
      or e.role_name is null
      or e.job_title is null
    );

  update public.field_collector_profiles fcp
  set employee_id = v_employee_id,
      status = 'active',
      updated_at = now()
  where fcp.company_id = v_company_id
    and fcp.id = v_collector_profile_id
    and (
      fcp.employee_id is distinct from v_employee_id
      or lower(coalesce(fcp.status, 'active')) <> 'active'
    );

  update public.user_office_roles uor
  set employee_id = v_employee_id,
      role_id = v_role_id,
      scope = 'company',
      office_id = null,
      status = 'active',
      effective_from = coalesce(uor.effective_from, current_date),
      effective_to = null,
      updated_at = now()
  where uor.company_id = v_company_id
    and uor.user_id = v_user_id
    and (
      uor.employee_id is distinct from v_employee_id
      or uor.role_id is distinct from v_role_id
      or coalesce(uor.scope, '') <> 'company'
      or uor.office_id is not null
      or lower(coalesce(uor.status, 'active')) <> 'active'
      or uor.effective_to is not null
    );

  insert into public.user_office_roles(company_id, user_id, office_id, role_id, scope, employee_id, status, effective_from)
  select v_company_id, v_user_id, null, v_role_id, 'company', v_employee_id, 'active', current_date
  where not exists (
    select 1
    from public.user_office_roles uor
    where uor.company_id = v_company_id
      and uor.user_id = v_user_id
      and uor.role_id = v_role_id
      and lower(coalesce(uor.status, 'active')) = 'active'
      and uor.effective_to is null
  );

  update public.collections c
  set collected_by_employee_id = coalesce(c.collected_by_employee_id, v_employee_id),
      prepared_by_employee_id = coalesce(c.prepared_by_employee_id, v_employee_id),
      recorded_by_employee_id = coalesce(c.recorded_by_employee_id, v_employee_id),
      updated_at = coalesce(c.updated_at, now())
  where c.company_id = v_company_id
    and (c.recorded_by = v_user_id or c.entered_by_account_id = v_user_id or c.collector_id = v_collector_profile_id)
    and (
      c.collected_by_employee_id is null
      or c.prepared_by_employee_id is null
      or c.recorded_by_employee_id is null
    );

  get diagnostics v_linked_collections = row_count;

  insert into public.employee_payroll_months(
    company_id,
    employee_id,
    office_id,
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
    status,
    payment_status,
    active,
    created_at,
    updated_at
  )
  select
    pp.company_id,
    pp.employee_id,
    coalesce(pp.office_id, e.office_id, e.default_office_id),
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
      date_trunc('month', now() at time zone 'Africa/Kampala')
      + (least(
          coalesce(pp.salary_payment_day, e.salary_payment_day, e.salary_receiving_day, 1),
          extract(day from (date_trunc('month', now() at time zone 'Africa/Kampala') + interval '1 month - 1 day'))::int
        ) - 1) * interval '1 day'
    )::date,
    'pending_payment',
    'pending_payment',
    true,
    now(),
    now()
  from public.payroll_profiles pp
  join public.employees e on e.id = pp.employee_id and e.company_id = pp.company_id
  where pp.company_id = v_company_id
    and pp.employee_id = v_employee_id
    and pp.active = true
    and coalesce(pp.base_salary, 0) > 0
  on conflict (company_id, employee_id, month_key) do nothing;

  insert into public.audit_logs(company_id, action, entity_type, entity_id, after_data)
  values (
    v_company_id,
    'leopard_collector_employee_linkage_repaired',
    'employee',
    v_employee_id,
    jsonb_build_object(
      'employee_id', v_employee_id,
      'user_id', v_user_id,
      'collector_profile_id', v_collector_profile_id,
      'role', 'field_collector',
      'collections_attributed', v_linked_collections,
      'salary_linkage', 'users.employee_id -> employees.id -> payroll_profiles -> employee_payroll_months',
      'reason', 'Connected Leopard collector collections and salary lookup to the authoritative employee record.'
    )
  );
end $$;
