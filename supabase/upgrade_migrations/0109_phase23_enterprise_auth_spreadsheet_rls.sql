-- Phase 23: Enterprise PIN auth, account administration, spreadsheet reporting, and core office isolation.
-- Additive only: no table/column drops, data deletion, truncation, or resets.

create extension if not exists pgcrypto;

create index if not exists idx_ddumba_v1_users_company_default_office
  on public.users(company_id, default_office_id, status);

create index if not exists idx_ddumba_v1_pin_credentials_user_status
  on public.pin_credentials(user_id, status);

create index if not exists idx_ddumba_v1_security_events_company_office_created
  on public.security_events(company_id, office_id, created_at desc);

create index if not exists idx_ddumba_v1_collections_reporting
  on public.collections(company_id, office_id, paid_at desc, tenant_id);

create index if not exists idx_ddumba_v1_promises_reporting
  on public.promises(company_id, office_id, promised_date desc, tenant_id);

create index if not exists idx_ddumba_v1_expenses_reporting
  on public.expenses(company_id, office_id, expense_date desc, property_id);

create index if not exists idx_ddumba_v1_landlord_payments_reporting
  on public.landlord_payments(company_id, office_id, paid_at desc, landlord_id);

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
    and coalesce(lower(c.status), 'active') = 'active'
    and exists (
      select 1
      from public.users u
      join public.pin_credentials pc on pc.user_id = u.id
      left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = o.company_id
      where u.company_id = o.company_id
        and coalesce(lower(u.status), 'active') = 'active'
        and coalesce(lower(pc.status), 'active') = 'active'
        and (
          u.default_office_id = o.id
          or uor.office_id = o.id
          or uor.scope in ('company', 'headquarters')
          or uor.office_id is null
        )
    )
  order by o.office_name;
$$;

grant execute on function public.ddumba_v1_public_office_login_options() to anon, authenticated;

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
set search_path = public
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
set search_path = public
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

create or replace function public.ddumba_v1_tenant_access_office(p_tenant_id uuid, p_company_id uuid, p_office_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or exists (
      select 1
      from public.tenants t
      left join public.rooms r on r.id = t.room_id
      left join public.leases l on l.tenant_id = t.id and coalesce(lower(l.status), 'active') = 'active'
      where t.id = p_tenant_id
        and t.company_id = p_company_id
        and public.ddumba_v1_can_access_office(coalesce(t.office_id, r.office_id, l.office_id, p_office_id))
    );
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'properties','rooms','collections','promises','expenses','attendance_events','landlord_payments'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = tbl) then
      execute format('alter table public.%I enable row level security', tbl);

      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = 'ddumba_v1_' || tbl || '_office_read') then
        execute format('create policy %I on public.%I for select using (public.ddumba_v1_can_access_entity(company_id, office_id))', 'ddumba_v1_' || tbl || '_office_read', tbl);
      end if;

      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = 'ddumba_v1_' || tbl || '_office_insert') then
        execute format('create policy %I on public.%I for insert with check (public.ddumba_v1_can_access_entity(company_id, office_id))', 'ddumba_v1_' || tbl || '_office_insert', tbl);
      end if;

      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = 'ddumba_v1_' || tbl || '_office_update') then
        execute format('create policy %I on public.%I for update using (public.ddumba_v1_can_access_entity(company_id, office_id)) with check (public.ddumba_v1_can_access_entity(company_id, office_id))', 'ddumba_v1_' || tbl || '_office_update', tbl);
      end if;
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'landlords') then
    alter table public.landlords enable row level security;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlords' and policyname = 'ddumba_v1_landlords_resolved_office_read') then
      create policy ddumba_v1_landlords_resolved_office_read
        on public.landlords
        for select
        using (
          company_id = public.ddumba_v1_current_company_id()
          and (
            public.ddumba_v1_is_company_admin()
            or exists (
              select 1
              from public.property_landlords pl
              join public.properties p on p.id = pl.property_id
              where pl.landlord_id = landlords.id
                and p.company_id = landlords.company_id
                and public.ddumba_v1_can_access_office(p.office_id)
            )
            or exists (
              select 1
              from public.landlord_payments lp
              where lp.landlord_id = landlords.id
                and lp.company_id = landlords.company_id
                and public.ddumba_v1_can_access_office(lp.office_id)
            )
          )
        );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlords' and policyname = 'ddumba_v1_landlords_company_insert') then
      create policy ddumba_v1_landlords_company_insert
        on public.landlords
        for insert
        with check (
          company_id = public.ddumba_v1_current_company_id()
          and public.ddumba_v1_has_permission('landlords.manage')
        );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlords' and policyname = 'ddumba_v1_landlords_company_update') then
      create policy ddumba_v1_landlords_company_update
        on public.landlords
        for update
        using (
          company_id = public.ddumba_v1_current_company_id()
          and public.ddumba_v1_has_permission('landlords.manage')
        )
        with check (
          company_id = public.ddumba_v1_current_company_id()
          and public.ddumba_v1_has_permission('landlords.manage')
        );
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenants') then
    alter table public.tenants enable row level security;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenants' and policyname = 'ddumba_v1_tenants_resolved_office_read') then
      create policy ddumba_v1_tenants_resolved_office_read
        on public.tenants
        for select
        using (
          company_id = public.ddumba_v1_current_company_id()
          and public.ddumba_v1_tenant_access_office(id, company_id, office_id)
        );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenants' and policyname = 'ddumba_v1_tenants_resolved_office_insert') then
      create policy ddumba_v1_tenants_resolved_office_insert
        on public.tenants
        for insert
        with check (
          company_id = public.ddumba_v1_current_company_id()
          and public.ddumba_v1_can_access_office(office_id)
        );
    end if;
  end if;
end $$;
