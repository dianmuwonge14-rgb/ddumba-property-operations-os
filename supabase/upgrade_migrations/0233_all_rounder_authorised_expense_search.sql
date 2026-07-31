-- Allow office accounts to search active All Rounders company-wide for
-- authorised expense entry while preserving normal office data boundaries.

alter table public.employee_expenses
  add column if not exists employee_home_office_id uuid references public.offices(id) on delete set null,
  add column if not exists submitting_office_id uuid references public.offices(id) on delete set null;

alter table public.employee_expense_requests
  add column if not exists employee_home_office_id uuid references public.offices(id) on delete set null,
  add column if not exists submitting_office_id uuid references public.offices(id) on delete set null;

alter table public.expenses
  add column if not exists employee_home_office_id uuid references public.offices(id) on delete set null,
  add column if not exists submitting_office_id uuid references public.offices(id) on delete set null;

create or replace function public.ddumba_v1_normalized_employee_role(
  p_value text
)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.ddumba_v1_is_all_rounder_employee(
  p_assignment_type text,
  p_role text,
  p_job_title text
)
returns boolean
language sql
immutable
as $$
  select 'allrounder' in (
    public.ddumba_v1_normalized_employee_role(p_assignment_type),
    public.ddumba_v1_normalized_employee_role(p_role),
    public.ddumba_v1_normalized_employee_role(p_job_title)
  );
$$;

create index if not exists idx_employees_all_rounder_company_status
  on public.employees(company_id, status, employee_assignment_type, office_id);

create index if not exists idx_employees_all_rounder_search_text
  on public.employees(company_id, full_name, phone, employee_code, role, job_title);

create index if not exists idx_employee_expenses_lunch_company_day
  on public.employee_expenses(company_id, employee_id, expense_date, category, status, active);

create index if not exists idx_employee_expense_requests_lunch_company_day
  on public.employee_expense_requests(company_id, employee_id, expense_date, requested_item_key, status, active);

create index if not exists idx_employee_expenses_home_submit_offices
  on public.employee_expenses(company_id, employee_home_office_id, submitting_office_id, expense_date);

create index if not exists idx_employee_expense_requests_home_submit_offices
  on public.employee_expense_requests(company_id, employee_home_office_id, submitting_office_id, expense_date);

create or replace function public.ddumba_v1_expense_all_rounder_search(
  p_company_id uuid,
  p_query text
)
returns table(
  employee_id uuid,
  employee_name text,
  phone text,
  employee_code text,
  employee_position text,
  home_office_id uuid,
  home_office_name text,
  active_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      lower(trim(coalesce(p_query, ''))) as raw_query,
      regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9]+', '', 'g') as normalized_query
  )
  select
    e.id as employee_id,
    coalesce(e.full_name, 'Employee')::text as employee_name,
    e.phone::text,
    e.employee_code::text,
    coalesce(nullif(e.role, ''), nullif(e.job_title, ''), nullif(e.employee_assignment_type, ''), 'All Rounder')::text as position,
    e.office_id as home_office_id,
    coalesce(o.office_name, o.name, 'Office')::text as home_office_name,
    coalesce(e.status, 'active')::text as active_status
  from public.employees e
  left join public.offices o on o.id = e.office_id
  cross join params p
  where e.company_id = p_company_id
    and lower(coalesce(e.status, 'active')) = 'active'
    and public.ddumba_v1_is_all_rounder_employee(e.employee_assignment_type, e.role, e.job_title)
    and (
      p.raw_query = ''
      or p.normalized_query = 'allrounder'
      or lower(coalesce(e.full_name, '')) like '%' || p.raw_query || '%'
      or lower(coalesce(e.phone, '')) like '%' || p.raw_query || '%'
      or lower(coalesce(e.employee_code, '')) like '%' || p.raw_query || '%'
      or lower(coalesce(e.role, '')) like '%' || p.raw_query || '%'
      or lower(coalesce(e.job_title, '')) like '%' || p.raw_query || '%'
      or lower(coalesce(e.employee_assignment_type, '')) like '%' || p.raw_query || '%'
      or lower(coalesce(o.office_name, o.name, '')) like '%' || p.raw_query || '%'
    )
  order by
    case
      when lower(coalesce(e.full_name, '')) = p.raw_query then 0
      when lower(coalesce(e.full_name, '')) like p.raw_query || '%' then 1
      when p.normalized_query = 'allrounder' then 2
      else 3
    end,
    e.full_name nulls last
  limit 20;
$$;

create or replace function public.ddumba_v1_prevent_duplicate_employee_lunch()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_expense_date date;
  v_is_lunch boolean := false;
begin
  if tg_table_name = 'employee_expenses' then
    v_company_id := new.company_id;
    v_employee_id := new.employee_id;
    v_expense_date := new.expense_date;
    v_is_lunch := new.active is true
      and public.ddumba_v1_normalized_employee_role(new.category) = 'lunch'
      and lower(coalesce(new.status, 'approved')) in ('approved', 'pending');
  elsif tg_table_name = 'employee_expense_requests' then
    v_company_id := new.company_id;
    v_employee_id := new.employee_id;
    v_expense_date := new.expense_date;
    v_is_lunch := new.active is true
      and public.ddumba_v1_normalized_employee_role(new.requested_item_key) = 'lunch'
      and lower(coalesce(new.status, 'pending')) = 'pending';
  end if;

  if not v_is_lunch then
    return new;
  end if;

  if exists (
    select 1
    from public.employee_expenses ee
    where ee.company_id = v_company_id
      and ee.employee_id = v_employee_id
      and ee.expense_date = v_expense_date
      and ee.active is true
      and public.ddumba_v1_normalized_employee_role(ee.category) = 'lunch'
      and lower(coalesce(ee.status, 'approved')) in ('approved', 'pending')
      and (tg_table_name <> 'employee_expenses' or ee.id <> new.id)
  ) or exists (
    select 1
    from public.employee_expense_requests er
    where er.company_id = v_company_id
      and er.employee_id = v_employee_id
      and er.expense_date = v_expense_date
      and er.active is true
      and public.ddumba_v1_normalized_employee_role(er.requested_item_key) = 'lunch'
      and lower(coalesce(er.status, 'pending')) = 'pending'
      and (tg_table_name <> 'employee_expense_requests' or er.id <> new.id)
  ) then
    raise exception 'Lunch has already been recorded for this employee on this date.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employee_expenses_prevent_duplicate_lunch on public.employee_expenses;
create trigger trg_employee_expenses_prevent_duplicate_lunch
before insert or update of company_id, employee_id, expense_date, category, status, active
on public.employee_expenses
for each row execute function public.ddumba_v1_prevent_duplicate_employee_lunch();

drop trigger if exists trg_employee_expense_requests_prevent_duplicate_lunch on public.employee_expense_requests;
create trigger trg_employee_expense_requests_prevent_duplicate_lunch
before insert or update of company_id, employee_id, expense_date, requested_item_key, status, active
on public.employee_expense_requests
for each row execute function public.ddumba_v1_prevent_duplicate_employee_lunch();

grant execute on function public.ddumba_v1_expense_all_rounder_search(uuid, text) to authenticated, service_role;
grant execute on function public.ddumba_v1_normalized_employee_role(text) to authenticated, service_role;
grant execute on function public.ddumba_v1_is_all_rounder_employee(text, text, text) to authenticated, service_role;
