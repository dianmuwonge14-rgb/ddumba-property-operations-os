create extension if not exists pgcrypto;

alter table public.offices
  add column if not exists merged_into_office_id uuid references public.offices(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references public.users(id) on delete set null;

alter table public.offices
  drop constraint if exists offices_status_check;

alter table public.offices
  add constraint offices_status_check
  check (status is null or length(trim(status)) > 0);

alter table public.pin_credentials
  add column if not exists revoked_reason text,
  add column if not exists revoked_at timestamptz;

create index if not exists idx_offices_active_login
  on public.offices(company_id, status, office_name)
  where lower(coalesce(status, 'active')) = 'active';

create index if not exists idx_offices_merged_destination
  on public.offices(company_id, merged_into_office_id)
  where merged_into_office_id is not null;

create or replace function public.ddumba_v1_reject_retired_office_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_destination uuid;
  v_destination_name text;
begin
  if new.office_id is null then
    return new;
  end if;

  select lower(coalesce(o.status, 'active')),
         o.merged_into_office_id,
         coalesce(dest.office_name, dest.name, 'the new office')
    into v_status, v_destination, v_destination_name
  from public.offices o
  left join public.offices dest on dest.id = o.merged_into_office_id
  where o.id = new.office_id
  limit 1;

  if v_status is null then
    return new;
  end if;

  if v_status <> 'active' or v_destination is not null then
    raise exception 'This office was merged into %. Please use the new office account.', v_destination_name
      using errcode = '23514',
            detail = 'retired_office_id=' || new.office_id::text,
            hint = coalesce(v_destination::text, '');
  end if;

  return new;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'rooms',
    'properties',
    'tenants',
    'collections',
    'receipts',
    'expenses',
    'cash_accounts',
    'cash_transactions',
    'cash_transfers',
    'security_deposit_register',
    'security_deposit_transactions',
    'collector_banking_submissions',
    'landlord_monthly_payables',
    'landlord_payments',
    'landlord_advances',
    'recovery_deductions',
    'promises',
    'daily_reports',
    'notifications',
    'approval_requests',
    'attendance_records'
  ];
