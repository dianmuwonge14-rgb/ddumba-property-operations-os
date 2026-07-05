-- Phase 23.2: self attendance gate support.
-- Additive only: no drops, deletes, truncates, or data resets.

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
  v_user_id uuid := auth.uid();
  v_user public.users%rowtype;
  v_office_id uuid := p_office_id;
  v_employee public.employees%rowtype;
  v_has_check_in boolean;
  v_has_check_out boolean;
  v_latest_event text;
  v_event public.attendance_events%rowtype;
  v_today_start timestamptz := (to_char(now() at time zone 'Africa/Kampala', 'YYYY-MM-DD') || ' 00:00:00+03')::timestamptz;
  v_today_end timestamptz := (to_char(now() at time zone 'Africa/Kampala', 'YYYY-MM-DD') || ' 23:59:59+03')::timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_event_type not in ('check_in', 'check_out') then
    raise exception 'Only check-in and check-out are supported by the self attendance gate.';
  end if;

  select * into v_user
  from public.users
  where id = v_user_id
    and coalesce(lower(status), 'active') = 'active';

  if v_user.id is null then
    raise exception 'Active user profile was not found.';
  end if;

  if v_office_id is null then
    raise exception 'Active office is required.';
  end if;

  if not public.ddumba_v1_can_access_office(v_office_id) then
    raise exception 'You do not have access to this office.';
  end if;

  select * into v_employee
  from public.employees
  where company_id = v_user.company_id
    and office_id = v_office_id
    and user_id = v_user_id
    and coalesce(lower(status), 'active') <> 'archived'
  order by created_at asc
  limit 1;

  if v_employee.id is null then
    insert into public.employees(
      company_id,
      email,
      employee_code,
      full_name,
      job_title,
      office_id,
      role,
      status,
      user_id
    )
    values (
      v_user.company_id,
      v_user.email,
      v_user.employee_code,
      v_user.full_name,
      'Office User',
      v_office_id,
      'office_user',
      'active',
      v_user_id
    )
    returning * into v_employee;
  end if;

  select
    bool_or(ae.event_type = 'check_in'),
    bool_or(ae.event_type = 'check_out'),
    (array_agg(ae.event_type order by ae.event_time desc))[1]
  into v_has_check_in, v_has_check_out, v_latest_event
  from public.attendance_events ae
  where ae.company_id = v_user.company_id
    and ae.office_id = v_office_id
    and ae.employee_id = v_employee.id
    and ae.event_time between v_today_start and v_today_end;

  if p_event_type = 'check_in' and coalesce(v_has_check_in, false) then
    raise exception 'This account has already checked in today.';
  end if;

  if p_event_type = 'check_out' and (not coalesce(v_has_check_in, false) or coalesce(v_has_check_out, false) or v_latest_event = 'start_break') then
    raise exception 'Check-out requires an active checked-in session.';
  end if;

  insert into public.attendance_events(
    company_id,
    employee_id,
    event_time,
    event_type,
    office_id,
    source,
    status,
    user_id
  )
  values (
    v_user.company_id,
    v_employee.id,
    now(),
    p_event_type,
    v_office_id,
    'web',
    case
      when p_event_type = 'check_in' and ((extract(hour from now() at time zone 'Africa/Kampala') * 60) + extract(minute from now() at time zone 'Africa/Kampala')) > 600 then 'late'
      else 'valid'
    end,
    v_user_id
  )
  returning * into v_event;

  insert into public.audit_logs(
    action,
    actor_id,
    company_id,
    office_id,
    entity_type,
    entity_id,
    after_data
  )
  values (
    'attendance_' || p_event_type,
    v_user_id,
    v_user.company_id,
    v_office_id,
    'attendance_event',
    v_event.id,
    to_jsonb(v_event)
  );

  event_id := v_event.id;
  employee_id := v_employee.id;
  event_type := v_event.event_type;
  event_time := v_event.event_time;
  message := coalesce(v_employee.full_name, v_user.full_name) || ' ' || replace(p_event_type, '_', ' ') || ' recorded.';
  return next;
end;
$$;

grant execute on function public.ddumba_v1_record_self_attendance(text, uuid) to authenticated;

create or replace function public.ddumba_v1_self_attendance_status(
  p_office_id uuid
)
returns table (
  employee_id uuid,
  employee_name text,
  office_name text,
  checked_in boolean,
  checked_out boolean,
  first_check_in timestamptz,
  last_check_out timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user public.users%rowtype;
  v_employee public.employees%rowtype;
  v_office public.offices%rowtype;
  v_today_start timestamptz := (to_char(now() at time zone 'Africa/Kampala', 'YYYY-MM-DD') || ' 00:00:00+03')::timestamptz;
  v_today_end timestamptz := (to_char(now() at time zone 'Africa/Kampala', 'YYYY-MM-DD') || ' 23:59:59+03')::timestamptz;
begin
  if v_user_id is null or p_office_id is null then
    return;
  end if;

  select * into v_user
  from public.users
  where id = v_user_id
    and coalesce(lower(status), 'active') = 'active';

  if v_user.id is null or not public.ddumba_v1_can_access_office(p_office_id) then
    return;
  end if;

  select * into v_office
  from public.offices
  where id = p_office_id
    and company_id = v_user.company_id;

  select * into v_employee
  from public.employees
  where company_id = v_user.company_id
    and office_id = p_office_id
    and user_id = v_user_id
    and coalesce(lower(status), 'active') <> 'archived'
  order by created_at asc
  limit 1;

  employee_id := v_employee.id;
  employee_name := coalesce(v_employee.full_name, v_user.full_name);
  office_name := coalesce(v_office.office_name, v_office.name);

  select
    min(ae.event_time) filter (where ae.event_type = 'check_in'),
    max(ae.event_time) filter (where ae.event_type = 'check_out')
  into first_check_in, last_check_out
  from public.attendance_events ae
  where ae.company_id = v_user.company_id
    and ae.office_id = p_office_id
    and ae.employee_id = v_employee.id
    and ae.event_time between v_today_start and v_today_end;

  checked_in := first_check_in is not null;
  checked_out := last_check_out is not null;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_self_attendance_status(uuid) to authenticated;
