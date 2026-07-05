-- Phase 25: Attendance checkout gate, daily office reports, employee administration helpers.
-- Additive only. No drops, deletes, truncates, or resets.

create table if not exists public.office_daily_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  report_date date not null,
  submitted_by uuid references public.users(id) on delete set null,
  total_collections numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  landlord_payments numeric(14,2) not null default 0,
  vacant_rooms integer not null default 0,
  new_tenants integer not null default 0,
  broken_promises integer not null default 0,
  challenges_faced text not null default '',
  general_office_notes text not null default '',
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_daily_reports_status_check check (status in ('draft','submitted','reviewed','approved')),
  constraint office_daily_reports_unique_day unique (company_id, office_id, report_date)
);

create index if not exists idx_ddumba_v1_office_daily_reports_company_office_date
  on public.office_daily_reports(company_id, office_id, report_date desc);
create index if not exists idx_ddumba_v1_office_daily_reports_submitted_by
  on public.office_daily_reports(submitted_by);

create or replace function public.ddumba_v1_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ddumba_v1_office_daily_reports_updated_at on public.office_daily_reports;
create trigger trg_ddumba_v1_office_daily_reports_updated_at
before update on public.office_daily_reports
for each row execute function public.ddumba_v1_touch_updated_at();

alter table public.office_daily_reports enable row level security;

drop policy if exists office_daily_reports_select on public.office_daily_reports;
create policy office_daily_reports_select
on public.office_daily_reports
for select
using (public.ddumba_v1_can_access_entity(company_id, office_id));

drop policy if exists office_daily_reports_insert on public.office_daily_reports;
create policy office_daily_reports_insert
on public.office_daily_reports
for insert
with check (
  company_id = public.ddumba_v1_current_company_id()
  and public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists office_daily_reports_update on public.office_daily_reports;
create policy office_daily_reports_update
on public.office_daily_reports
for update
using (public.ddumba_v1_can_access_entity(company_id, office_id))
with check (
  company_id = public.ddumba_v1_current_company_id()
  and public.ddumba_v1_can_access_office(office_id)
);

create or replace function public.ddumba_v1_today_uganda()
returns date
language sql
stable
as $$
  select (now() at time zone 'Africa/Kampala')::date;
$$;

create or replace function public.ddumba_v1_office_daily_report_status(
  p_office_id uuid,
  p_report_date date default public.ddumba_v1_today_uganda()
)
returns table (
  submitted boolean,
  report_id uuid,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_company_id := public.ddumba_v1_current_company_id();
  if v_company_id is null or not public.ddumba_v1_can_access_office(p_office_id) then
    raise exception 'Office access is required.';
  end if;

  return query
  select
    (r.id is not null) as submitted,
    r.id as report_id,
    r.submitted_at
  from (select 1) x
  left join public.office_daily_reports r
    on r.company_id = v_company_id
   and r.office_id = p_office_id
   and r.report_date = p_report_date
   and r.status in ('submitted','reviewed','approved')
  limit 1;
end;
$$;

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
    user_id,
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

grant execute on function public.ddumba_v1_office_daily_report_status(uuid, date) to authenticated;
grant execute on function public.ddumba_v1_submit_office_daily_report(uuid, date, numeric, numeric, numeric, integer, integer, integer, text, text) to authenticated;
grant execute on function public.ddumba_v1_record_self_attendance(text, uuid) to authenticated;
grant execute on function public.ddumba_v1_manage_employee(uuid, uuid, text, text, text, text, text, text) to authenticated;