begin
  foreach v_table in array v_tables loop
    if exists (
      select 1
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name = 'office_id'
        and t.table_type = 'BASE TABLE'
    ) then
      execute format('drop trigger if exists trg_reject_retired_office_write on public.%I', v_table);
      execute format(
        'create trigger trg_reject_retired_office_write before insert or update of office_id on public.%I for each row execute function public.ddumba_v1_reject_retired_office_write()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create or replace function public.ddumba_v1_retire_merged_offices(
  p_company_id uuid,
  p_source_office_ids uuid[],
  p_destination_office_id uuid,
  p_admin_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := now();
  v_source_count integer := 0;
  v_destination_name text;
  v_user_count integer := 0;
  v_credential_count integer := 0;
  v_role_count integer := 0;
begin
  select coalesce(office_name, name, 'Merged office')
    into v_destination_name
  from public.offices
  where id = p_destination_office_id
    and company_id = p_company_id
  limit 1;

  if p_company_id is null or p_destination_office_id is null or v_destination_name is null then
    raise exception 'Destination office is required.';
  end if;

  update public.offices
  set status = 'merged',
      merged_into_office_id = p_destination_office_id,
      merged_at = coalesce(merged_at, v_now),
      merged_by = coalesce(merged_by, p_admin_user_id),
      updated_at = v_now
  where company_id = p_company_id
    and id = any(p_source_office_ids)
    and id <> p_destination_office_id;
  get diagnostics v_source_count = row_count;

  update public.users
  set status = 'inactive',
      updated_at = v_now
  where company_id = p_company_id
    and default_office_id = any(p_source_office_ids)
    and not exists (
      select 1
      from public.user_office_roles uor
      join public.roles r on r.id = uor.role_id
      where uor.user_id = users.id
        and r.key in ('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector')
    );
  get diagnostics v_user_count = row_count;

  update public.pin_credentials pc
  set status = 'revoked',
      is_locked = true,
      locked_at = coalesce(locked_at, v_now),
      revoked_at = coalesce(revoked_at, v_now),
      revoked_reason = 'office_merged_into:' || p_destination_office_id::text,
      updated_at = v_now
  from public.users u
  where u.id = pc.user_id
    and u.company_id = p_company_id
    and (
      u.default_office_id = any(p_source_office_ids)
      or exists (
        select 1
        from public.user_office_roles uor
        where uor.user_id = u.id
          and uor.company_id = p_company_id
          and uor.office_id = any(p_source_office_ids)
      )
    )
    and not exists (
      select 1
      from public.user_office_roles uor
      join public.roles r on r.id = uor.role_id
      where uor.user_id = u.id
        and r.key in ('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector')
    );
  get diagnostics v_credential_count = row_count;

  update public.user_office_roles
  set office_id = p_destination_office_id
  where company_id = p_company_id
    and office_id = any(p_source_office_ids)
    and office_id <> p_destination_office_id;
  get diagnostics v_role_count = row_count;

  update public.employees
  set status = case when lower(coalesce(status, 'active')) = 'active' then 'inactive' else status end,
      office_id = p_destination_office_id,
      updated_at = v_now
  where company_id = p_company_id
    and office_id = any(p_source_office_ids)
    and office_id <> p_destination_office_id;

  insert into public.security_events(company_id, office_id, user_id, event_type, severity, metadata)
  select p_company_id,
         source_id,
         p_admin_user_id,
         'office_merged_retired',
         'warning',
         jsonb_build_object(
           'merged_into_office_id', p_destination_office_id,
           'merged_into_office_name', v_destination_name,
           'retired_at', v_now
         )
  from unnest(p_source_office_ids) as source_id
  where source_id <> p_destination_office_id;

  insert into public.audit_logs(company_id, office_id, actor_id, action, entity_type, entity_id, after_data)
  select p_company_id,
         source_id,
         p_admin_user_id,
         'office_retired_after_merge',
         'office',
         source_id,
         jsonb_build_object(
           'status', 'merged',
           'merged_into_office_id', p_destination_office_id,
           'merged_into_office_name', v_destination_name,
           'credentials_revoked', v_credential_count,
           'role_assignments_repointed', v_role_count
         )
  from unnest(p_source_office_ids) as source_id
  where source_id <> p_destination_office_id;

  return jsonb_build_object(
    'source_offices_retired', v_source_count,
    'office_users_inactivated', v_user_count,
    'credentials_revoked', v_credential_count,
    'role_assignments_repointed', v_role_count,
    'destination_office_id', p_destination_office_id,
    'destination_office_name', v_destination_name
  );
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
      where u.company_id = o.company_id
        and coalesce(lower(u.status), 'active') = 'active'
        and coalesce(lower(pc.status), 'active') = 'active'
        and coalesce(pc.is_locked, false) = false
        and pc.locked_at is null
        and (
          u.default_office_id = o.id
          or uor.office_id = o.id
          or uor.scope in ('company', 'headquarters')
          or uor.office_id is null
        )
    )
  order by o.office_name;
