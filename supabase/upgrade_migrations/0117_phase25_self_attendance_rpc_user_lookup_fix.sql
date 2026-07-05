-- Phase 25 follow-up: project-compatible self-attendance user lookup.
-- Additive only: replaces one RPC, no data mutation.

create or replace function public.ddumba_v1_record_self_attendance(
  p_event_type text,
  p_office_id uuid
)
returns table (
  event_id uuid,
  employee_id uuid,
  event_type text,
  event_time timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_employee public.employees%rowtype;
  v_company_id uuid;
  v_today date := public.ddumba_v1_today_uganda();
  v_has_check_in boolean;
  v_has_check_out boolean;
  v_event public.attendance_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_event_type not in ('check_in', 'check_out') then
    raise exception 'Only check_in and check_out are supported for self attendance.';
  end if;

  select * into v_user
  from public.users
  where id = auth.uid()
    and coalesce(lower(status), 'active') = 'active'
  limit 1;

  if v_user.id is null then
    raise exception 'Active Ddumba user profile is required.';
  end if;

  v_company_id := coalesce(v_user.company_id, public.ddumba_v1_current_company_id());
  if v_company_id is null then
    raise exception 'Active company is required.';
  end if;

  if not public.ddumba_v1_can_access_office(p_office_id) then
    raise exception 'Office access is required.';
  end if;

  select * into v_employee
  from public.employees
  where company_id = v_company_id
    and office_id = p_office_id
    and user_id = v_user.id
    and coalesce(lower(status), 'active') not in ('archived','terminated','inactive','suspended')
  order by created_at asc
  limit 1;

  if v_employee.id is null then
    insert into public.employees(
      company_id,
      office_id,
      user_id,
      full_name,
      email,
      employee_code,
      role,
      job_title,
      status,
      created_at,
      updated_at
    )
    values (
      v_company_id,
      p_office_id,
      v_user.id,
      coalesce(v_user.full_name, 'Office User'),
      v_user.email,
      v_user.employee_code,
      'office_user',
      'Office User',
      'active',
      now(),
      now()
    )
    returning * into v_employee;
  end if;

  select exists (
    select 1
    from public.attendance_events ae
    where ae.company_id = v_company_id
      and ae.office_id = p_office_id
      and ae.employee_id = v_employee.id
      and ae.event_type = 'check_in'
      and (ae.event_time at time zone 'Africa/Kampala')::date = v_today
  ) into v_has_check_in;

  select exists (
    select 1
    from public.attendance_events ae
    where ae.company_id = v_company_id
      and ae.office_id = p_office_id
      and ae.employee_id = v_employee.id
      and ae.event_type = 'check_out'
      and (ae.event_time at time zone 'Africa/Kampala')::date = v_today
  ) into v_has_check_out;

  if p_event_type = 'check_in' and v_has_check_in then
    raise exception 'You have already checked in today.';
  end if;

  if p_event_type = 'check_out' and not v_has_check_in then
    raise exception 'You must check in before checking out.';
  end if;

  if p_event_type = 'check_out' and v_has_check_out then
    raise exception 'You have already checked out today.';
  end if;

  if p_event_type = 'check_out' and not exists (
    select 1
    from public.office_daily_reports r
    where r.company_id = v_company_id
      and r.office_id = p_office_id
      and r.report_date = v_today
      and r.status in ('submitted','reviewed','approved')
  ) then
    raise exception 'Please submit today’s office report before checking out.';
  end if;

  insert into public.attendance_events(
    company_id,
    office_id,
    employee_id,
    user_id,
    event_type,
    event_time,
    source,
    status,
    created_at
  )
  values (
    v_company_id,
    p_office_id,
    v_employee.id,
    v_user.id,
    p_event_type,
    now(),
    'web',
    case
      when p_event_type = 'check_in' and ((now() at time zone 'Africa/Kampala')::time > time '10:00') then 'late'
      else 'valid'
    end,
    now()
  )
  returning * into v_event;

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
    v_user.id,
    'attendance_' || p_event_type,
    'attendance_event',
    v_event.id,
    to_jsonb(v_event),
    now()
  );

  return query
  select
    v_event.id,
    v_employee.id,
    v_event.event_type,
    v_event.event_time,
    case
      when p_event_type = 'check_in' then 'Checked in successfully.'
      else 'Checked out successfully.'
    end;
end;
$$;

grant execute on function public.ddumba_v1_record_self_attendance(text, uuid) to authenticated;
