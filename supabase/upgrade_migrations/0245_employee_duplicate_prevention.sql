-- Prevent repeated employee creation from producing duplicate active employee rows.

create or replace function public.ddumba_normalize_employee_name(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(p_value, ''))), '\s+', ' ', 'g')
$$;

create or replace function public.ddumba_normalize_employee_phone(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_value, ''), '\D', '', 'g')
$$;

create or replace function public.ddumba_employee_status_is_active(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_status, 'active')) not in ('archived', 'deleted', 'inactive', 'terminated')
$$;

create or replace function public.ddumba_prevent_duplicate_active_employee()
returns trigger
language plpgsql
as $$
declare
  v_name text := public.ddumba_normalize_employee_name(new.full_name);
  v_phone text := public.ddumba_normalize_employee_phone(new.phone);
  v_email text := lower(trim(coalesce(new.email, '')));
  v_code text := lower(trim(coalesce(new.employee_code, '')));
  v_old_name text := case when tg_op = 'UPDATE' then public.ddumba_normalize_employee_name(old.full_name) else null end;
  v_old_phone text := case when tg_op = 'UPDATE' then public.ddumba_normalize_employee_phone(old.phone) else null end;
  v_old_email text := case when tg_op = 'UPDATE' then lower(trim(coalesce(old.email, ''))) else null end;
  v_old_code text := case when tg_op = 'UPDATE' then lower(trim(coalesce(old.employee_code, ''))) else null end;
begin
  if not public.ddumba_employee_status_is_active(new.status) then
    return new;
  end if;

  if v_code <> '' and (tg_op = 'INSERT' or v_code is distinct from v_old_code) and exists (
    select 1
    from public.employees e
    where e.company_id = new.company_id
      and e.id is distinct from new.id
      and public.ddumba_employee_status_is_active(e.status)
      and lower(trim(coalesce(e.employee_code, ''))) = v_code
  ) then
    raise exception 'An employee with these details already exists.' using errcode = '23505';
  end if;

  if v_phone <> '' and (tg_op = 'INSERT' or v_phone is distinct from v_old_phone) and exists (
    select 1
    from public.employees e
    where e.company_id = new.company_id
      and e.id is distinct from new.id
      and public.ddumba_employee_status_is_active(e.status)
      and public.ddumba_normalize_employee_phone(e.phone) = v_phone
  ) then
    raise exception 'An employee with these details already exists.' using errcode = '23505';
  end if;

  if v_email <> '' and (tg_op = 'INSERT' or v_email is distinct from v_old_email) and exists (
    select 1
    from public.employees e
    where e.company_id = new.company_id
      and e.id is distinct from new.id
      and public.ddumba_employee_status_is_active(e.status)
      and lower(trim(coalesce(e.email, ''))) = v_email
  ) then
    raise exception 'An employee with these details already exists.' using errcode = '23505';
  end if;

  if v_name <> '' and (tg_op = 'INSERT' or v_name is distinct from v_old_name) and exists (
    select 1
    from public.employees e
    where e.company_id = new.company_id
      and e.id is distinct from new.id
      and public.ddumba_employee_status_is_active(e.status)
      and public.ddumba_normalize_employee_name(e.full_name) = v_name
  ) then
    raise exception 'An employee with these details already exists.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ddumba_prevent_duplicate_active_employee on public.employees;
create trigger trg_ddumba_prevent_duplicate_active_employee
before insert or update of company_id, full_name, employee_code, phone, email, status
on public.employees
for each row
execute function public.ddumba_prevent_duplicate_active_employee();

create unique index if not exists idx_employees_unique_active_company_code
on public.employees(company_id, lower(trim(employee_code)))
where public.ddumba_employee_status_is_active(status)
  and nullif(lower(trim(coalesce(employee_code, ''))), '') is not null;

create unique index if not exists idx_employees_unique_active_company_email
on public.employees(company_id, lower(trim(email)))
where public.ddumba_employee_status_is_active(status)
  and nullif(lower(trim(coalesce(email, ''))), '') is not null;

create unique index if not exists idx_employees_unique_active_company_name
on public.employees(company_id, public.ddumba_normalize_employee_name(full_name))
where public.ddumba_employee_status_is_active(status)
  and nullif(public.ddumba_normalize_employee_name(full_name), '') is not null;

do $$
begin
  if not exists (
    select 1
    from (
      select company_id, public.ddumba_normalize_employee_phone(phone) as normalized_phone, count(*) as total
      from public.employees
      where public.ddumba_employee_status_is_active(status)
        and nullif(public.ddumba_normalize_employee_phone(phone), '') is not null
      group by company_id, public.ddumba_normalize_employee_phone(phone)
      having count(*) > 1
    ) duplicates
  ) then
    execute $sql$
      create unique index if not exists idx_employees_unique_active_company_phone
      on public.employees(company_id, public.ddumba_normalize_employee_phone(phone))
      where public.ddumba_employee_status_is_active(status)
        and nullif(public.ddumba_normalize_employee_phone(phone), '') is not null
    $sql$;
  end if;
end $$;