$$;

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
  v_collector record;
  v_office record;
  v_merged_office record;
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
    u.created_at
  into v_admin
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
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

    user_id := v_admin.id; email := v_admin.email; company_id := v_admin.company_id; office_id := null; full_name := 'Admin Account'; office_name := null; is_company_admin := true; auth_mode := 'admin'; redirect_to := '/office/admin'; login_status := 'success'; attempts_remaining := 3; locked := false;
    return next; return;
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
  left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
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

    user_id := v_collector.id; email := v_collector.email; company_id := v_collector.company_id; office_id := null; full_name := v_collector.full_name; office_name := null; is_company_admin := false; auth_mode := 'collector'; redirect_to := '/office/collector'; login_status := 'success'; attempts_remaining := 3; locked := false;
    return next; return;
  end if;

  with merged_matches as (
    select distinct
      u.id,
      u.email,
      u.company_id,
      coalesce(u.default_office_id, uor.office_id, e.office_id) as resolved_office_id,
      coalesce(u.full_name, e.full_name) as full_name,
      pc.id as credential_id,
      coalesce(dest.office_name, dest.name, 'new office account') as destination_office_name,
      o.office_name,
      u.created_at
    from public.users u
    left join public.pin_credentials pc on pc.user_id = u.id
    left join public.employees e on e.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    left join public.roles r on r.id = uor.role_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id, e.office_id)
    left join public.offices dest on dest.id = o.merged_into_office_id
    where coalesce(u.default_office_id, uor.office_id, e.office_id) is not null
      and (
        lower(coalesce(o.status, 'active')) = 'merged'
        or (
          lower(coalesce(o.status, 'active')) in ('inactive', 'archived')
          and o.merged_into_office_id is not null
        )
      )
      and coalesce(r.key, 'office_manager') not in ('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector')
      and coalesce(e.employee_assignment_type, 'fixed_office') <> 'all_rounder'
      and (
        (
          pc.id is not null
          and pc.pin_hash = crypt(p_secret, pc.pin_hash)
        )
        or (
          pc.id is null
          and nullif(e.employee_pin, '') = p_secret
        )
      )
  )
  select * into v_merged_office
  from merged_matches
  order by created_at asc
  limit 1;

  if v_merged_office.id is not null then
    user_id := v_merged_office.id; email := null; company_id := v_merged_office.company_id; office_id := v_merged_office.resolved_office_id; full_name := v_merged_office.full_name; office_name := v_merged_office.destination_office_name; is_company_admin := false; auth_mode := 'office'; redirect_to := '/office'; login_status := 'merged_office'; attempts_remaining := 0; locked := true;
    return next; return;
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
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    left join public.roles r on r.id = uor.role_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id, e.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and o.merged_into_office_id is null
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

    select count(*)::integer into v_recent_failures
    from public.security_events
    where event_type = 'unified_login_failed'
      and created_at >= now() - interval '30 minutes'
      and coalesce(user_agent, '') = coalesce(p_user_agent, '');

    v_remaining := greatest(0, 3 - v_recent_failures);
    user_id := null; email := null; company_id := v_company_id; office_id := null; full_name := null; office_name := null; is_company_admin := false; auth_mode := null; redirect_to := null; login_status := case when v_remaining = 0 then 'invalid_limit' else 'invalid' end; attempts_remaining := v_remaining; locked := false;
    return next; return;
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
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    left join public.roles r on r.id = uor.role_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id, e.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(o.status), 'active') = 'active'
      and o.merged_into_office_id is null
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
  select * into v_office
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

  user_id := v_office.id; email := v_office.email; company_id := v_office.company_id; office_id := v_office.resolved_office_id; full_name := v_office.full_name; office_name := v_office.office_name; is_company_admin := false; auth_mode := 'office'; redirect_to := '/office'; login_status := 'success'; attempts_remaining := 3; locked := false;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_public_office_login_options() to anon, authenticated;
grant execute on function public.ddumba_v1_verify_unified_login(text, text) to anon, authenticated;
grant execute on function public.ddumba_v1_retire_merged_offices(uuid, uuid[], uuid, uuid) to authenticated, service_role;

do $$
declare
  v_company_id uuid;
  v_destination_id uuid;
  v_source_ids uuid[];
begin
  select company_id, id
    into v_company_id, v_destination_id
  from public.offices
  where lower(coalesce(office_name, name, '')) = lower('Entebbe Operations Office')
  order by created_at desc
  limit 1;

  select array_agg(id)
    into v_source_ids
  from public.offices
  where company_id = v_company_id
    and lower(coalesce(office_name, name, '')) in (lower('Kigungu Main Office'), lower('Kigungu Office'), lower('Lugonjo Office'))
    and id <> v_destination_id;

  if v_company_id is not null and v_destination_id is not null and coalesce(array_length(v_source_ids, 1), 0) > 0 then
    perform public.ddumba_v1_retire_merged_offices(v_company_id, v_source_ids, v_destination_id, null);
  end if;
end;
$$;
