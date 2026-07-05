alter table public.office_daily_attendance
  add column if not exists work_duration_minutes integer not null default 0,
  add column if not exists checkout_status text not null default 'not_checked_out';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'office_daily_attendance_checkout_status_check'
      and conrelid = 'public.office_daily_attendance'::regclass
  ) then
    alter table public.office_daily_attendance
      add constraint office_daily_attendance_checkout_status_check
      check (checkout_status in ('not_checked_out','checked_out','missed_checkout'));
  end if;
end $$;

update public.office_daily_attendance
set work_duration_minutes = greatest(0, floor(extract(epoch from (check_out_time - check_in_time)) / 60)::integer),
    checkout_status = case when check_out_time is not null then 'checked_out' else checkout_status end,
    status = case
      when status = 'checked_out' and check_in_time is not null then public.ddumba_v1_attendance_status_for_time(check_in_time)
      else status
    end
where check_in_time is not null;

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
  v_daily public.office_daily_attendance%rowtype;
  v_event public.attendance_events%rowtype;
  v_status text;
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

  select * into v_daily
  from public.office_daily_attendance
  where company_id = v_company_id
    and office_id = p_office_id
    and user_id = v_user.id
    and attendance_date = v_today
  limit 1;

  if p_event_type = 'check_in' and v_daily.id is not null and v_daily.check_in_time is not null then
    return query
    select
      null::uuid,
      v_employee.id,
      'check_in'::text,
      v_daily.check_in_time,
      'Checked in for today already.'::text;
    return;
  end if;

  if p_event_type = 'check_out' and (v_daily.id is null or v_daily.check_in_time is null) then
    raise exception 'You must check in before checking out.';
  end if;

  if p_event_type = 'check_out' and v_daily.check_out_time is not null then
    raise exception 'You have already checked out today.';
  end if;

  if p_event_type = 'check_in' then
    v_status := public.ddumba_v1_attendance_status_for_time(now());

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
      'check_in',
      now(),
      'web',
      v_status,
      now()
    )
    returning * into v_event;

    insert into public.office_daily_attendance(
      company_id,
      office_id,
      user_id,
      employee_id,
      attendance_date,
      check_in_time,
      status,
      checkout_status,
      timezone,
      session_info,
      created_at,
      updated_at
    )
    values (
      v_company_id,
      p_office_id,
      v_user.id,
      v_employee.id,
      v_today,
      v_event.event_time,
      v_status,
      'not_checked_out',
      'Africa/Kampala',
      jsonb_build_object('source', 'web'),
      now(),
      now()
    )
    on conflict (company_id, office_id, user_id, attendance_date)
    do update set
      employee_id = coalesce(public.office_daily_attendance.employee_id, excluded.employee_id),
      check_in_time = coalesce(public.office_daily_attendance.check_in_time, excluded.check_in_time),
      status = case
        when public.office_daily_attendance.check_in_time is not null then public.office_daily_attendance.status
        else excluded.status
      end,
      updated_at = now()
    returning * into v_daily;
  else
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
      'check_out',
      now(),
      'web',
      'checked_out',
      now()
    )
    returning * into v_event;

    update public.office_daily_attendance
    set check_out_time = v_event.event_time,
        checkout_status = 'checked_out',
        work_duration_minutes = greatest(0, floor(extract(epoch from (v_event.event_time - check_in_time)) / 60)::integer),
        updated_at = now()
    where id = v_daily.id
    returning * into v_daily;
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
    v_user.id,
    'attendance_' || p_event_type,
    'attendance_event',
    v_event.id,
    jsonb_build_object('event', to_jsonb(v_event), 'daily_attendance', to_jsonb(v_daily)),
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

drop function if exists public.ddumba_v1_self_attendance_status(uuid);

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
  last_check_out timestamptz,
  attendance_date date,
  attendance_status text,
  timezone text,
  work_duration_minutes integer,
  checkout_status text
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
  v_today date := public.ddumba_v1_today_uganda();
  v_daily public.office_daily_attendance%rowtype;
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
    and coalesce(lower(status), 'active') not in ('archived','terminated','inactive','suspended')
  order by created_at asc
  limit 1;

  select * into v_daily
  from public.office_daily_attendance
  where company_id = v_user.company_id
    and office_id = p_office_id
    and user_id = v_user_id
    and attendance_date = v_today
  limit 1;

  employee_id := v_employee.id;
  employee_name := coalesce(v_employee.full_name, v_user.full_name);
  office_name := coalesce(v_office.office_name, v_office.name);
  checked_in := v_daily.check_in_time is not null;
  checked_out := v_daily.check_out_time is not null;
  first_check_in := v_daily.check_in_time;
  last_check_out := v_daily.check_out_time;
  attendance_date := v_today;
  attendance_status := coalesce(v_daily.status, public.ddumba_v1_attendance_status_for_time(null));
  timezone := 'Africa/Kampala';
  work_duration_minutes := coalesce(v_daily.work_duration_minutes, 0);
  checkout_status := coalesce(v_daily.checkout_status, 'not_checked_out');
  return next;
end;
$$;

grant execute on function public.ddumba_v1_self_attendance_status(uuid) to authenticated;
