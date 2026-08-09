-- Production hotfix: revoked or inactive role assignments must never control login routing.
-- The unified PIN login previously joined user_office_roles without checking status,
-- which allowed an old revoked Admin role to win before the active Field Collector role.

begin;

create or replace function public.ddumba_v1_verify_unified_login(
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
  v_admin record;
  v_collector record;
  v_office record;
  v_office_match_count integer := 0;
  v_office_count integer := 0;
  v_company_id uuid;
begin
  if coalesce(length(trim(p_secret)), 0) < 4 then
    return;
  end if;

  select distinct
    u.id,
    u.email,
    u.company_id,
    u.full_name,
    pc.id as credential_id,
    pc.status as credential_status,
    u.created_at
  into v_admin
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor
    on uor.user_id = u.id
   and uor.company_id = u.company_id
   and coalesce(lower(uor.status), 'active') = 'active'
  join public.roles r on r.id = uor.role_id
  where coalesce(lower(u.status), 'active') = 'active'
    and lower(coalesce(pc.status, 'active')) = 'active'
    and coalesce(pc.is_locked, false) = false
    and pc.locked_at is null
    and uor.office_id is null
    and r.key in ('company_admin', 'super_admin', 'hq_executive')
    and pc.pin_hash = crypt(p_secret, pc.pin_hash)
  order by u.created_at asc
  limit 1;

  if v_admin.id is not null then
    update public.pin_credentials
    set failed_attempts = 0,
        failed_login_attempts = 0,
        is_locked = false,
        locked_at = null,
        last_used_at = now(),
        updated_at = now()
    where id = v_admin.credential_id;

    user_id := v_admin.id;
    email := v_admin.email;
    company_id := v_admin.company_id;
    office_id := null;
    full_name := 'Admin Account';
    office_name := null;
    is_company_admin := true;
    auth_mode := 'admin';
    redirect_to := '/office/admin';
    login_status := 'success';
    attempts_remaining := 3;
    locked := false;
    return next;
    return;
  end if;

  select distinct
    u.id,
    u.email,
    u.company_id,
    coalesce(u.full_name, e.full_name) as full_name,
    pc.id as credential_id,
    pc.status as credential_status,
    u.created_at
  into v_collector
  from public.users u
  left join public.pin_credentials pc on pc.user_id = u.id
  left join public.employees e on e.user_id = u.id
  left join public.user_office_roles uor
    on uor.user_id = u.id
   and uor.company_id = u.company_id
   and coalesce(lower(uor.status), 'active') = 'active'
  left join public.roles r on r.id = uor.role_id
  where coalesce(lower(u.status), 'active') = 'active'
    and (
      r.key in ('field_collector', 'collector')
      or coalesce(u.account_type, '') in ('field_collector', 'collector')
      or coalesce(e.employee_assignment_type, '') = 'all_rounder'
    )
    and (
      (
        pc.id is not null
        and lower(coalesce(pc.status, 'active')) = 'active'
        and coalesce(pc.is_locked, false) = false
        and pc.locked_at is null
        and pc.pin_hash = crypt(p_secret, pc.pin_hash)
      )
      or (
        pc.id is null
        and nullif(e.employee_pin, '') = p_secret
      )
    )
  order by u.created_at asc
  limit 1;

  if v_collector.id is not null then
    update public.pin_credentials
    set failed_attempts = 0,
        failed_login_attempts = 0,
        is_locked = false,
        locked_at = null,
        last_used_at = now(),
        updated_at = now()
    where id = v_collector.credential_id;

    user_id := v_collector.id;
    email := v_collector.email;
    company_id := v_collector.company_id;
    office_id := null;
    full_name := v_collector.full_name;
    office_name := null;
    is_company_admin := false;
    auth_mode := 'collector';
    redirect_to := '/office/collector';
    login_status := 'success';
    attempts_remaining := 3;
    locked := false;
    return next;
    return;
  end if;

  with matches as (
    select distinct
      u.id,
      u.email,
      u.company_id,
      coalesce(u.default_office_id, uor.office_id, e.office_id) as resolved_office_id,
      coalesce(u.full_name, e.full_name) as full_name,
      pc.id as credential_id,
      pc.status as credential_status,
      o.office_name,
      u.created_at
    from public.users u
    left join public.pin_credentials pc on pc.user_id = u.id
    left join public.employees e on e.user_id = u.id
    left join public.user_office_roles uor
      on uor.user_id = u.id
     and uor.company_id = u.company_id
     and coalesce(lower(uor.status), 'active') = 'active'
    left join public.roles r on r.id = uor.role_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id, e.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and coalesce(u.default_office_id, uor.office_id, e.office_id) is not null
      and coalesce(r.key, 'office_manager') not in ('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector')
      and coalesce(e.employee_assignment_type, 'fixed_office') <> 'all_rounder'
      and (
        (
          pc.id is not null
          and lower(coalesce(pc.status, 'active')) = 'active'
          and coalesce(pc.is_locked, false) = false
          and pc.locked_at is null
          and pc.pin_hash = crypt(p_secret, pc.pin_hash)
        )
        or (
          pc.id is null
          and nullif(e.employee_pin, '') = p_secret
        )
      )
  )
  select count(*), count(distinct resolved_office_id)
  into v_office_match_count, v_office_count
  from matches;

  if v_office_count > 1 then
    raise exception 'Duplicate office PIN detected. Contact Admin.' using errcode = 'P0001';
  end if;

  if v_office_match_count = 0 then
    select c.id into v_company_id
    from public.companies c
    order by c.created_at asc
    limit 1;

    insert into public.security_events(company_id, event_type, severity, user_agent, metadata)
    values (v_company_id, 'unified_login_failed', 'warning', p_user_agent, jsonb_build_object('reason', 'invalid_password_or_pin'));
    return;
  end if;

  select *
  into v_office
  from matches
  order by created_at asc
  limit 1;

  update public.pin_credentials
  set failed_attempts = 0,
      failed_login_attempts = 0,
      is_locked = false,
      locked_at = null,
      last_used_at = now(),
      updated_at = now()
  where id = v_office.credential_id;

  user_id := v_office.id;
  email := v_office.email;
  company_id := v_office.company_id;
  office_id := v_office.resolved_office_id;
  full_name := v_office.full_name;
  office_name := v_office.office_name;
  is_company_admin := false;
  auth_mode := 'office';
  redirect_to := '/office';
  login_status := 'success';
  attempts_remaining := 3;
  locked := false;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_unified_login(text, text) to anon, authenticated;

commit;
