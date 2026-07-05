create table if not exists public.office_daily_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  attendance_date date not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  status text not null default 'not_checked_in',
  timezone text not null default 'Africa/Kampala',
  device_info jsonb not null default '{}'::jsonb,
  session_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_daily_attendance_status_check check (status in ('not_checked_in','on_time','late','absent','checked_out'))
);

create unique index if not exists idx_office_daily_attendance_one_per_day
  on public.office_daily_attendance(company_id, office_id, user_id, attendance_date);

create index if not exists idx_office_daily_attendance_office_date
  on public.office_daily_attendance(company_id, office_id, attendance_date);

alter table public.office_daily_attendance enable row level security;

drop policy if exists office_daily_attendance_read on public.office_daily_attendance;
create policy office_daily_attendance_read
  on public.office_daily_attendance
  for select
  using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (
      company_id = public.ddumba_v1_current_company_id()
      and public.ddumba_v1_can_access_office(office_id)
    )
  );

drop policy if exists office_daily_attendance_insert_own on public.office_daily_attendance;
create policy office_daily_attendance_insert_own
  on public.office_daily_attendance
  for insert
  with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (
      user_id = auth.uid()
      and company_id = public.ddumba_v1_current_company_id()
      and public.ddumba_v1_can_access_office(office_id)
    )
  );

drop policy if exists office_daily_attendance_update_own on public.office_daily_attendance;
create policy office_daily_attendance_update_own
  on public.office_daily_attendance
  for update
  using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (
      user_id = auth.uid()
      and company_id = public.ddumba_v1_current_company_id()
      and public.ddumba_v1_can_access_office(office_id)
    )
  )
  with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (
      user_id = auth.uid()
      and company_id = public.ddumba_v1_current_company_id()
      and public.ddumba_v1_can_access_office(office_id)
    )
  );

create or replace function public.ddumba_v1_attendance_status_for_time(p_check_in timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_check_in is null then
      case when (now() at time zone 'Africa/Kampala')::time > time '11:00' then 'absent' else 'not_checked_in' end
    when (p_check_in at time zone 'Africa/Kampala')::time <= time '09:30' then 'on_time'
    when (p_check_in at time zone 'Africa/Kampala')::time <= time '11:00' then 'late'
    else 'absent'
  end
$$;

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
        status = 'checked_out',
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
  timezone text
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
  return next;
end;
$$;

grant execute on function public.ddumba_v1_self_attendance_status(uuid) to authenticated;
