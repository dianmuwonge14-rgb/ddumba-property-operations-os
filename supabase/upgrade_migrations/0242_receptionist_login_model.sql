create extension if not exists pgcrypto;

alter table public.user_office_roles
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists status text default 'active',
  add column if not exists effective_from date default current_date,
  add column if not exists effective_to date,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_user_office_roles_receptionist_scope
  on public.user_office_roles(company_id, office_id, user_id, status, effective_from)
  where office_id is not null;

create index if not exists idx_user_office_roles_employee
  on public.user_office_roles(company_id, employee_id)
  where employee_id is not null;

insert into public.roles(company_id, key, name, description, is_system)
select c.id,
       'receptionist',
       'Receptionist',
       'Personal office receptionist login with office-scoped operational permissions.',
       true
from public.companies c
where not exists (
  select 1
  from public.roles r
  where r.company_id = c.id
    and r.key = 'receptionist'
);

insert into public.role_permissions(role_id, permission_id)
select receptionist.id, rp.permission_id
from public.roles receptionist
join public.roles office_role
  on office_role.key = 'office_manager'
 and (office_role.company_id = receptionist.company_id or office_role.company_id is null)
join public.role_permissions rp on rp.role_id = office_role.id
where receptionist.key = 'receptionist'
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = receptionist.id
      and existing.permission_id = rp.permission_id
  );

update public.users u
set account_type = 'receptionist',
    updated_at = now()
from public.user_office_roles uor
join public.roles r on r.id = uor.role_id
where u.id = uor.user_id
  and lower(coalesce(u.account_type, '')) in ('office_user', 'office_receptionist')
  and r.key = 'receptionist';

drop function if exists public.ddumba_v1_verify_personal_office_login(text, text, text);

create or replace function public.ddumba_v1_verify_personal_office_login(
  p_identifier text,
  p_secret text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  email text,
  company_id uuid,
  office_id uuid,
  full_name text,
  office_name text,
  is_company_admin boolean,
  auth_mode text,
  redirect_to text,
  login_status text,
  attempts_remaining integer,
  locked boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_login record;
begin
  if coalesce(length(trim(p_identifier)), 0) < 2 or coalesce(length(trim(p_secret)), 0) < 4 then
    return;
  end if;

  select distinct
    u.id,
    u.email,
    u.company_id,
    coalesce(u.default_office_id, uor.office_id, e.office_id) as resolved_office_id,
    coalesce(e.full_name, u.full_name) as resolved_full_name,
    coalesce(o.office_name, o.name, 'Office') as resolved_office_name,
    pc.id as credential_id,
    u.created_at
  into v_login
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  left join public.employees e on e.user_id = u.id or e.id = uor.employee_id
  left join public.roles r on r.id = uor.role_id
  join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id, e.office_id)
  where coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(pc.status), 'active') = 'active'
    and coalesce(pc.is_locked, false) = false
    and pc.locked_at is null
    and coalesce(lower(o.status), 'active') = 'active'
    and o.merged_into_office_id is null
    and coalesce(lower(u.account_type), '') <> 'office'
    and coalesce(r.key, 'receptionist') not in ('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector')
    and coalesce(lower(uor.status), 'active') = 'active'
    and coalesce(u.default_office_id, uor.office_id, e.office_id) is not null
    and pc.pin_hash = crypt(trim(p_secret), pc.pin_hash)
    and (
      lower(coalesce(u.full_name, '')) = lower(trim(p_identifier))
      or lower(coalesce(u.email, '')) = lower(trim(p_identifier))
      or lower(coalesce(u.phone, '')) = lower(trim(p_identifier))
      or lower(coalesce(u.employee_code, '')) = lower(trim(p_identifier))
      or lower(coalesce(e.full_name, '')) = lower(trim(p_identifier))
      or lower(coalesce(e.phone, '')) = lower(trim(p_identifier))
      or lower(coalesce(e.employee_code, '')) = lower(trim(p_identifier))
    )
  order by u.created_at asc
  limit 1;

  if v_login.id is null then
    return;
  end if;

  update public.pin_credentials
  set failed_attempts = 0,
      failed_login_attempts = 0,
      is_locked = false,
      locked_at = null,
      last_used_at = now(),
      updated_at = now()
  where id = v_login.credential_id;

  user_id := v_login.id;
  email := v_login.email;
  company_id := v_login.company_id;
  office_id := v_login.resolved_office_id;
  full_name := v_login.resolved_full_name;
  office_name := v_login.resolved_office_name;
  is_company_admin := false;
  auth_mode := 'office';
  redirect_to := '/office';
  login_status := 'success';
  attempts_remaining := 3;
  locked := false;
  return next;
