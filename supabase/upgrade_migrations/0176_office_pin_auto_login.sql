create extension if not exists pgcrypto;

create or replace function public.ddumba_v1_verify_office_pin_auto(
  p_pin text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  email text,
  company_id uuid,
  office_id uuid,
  full_name text,
  office_name text,
  is_company_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_match_count integer := 0;
  v_office_count integer := 0;
  v_user record;
begin
  if coalesce(length(trim(p_pin)), 0) < 4 then
    return;
  end if;

  with matches as (
    select distinct
      u.id,
      u.email,
      u.company_id,
      coalesce(u.default_office_id, uor.office_id) as resolved_office_id,
      u.full_name,
      pc.id as credential_id,
      o.office_name,
      exists (
        select 1
        from public.user_office_roles admin_uor
        join public.roles admin_role on admin_role.id = admin_uor.role_id
        where admin_uor.user_id = u.id
          and admin_uor.company_id = u.company_id
          and admin_uor.office_id is null
          and admin_role.key in ('company_admin', 'super_admin', 'hq_executive')
      ) as admin_scope,
      u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_pin, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select count(*), count(distinct resolved_office_id)
    into v_match_count, v_office_count
  from matches;

  if v_office_count > 1 then
    raise exception 'Duplicate office PIN detected. Contact Admin.' using errcode = 'P0001';
  end if;

  if v_match_count = 0 then
    insert into public.security_events(company_id, event_type, severity, user_agent, metadata)
    select c.id, 'pin_login_failed', 'warning', p_user_agent, jsonb_build_object('reason', 'invalid_pin_auto')
    from public.companies c
    order by c.created_at asc
    limit 1;
    return;
  end if;

  with matches as (
    select distinct
      u.id,
      u.email,
      u.company_id,
      coalesce(u.default_office_id, uor.office_id) as resolved_office_id,
      u.full_name,
      pc.id as credential_id,
      o.office_name,
      exists (
        select 1
        from public.user_office_roles admin_uor
        join public.roles admin_role on admin_role.id = admin_uor.role_id
        where admin_uor.user_id = u.id
          and admin_uor.company_id = u.company_id
          and admin_uor.office_id is null
          and admin_role.key in ('company_admin', 'super_admin', 'hq_executive')
      ) as admin_scope,
      u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_pin, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select *
    into v_user
  from matches
  order by created_at asc
  limit 1;

  update public.pin_credentials
  set failed_attempts = 0,
      last_used_at = now(),
      updated_at = now()
  where id = v_user.credential_id;

  insert into public.security_events(company_id, office_id, user_id, event_type, severity, user_agent, metadata)
  values (
    v_user.company_id,
    v_user.resolved_office_id,
    v_user.id,
    'pin_login_verified',
    'info',
    p_user_agent,
    jsonb_build_object('method', 'office_pin_auto')
  );

  user_id := v_user.id;
  email := v_user.email;
  company_id := v_user.company_id;
  office_id := v_user.resolved_office_id;
  full_name := v_user.full_name;
  office_name := v_user.office_name;
  is_company_admin := v_user.admin_scope;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_office_pin_auto(text, text) to anon, authenticated;
