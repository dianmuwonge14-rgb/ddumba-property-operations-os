-- Phase 25 follow-up: use this project's users.id = auth.uid() model in report and employee RPCs.
-- Additive only: replaces RPC definitions, no data mutation.

create or replace function public.ddumba_v1_submit_office_daily_report(
  p_office_id uuid,
  p_report_date date,
  p_total_collections numeric,
  p_total_expenses numeric,
  p_landlord_payments numeric,
  p_vacant_rooms integer,
  p_new_tenants integer,
  p_broken_promises integer,
  p_challenges_faced text,
  p_general_office_notes text
)
returns table (
  report_id uuid,
  submitted_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_report public.office_daily_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_company_id := public.ddumba_v1_current_company_id();
  v_user_id := auth.uid();

  if v_company_id is null or v_user_id is null then
    raise exception 'Active company user is required.';
  end if;

  if not public.ddumba_v1_can_access_office(p_office_id) then
    raise exception 'Office access is required.';
  end if;

  insert into public.office_daily_reports (
    company_id,
    office_id,
    report_date,
    submitted_by,
    total_collections,
    total_expenses,
    landlord_payments,
    vacant_rooms,
    new_tenants,
    broken_promises,
    challenges_faced,
    general_office_notes,
    status,
    submitted_at
  )
  values (
    v_company_id,
    p_office_id,
    coalesce(p_report_date, public.ddumba_v1_today_uganda()),
    v_user_id,
    greatest(coalesce(p_total_collections, 0), 0),
    greatest(coalesce(p_total_expenses, 0), 0),
    greatest(coalesce(p_landlord_payments, 0), 0),
    greatest(coalesce(p_vacant_rooms, 0), 0),
    greatest(coalesce(p_new_tenants, 0), 0),
    greatest(coalesce(p_broken_promises, 0), 0),
    coalesce(p_challenges_faced, ''),
    coalesce(p_general_office_notes, ''),
    'submitted',
    now()
  )
  on conflict (company_id, office_id, report_date)
  do update set
    submitted_by = excluded.submitted_by,
    total_collections = excluded.total_collections,
    total_expenses = excluded.total_expenses,
    landlord_payments = excluded.landlord_payments,
    vacant_rooms = excluded.vacant_rooms,
    new_tenants = excluded.new_tenants,
    broken_promises = excluded.broken_promises,
    challenges_faced = excluded.challenges_faced,
    general_office_notes = excluded.general_office_notes,
    status = 'submitted',
    submitted_at = now(),
    updated_at = now()
  returning * into v_report;

  insert into public.audit_logs (
    company_id,
    office_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    created_at
  )
  values (
    v_company_id,
    p_office_id,
    v_user_id,
    'office_daily_report_submitted',
    'office_daily_report',
    v_report.id,
    to_jsonb(v_report),
    now()
  );

  return query select v_report.id, v_report.submitted_at, 'Daily office report submitted.'::text;
end;
$$;

create or replace function public.ddumba_v1_manage_employee(
  p_employee_id uuid,
  p_office_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_job_title text,
  p_employee_pin text,
  p_status text
)
returns table (
  employee_id uuid,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_employee public.employees%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_company_id := public.ddumba_v1_current_company_id();
  v_user_id := auth.uid();

  if v_company_id is null or v_user_id is null then
    raise exception 'Active company user is required.';
  end if;

  if not public.ddumba_v1_can_access_office(p_office_id) then
    raise exception 'Office access is required.';
  end if;

  if not (
    public.ddumba_v1_has_permission('attendance.manage')
    or public.ddumba_v1_has_permission('settings.manage')
    or public.ddumba_v1_is_company_admin()
  ) then
    raise exception 'Employee administration permission is required.';
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Employee name is required.';
  end if;

  if p_employee_id is null then
    insert into public.employees(
      company_id,
      office_id,
      full_name,
      email,
      phone,
      job_title,
      role,
      employee_pin,
      status,
      created_at,
      updated_at
    )
    values (
      v_company_id,
      p_office_id,
      trim(p_full_name),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''),
      nullif(trim(coalesce(p_job_title, '')), ''),
      nullif(trim(coalesce(p_job_title, '')), ''),
      nullif(trim(coalesce(p_employee_pin, '')), ''),
      coalesce(nullif(p_status, ''), 'active'),
      now(),
      now()
    )
    returning * into v_employee;
  else
    update public.employees
    set
      office_id = p_office_id,
      full_name = trim(p_full_name),
      email = nullif(trim(coalesce(p_email, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      job_title = nullif(trim(coalesce(p_job_title, '')), ''),
      role = coalesce(nullif(trim(coalesce(p_job_title, '')), ''), role),
      employee_pin = coalesce(nullif(trim(coalesce(p_employee_pin, '')), ''), employee_pin),
      status = coalesce(nullif(p_status, ''), status),
      updated_at = now()
    where id = p_employee_id
      and company_id = v_company_id
    returning * into v_employee;

    if v_employee.id is null then
      raise exception 'Employee not found.';
    end if;
  end if;

  insert into public.audit_logs(
    company_id,
    office_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    created_at
  )
  values (
    v_company_id,
    p_office_id,
    v_user_id,
    case when p_employee_id is null then 'employee_created' else 'employee_updated' end,
    'employee',
    v_employee.id,
    to_jsonb(v_employee) - 'employee_pin',
    now()
  );

  return query
  select
    v_employee.id,
    case when p_employee_id is null then 'Employee created.' else 'Employee updated.' end;
end;
$$;

grant execute on function public.ddumba_v1_submit_office_daily_report(uuid, date, numeric, numeric, numeric, integer, integer, integer, text, text) to authenticated;
grant execute on function public.ddumba_v1_manage_employee(uuid, uuid, text, text, text, text, text, text) to authenticated;
