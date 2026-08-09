-- Authorised Expenses employee search must include local office employees
-- of any role, plus company-wide All Rounders. This keeps ordinary
-- cross-office employees hidden while allowing All Rounders to be used
-- by every office account.

create index if not exists idx_employees_authorised_expense_scope
  on public.employees(company_id, office_id, status, employee_assignment_type);

create index if not exists idx_employees_authorised_expense_lookup
  on public.employees(company_id, full_name, phone, employee_code, role, job_title, office_id);

create or replace function public.ddumba_v1_expense_employee_search(
  p_company_id uuid,
  p_office_id uuid,
  p_query text,
  p_include_all_offices boolean default false
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
    coalesce(nullif(e.role, ''), nullif(e.job_title, ''), nullif(e.employee_assignment_type, ''), 'Employee')::text as employee_position,
    e.office_id as home_office_id,
    coalesce(o.office_name, o.name, 'Office')::text as home_office_name,
    coalesce(e.status, 'active')::text as active_status
  from public.employees e
  left join public.offices o on o.id = e.office_id
  cross join params p
  where e.company_id = p_company_id
    and lower(coalesce(e.status, 'active')) = 'active'
    and lower(concat_ws(' ', e.employee_assignment_type, e.role, e.job_title, e.full_name, e.email)) not like '%admin%'
    and lower(concat_ws(' ', e.employee_assignment_type, e.role, e.job_title, e.full_name, e.email)) not like '%system%'
    and lower(concat_ws(' ', e.employee_assignment_type, e.role, e.job_title, e.full_name, e.email)) not like '%shared login%'
    and lower(concat_ws(' ', e.employee_assignment_type, e.role, e.job_title, e.full_name, e.email)) not like '%office account%'
    and lower(concat_ws(' ', e.employee_assignment_type, e.role, e.job_title, e.full_name, e.email)) not like '%office manager login%'
    and (
      p_include_all_offices is true
      or e.office_id = p_office_id
      or public.ddumba_v1_is_all_rounder_employee(e.employee_assignment_type, e.role, e.job_title)
    )
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
      when e.office_id = p_office_id then 2
      when public.ddumba_v1_is_all_rounder_employee(e.employee_assignment_type, e.role, e.job_title) then 3
      else 4
    end,
    e.full_name nulls last
  limit 20;
$$;

revoke all on function public.ddumba_v1_expense_employee_search(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.ddumba_v1_expense_employee_search(uuid, uuid, text, boolean) to service_role;
