create extension if not exists pgcrypto;

alter table public.pin_credentials
  add column if not exists locked_at timestamptz,
  add column if not exists reset_by_admin uuid references public.users(id) on delete set null,
  add column if not exists reset_at timestamptz,
  add column if not exists admin_visible_pin text;

create index if not exists idx_pin_credentials_locked_status
  on public.pin_credentials(company_id, status, locked_at desc)
  where status = 'locked';

drop function if exists public.ddumba_v1_set_pin_credential(uuid, text, text);

create or replace function public.ddumba_v1_set_pin_credential(
  p_user_id uuid,
  p_pin text,
  p_status text default 'active'
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
begin
  if not (public.ddumba_v1_is_service_role() or public.ddumba_v1_has_permission('settings.manage')) then
    raise exception 'Not allowed to manage PIN credentials';
  end if;

  if p_user_id is null or coalesce(length(trim(p_pin)), 0) < 4 then
    raise exception 'PIN must be at least 4 digits';
  end if;

  select company_id into v_company_id
  from public.users
  where id = p_user_id;

  if v_company_id is null then
    raise exception 'User account not found';
  end if;

  insert into public.pin_credentials(
    company_id,
    user_id,
    pin_hash,
    status,
    failed_attempts,
    locked_at,
    reset_at,
    admin_visible_pin,
    updated_at
  )
  values (
    v_company_id,
    p_user_id,
    crypt(p_pin, gen_salt('bf', 8)),
    coalesce(p_status, 'active'),
    0,
    case when coalesce(p_status, 'active') = 'locked' then now() else null end,
    now(),
    p_pin,
    now()
  )
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        status = excluded.status,
        failed_attempts = 0,
        locked_at = excluded.locked_at,
        reset_at = now(),
        admin_visible_pin = excluded.admin_visible_pin,
        updated_at = now(),
        expires_at = null;
end;
$$;

grant execute on function public.ddumba_v1_set_pin_credential(uuid, text, text) to authenticated, service_role;

drop function if exists public.ddumba_v1_verify_unified_login(text, text);

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
  v_office record;
  v_office_match_count integer := 0;
  v_office_count integer := 0;
  v_company_id uuid;
  v_recent_failures integer := 0;
  v_remaining integer := 2;
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
    pc.locked_at,
    u.created_at
  into v_admin
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  join public.roles r on r.id = uor.role_id
  where coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(pc.status), 'active') in ('active', 'locked')
    and uor.office_id is null
    and r.key in ('company_admin', 'super_admin', 'hq_executive')
    and pc.pin_hash = crypt(p_secret, pc.pin_hash)
  order by u.created_at asc
  limit 1;

  if v_admin.id is not null then
    if coalesce(lower(v_admin.credential_status), 'active') = 'locked' then
      insert into public.security_events(company_id, user_id, event_type, severity, user_agent, metadata)
      values (
        v_admin.company_id,
        v_admin.id,
        'unified_login_locked_blocked',
        'critical',
        p_user_agent,
        jsonb_build_object('method', 'admin_password', 'locked_at', v_admin.locked_at)
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
      login_status := 'locked';
      attempts_remaining := 0;
      locked := true;
      return next;
      return;
    end if;

    update public.pin_credentials
    set failed_attempts = 0,
        locked_at = null,
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
      coalesce(u.default_office_id, uor.office_id) as resolved_office_id,
      u.full_name,
      pc.id as credential_id,
      pc.status as credential_status,
      pc.locked_at,
      o.office_name,
      u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') in ('active', 'locked')
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
    select c.id into v_company_id
    from public.companies c
    order by c.created_at asc
    limit 1;

    insert into public.security_events(company_id, event_type, severity, user_agent, metadata)
    values (
      v_company_id,
      'unified_login_failed',
      'warning',
      p_user_agent,
      jsonb_build_object('reason', 'invalid_password_or_pin')
    );

    insert into public.audit_logs(company_id, action, entity_type, after_data, user_agent)
    values (
      v_company_id,
      'login_failed',
      'authentication',
      jsonb_build_object('reason', 'invalid_password_or_pin'),
      p_user_agent
    );

    select count(*)::integer into v_recent_failures
    from public.security_events
    where event_type = 'unified_login_failed'
      and created_at >= now() - interval '30 minutes'
      and coalesce(user_agent, '') = coalesce(p_user_agent, '');

    v_remaining := greatest(0, 3 - v_recent_failures);

    user_id := null;
    email := null;
    company_id := v_company_id;
    office_id := null;
    full_name := null;
    office_name := null;
    is_company_admin := false;
    auth_mode := null;
    redirect_to := null;
    login_status := case when v_remaining = 0 then 'invalid_limit' else 'invalid' end;
    attempts_remaining := v_remaining;
    locked := false;
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
      pc.status as credential_status,
      pc.locked_at,
      o.office_name,
      u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') in ('active', 'locked')
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_secret, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select *
    into v_office
  from matches
  order by created_at asc
  limit 1;

  if coalesce(lower(v_office.credential_status), 'active') = 'locked' then
    insert into public.security_events(company_id, office_id, user_id, event_type, severity, user_agent, metadata)
    values (
      v_office.company_id,
      v_office.resolved_office_id,
      v_office.id,
      'unified_login_locked_blocked',
      'critical',
      p_user_agent,
      jsonb_build_object('method', 'office_pin', 'locked_at', v_office.locked_at)
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
    login_status := 'locked';
    attempts_remaining := 0;
    locked := true;
    return next;
    return;
  end if;

  update public.pin_credentials
  set failed_attempts = 0,
      locked_at = null,
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
  login_status := 'success';
  attempts_remaining := 3;
  locked := false;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_unified_login(text, text) to anon, authenticated;
