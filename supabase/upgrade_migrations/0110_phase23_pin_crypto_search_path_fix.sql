-- Phase 23 follow-up: allow security-definer PIN functions to resolve pgcrypto
-- crypt()/gen_salt() when Supabase installs extensions outside public.

create extension if not exists pgcrypto;

create or replace function public.ddumba_v1_verify_office_pin(
  p_office_id uuid,
  p_pin text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  email text,
  company_id uuid,
  office_id uuid,
  full_name text,
  is_company_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_user record;
begin
  if p_office_id is null or coalesce(length(trim(p_pin)), 0) < 4 then
    return;
  end if;

  select o.company_id into v_company_id
  from public.offices o
  where o.id = p_office_id
    and coalesce(lower(o.status), 'active') = 'active';

  if v_company_id is null then
    return;
  end if;

  select
    u.id,
    u.email,
    u.company_id,
    u.full_name,
    pc.id as credential_id,
    exists (
      select 1
      from public.user_office_roles admin_uor
      join public.roles admin_role on admin_role.id = admin_uor.role_id
      where admin_uor.user_id = u.id
        and admin_uor.company_id = u.company_id
        and admin_uor.office_id is null
        and admin_role.key in ('company_admin', 'super_admin', 'hq_executive')
    ) as admin_scope
  into v_user
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  where u.company_id = v_company_id
    and coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(pc.status), 'active') = 'active'
    and pc.pin_hash = crypt(p_pin, pc.pin_hash)
    and (
      u.default_office_id = p_office_id
      or uor.office_id = p_office_id
      or uor.scope in ('company', 'headquarters')
      or uor.office_id is null
    )
  order by
    case when u.default_office_id = p_office_id then 0 else 1 end,
    case when uor.office_id = p_office_id then 0 else 1 end,
    u.created_at asc
  limit 1;

  if v_user.id is null then
    insert into public.security_events(company_id, office_id, event_type, severity, user_agent, metadata)
    values (v_company_id, p_office_id, 'pin_login_failed', 'warning', p_user_agent, jsonb_build_object('reason', 'invalid_pin'));

    update public.pin_credentials pc
    set failed_attempts = failed_attempts + 1,
        updated_at = now()
    where pc.user_id in (
      select u.id
      from public.users u
      left join public.user_office_roles uor on uor.user_id = u.id
      where u.company_id = v_company_id
        and (
          u.default_office_id = p_office_id
          or uor.office_id = p_office_id
          or uor.scope in ('company', 'headquarters')
          or uor.office_id is null
        )
    );
    return;
  end if;

  update public.pin_credentials
  set failed_attempts = 0,
      last_used_at = now(),
      updated_at = now()
  where id = v_user.credential_id;

  insert into public.security_events(company_id, office_id, user_id, event_type, severity, user_agent, metadata)
  values (v_user.company_id, p_office_id, v_user.id, 'pin_login_verified', 'info', p_user_agent, jsonb_build_object('method', 'office_pin'));

  user_id := v_user.id;
  email := v_user.email;
  company_id := v_user.company_id;
  office_id := p_office_id;
  full_name := v_user.full_name;
  is_company_admin := v_user.admin_scope;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_office_pin(uuid, text, text) to anon, authenticated;

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

  insert into public.pin_credentials(company_id, user_id, pin_hash, status, failed_attempts, updated_at)
  values (v_company_id, p_user_id, crypt(p_pin, gen_salt('bf', 8)), coalesce(p_status, 'active'), 0, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        status = excluded.status,
        failed_attempts = 0,
        updated_at = now(),
        expires_at = null;
end;
$$;

grant execute on function public.ddumba_v1_set_pin_credential(uuid, text, text) to authenticated, service_role;