end;
$$;

create or replace function public.ddumba_v1_public_office_login_options()
returns table (
  company_id uuid,
  company_name text,
  office_id uuid,
  office_name text,
  region text,
  city text
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct
    o.company_id,
    c.name as company_name,
    o.id as office_id,
    o.office_name,
    o.region,
    o.city
  from public.offices o
  join public.companies c on c.id = o.company_id
  where coalesce(lower(o.status), 'active') = 'active'
    and o.merged_into_office_id is null
    and coalesce(lower(c.status), 'active') = 'active'
    and exists (
      select 1
      from public.users u
      join public.pin_credentials pc on pc.user_id = u.id
      left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = o.company_id
      left join public.roles r on r.id = uor.role_id
      where u.company_id = o.company_id
        and coalesce(lower(u.status), 'active') = 'active'
        and coalesce(lower(u.account_type), '') <> 'office'
        and coalesce(lower(pc.status), 'active') = 'active'
        and coalesce(pc.is_locked, false) = false
        and pc.locked_at is null
        and (
          u.default_office_id = o.id
          or uor.office_id = o.id
          or uor.scope in ('company', 'headquarters')
          or uor.office_id is null
        )
        and coalesce(lower(uor.status), 'active') = 'active'
    )
  order by o.office_name;
$$;

drop function if exists public.ddumba_v1_check_direct_office_login(text, text);

create or replace function public.ddumba_v1_check_direct_office_login(
  p_secret text,
  p_identifier text default null
)
returns table (
  office_id uuid,
  office_name text
)
language sql
security definer
stable
set search_path = public, extensions
as $$
  with input as (
    select lower(trim(coalesce(p_identifier, ''))) as identifier,
           trim(coalesce(p_secret, '')) as secret
  )
  select distinct
    o.id as office_id,
    coalesce(o.office_name, o.name, 'Office') as office_name
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  left join public.employees e on e.user_id = u.id
  left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  left join public.roles r on r.id = uor.role_id
  join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id, e.office_id)
  cross join input i
  where coalesce(lower(o.status), 'active') = 'active'
    and o.merged_into_office_id is null
    and lower(coalesce(u.account_type, '')) = 'office'
    and coalesce(r.key, 'office_manager') not in ('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector', 'receptionist')
    and pc.pin_hash = crypt(i.secret, pc.pin_hash)
    and (
      i.identifier = ''
      or lower(coalesce(u.full_name, '')) = i.identifier
      or lower(coalesce(u.email, '')) = i.identifier
      or lower(coalesce(u.phone, '')) = i.identifier
      or lower(coalesce(u.employee_code, '')) = i.identifier
      or lower(coalesce(e.full_name, '')) = i.identifier
      or lower(coalesce(e.phone, '')) = i.identifier
      or lower(coalesce(e.employee_code, '')) = i.identifier
    )
  order by office_name
  limit 1;
$$;

grant execute on function public.ddumba_v1_public_office_login_options() to anon, authenticated;
grant execute on function public.ddumba_v1_check_direct_office_login(text, text) to anon, authenticated;
grant execute on function public.ddumba_v1_verify_personal_office_login(text, text, text) to anon, authenticated;
