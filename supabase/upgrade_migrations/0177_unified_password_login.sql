create extension if not exists pgcrypto;

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
  redirect_to text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_office record;
  v_office_match_count integer := 0;
  v_office_count integer := 0;
begin
  if coalesce(length(trim(p_secret)), 0) < 4 then
    return;
  end if;

  /*
    Admin credentials win. If the same secret also exists as an office PIN,
    the admin account still opens first as requested.
  */
  select distinct
    u.id,
    u.email,
    u.company_id,
    u.full_name,
    pc.id as credential_id,
    u.created_at
  into v_admin
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  join public.roles r on r.id = uor.role_id
  where coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(pc.status), 'active') = 'active'
    and uor.office_id is null
    and r.key in ('company_admin', 'super_admin', 'hq_executive')
    and pc.pin_hash = crypt(p_secret, pc.pin_hash)
  order by u.created_at asc
  limit 1;

  if v_admin.id is not null then
    update public.pin_credentials
    set failed_attempts = 0,
        last_used_at = now(),
        updated_at = now()
    where id = v_admin.credential_id;

    update public.users as target_user
    set full_name = 'Admin Account',
        updated_at = now()
    where target_user.id = v_admin.id
      and coalesce(target_user.full_name, '') in ('Test CEO', 'CEO Test', 'Admin', '');

    insert into public.security_events(company_id, user_id, event_type, severity, user_agent, metadata)
    values (
      v_admin.company_id,
      v_admin.id,
      'unified_login_verified',
      'info',
      p_user_agent,
      jsonb_build_object('method', 'admin_password', 'priority', 'admin_first')
    );

    user_id := v_admin.id;
    email := v_admin.email;
    company_id := v_admin.company_id;
    office_id := null;
    full_name := 'Admin Account';
    office_name := null;
    is_company_admin := true;
    auth_mode := 'admin';
    redirect_to := '/office/admin';
    return next;
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
      u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_secret, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select count(*), count(distinct resolved_office_id)
    into v_office_match_count, v_office_count
  from matches;

  if v_office_count > 1 then
    raise exception 'Duplicate office PIN detected. Contact Admin.' using errcode = 'P0001';
  end if;

  if v_office_match_count = 0 then
    insert into public.security_events(company_id, event_type, severity, user_agent, metadata)
    select c.id, 'unified_login_failed', 'warning', p_user_agent, jsonb_build_object('reason', 'invalid_password_or_pin')
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
      u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_secret, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select *
    into v_office
  from matches
  order by created_at asc
  limit 1;

  update public.pin_credentials
  set failed_attempts = 0,
      last_used_at = now(),
      updated_at = now()
  where id = v_office.credential_id;

  insert into public.security_events(company_id, office_id, user_id, event_type, severity, user_agent, metadata)
  values (
    v_office.company_id,
    v_office.resolved_office_id,
    v_office.id,
    'unified_login_verified',
    'info',
    p_user_agent,
    jsonb_build_object('method', 'office_pin')
  );

  user_id := v_office.id;
  email := v_office.email;
  company_id := v_office.company_id;
  office_id := v_office.resolved_office_id;
  full_name := v_office.full_name;
  office_name := v_office.office_name;
  is_company_admin := false;
  auth_mode := 'office';
  redirect_to := '/office';
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_unified_login(text, text) to anon, authenticated;

update public.users u
set full_name = 'Admin Account',
    updated_at = now()
where coalesce(u.full_name, '') = 'Test CEO'
  and exists (
    select 1
    from public.user_office_roles uor
    join public.roles r on r.id = uor.role_id
    where uor.user_id = u.id
      and uor.company_id = u.company_id
      and uor.office_id is null
      and r.key in ('company_admin', 'super_admin', 'hq_executive')
  );
