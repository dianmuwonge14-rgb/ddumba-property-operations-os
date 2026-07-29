-- Production hotfix: authoritative room-number search and canonical credential validation.
-- This migration does not alter payments, balances, receipts, or tenant data.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_rooms_company_office_normalized_room_prefix
    on public.rooms(company_id, office_id, lower(regexp_replace(coalesce(room_number, ''), '\s+', '', 'g')) text_pattern_ops);

create index if not exists idx_rooms_company_normalized_room_prefix
    on public.rooms(company_id, lower(regexp_replace(coalesce(room_number, ''), '\s+', '', 'g')) text_pattern_ops);

create index if not exists idx_tenants_company_status_phone_digits
    on public.tenants(company_id, status, (regexp_replace(coalesce(phone, ''), '\D', '', 'g')))
    where status = 'active';

create index if not exists idx_tenants_company_status_room
    on public.tenants(company_id, status, room_id)
    where status = 'active';

create index if not exists idx_tenants_company_status_name_trgm
    on public.tenants using gin (lower(trim(coalesce(full_name, ''))) gin_trgm_ops)
    where status = 'active';

alter table public.pin_credentials
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_at timestamptz,
  add column if not exists is_locked boolean not null default false,
  add column if not exists reset_by_admin uuid references public.users(id) on delete set null,
  add column if not exists reset_at timestamptz,
  add column if not exists admin_visible_pin text;

update public.pin_credentials
set admin_visible_pin = null
where admin_visible_pin is not null;

with ranked_credentials as (
    select
        id,
        row_number() over (
            partition by user_id
            order by
                case when lower(coalesce(status, 'active')) = 'active' and coalesce(is_locked, false) = false then 0 else 1 end,
                updated_at desc nulls last,
                created_at desc nulls last,
                id desc
        ) as rn
    from public.pin_credentials
    where lower(coalesce(status, 'active')) in ('active', 'locked')
)
update public.pin_credentials pc
set
    status = 'revoked',
    is_locked = true,
    locked_at = coalesce(pc.locked_at, now()),
    updated_at = now()
from ranked_credentials ranked
where pc.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists idx_pin_credentials_one_unlocked_active_per_user
    on public.pin_credentials(user_id)
    where lower(coalesce(status, 'active')) = 'active'
      and coalesce(is_locked, false) = false;

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
  v_user public.users%rowtype;
  v_status text := coalesce(nullif(lower(trim(p_status)), ''), 'active');
  v_credential_id uuid;
begin
  if coalesce(length(trim(p_pin)), 0) < 4 then
    raise exception 'PIN/password must be at least 4 characters.' using errcode = '22023';
  end if;

  if v_status not in ('active', 'locked', 'revoked', 'expired') then
    raise exception 'Invalid credential status.' using errcode = '22023';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id;

  if v_user.id is null then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  select id into v_credential_id
  from public.pin_credentials
  where user_id = p_user_id
  order by
    case when lower(coalesce(status, 'active')) = 'active' and coalesce(is_locked, false) = false then 0 else 1 end,
    updated_at desc nulls last,
    created_at desc nulls last,
    id desc
  limit 1;

  if v_credential_id is not null then
    update public.pin_credentials
    set
      status = 'revoked',
      is_locked = true,
      locked_at = coalesce(locked_at, now()),
      updated_at = now()
    where user_id = p_user_id
      and id <> v_credential_id;

    update public.pin_credentials
    set
      company_id = v_user.company_id,
      pin_hash = crypt(p_pin, gen_salt('bf')),
      admin_visible_pin = null,
      status = v_status,
      failed_attempts = 0,
      failed_login_attempts = 0,
      is_locked = v_status = 'locked',
      locked_at = case when v_status = 'locked' then now() else null end,
      reset_at = now(),
      updated_at = now()
    where id = v_credential_id;

    return;
  end if;

  insert into public.pin_credentials(
    company_id,
    user_id,
    pin_hash,
    admin_visible_pin,
    status,
    failed_attempts,
    failed_login_attempts,
    is_locked,
    locked_at,
    reset_at,
    updated_at
  )
  values (
    v_user.company_id,
    p_user_id,
    crypt(p_pin, gen_salt('bf')),
    null,
    v_status,
    0,
    0,
    v_status = 'locked',
    case when v_status = 'locked' then now() else null end,
    now(),
    now()
  );
end;
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

grant execute on function public.ddumba_v1_set_pin_credential(uuid, text, text) to authenticated, service_role;
grant execute on function public.ddumba_v1_verify_unified_login(text, text) to anon, authenticated;

create or replace function public.search_payment_tenants_fast(
    p_company_id uuid,
    p_office_id uuid,
    p_query text,
    p_payment_month date,
    p_search_all boolean default false,
    p_limit integer default 10
)
returns table (
    room_id uuid,
    room_number text,
    room_monthly_rent numeric,
    room_outstanding_balance numeric,
    room_office_id uuid,
    room_property_id uuid,
    room_landlord_id uuid,
    tenant_id uuid,
    tenant_name text,
    tenant_phone text,
    tenant_balance numeric,
    tenant_monthly_rent numeric,
    tenant_office_id uuid,
    tenant_property_id uuid,
    tenant_billing_day int,
    tenant_created_at timestamptz,
    lease_id uuid,
    lease_start_date date,
    lease_billing_day int,
    lease_monthly_rent numeric,
    lease_office_id uuid,
    lease_property_id uuid,
    office_id uuid,
    office_name text,
    landlord_id uuid,
    landlord_name text,
    last_amount_paid numeric,
    balance_before_last_payment numeric,
    balance_after_last_payment numeric,
    used_to_clear_outstanding numeric,
    allocated_to_next_month numeric,
    current_month_paid numeric,
    advance_rent_balance numeric,
    advance_months jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $$
    with search_input as (
        select
            lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', '', 'g')) as q_room,
            lower(trim(coalesce(p_query, ''))) as q_text,
            regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as q_digits,
            greatest(1, least(coalesce(p_limit, 10), 20)) as result_limit
    ),
    candidate_rows as (
        select
            r.*,
            t.id as matched_tenant_id,
            t.full_name as matched_tenant_name,
            case
                when lower(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) = (select q_room from search_input) then 0
                when lower(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like (select q_room from search_input) || '%' then 1
                when lower(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like '%' || (select q_room from search_input) || '%' then 2
                when (select q_digits from search_input) <> '' and regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') like (select q_digits from search_input) || '%' then 3
                when (select q_digits from search_input) <> '' and regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') like '%' || (select q_digits from search_input) || '%' then 4
                when lower(trim(coalesce(t.full_name, ''))) like (select q_text from search_input) || '%' then 5
                when lower(trim(coalesce(t.full_name, ''))) like '%' || (select q_text from search_input) || '%' then 6
                else 20
            end as match_rank
        from public.rooms r
        join public.tenants t
          on t.company_id = r.company_id
         and t.room_id = r.id
         and t.status = 'active'
        where r.company_id = p_company_id
          and (p_search_all or r.office_id = p_office_id)
          and lower(coalesce(r.status, '')) in ('occupied', 'active')
          and (
            lower(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like (select q_room from search_input) || '%'
            or lower(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like '%' || (select q_room from search_input) || '%'
            or (
                (select q_digits from search_input) <> ''
                and regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') like '%' || (select q_digits from search_input) || '%'
            )
            or lower(trim(coalesce(t.full_name, ''))) like (select q_text from search_input) || '%'
            or lower(trim(coalesce(t.full_name, ''))) like '%' || (select q_text from search_input) || '%'
          )
    ),
    room_match_count as (
        select count(*) as total
        from candidate_rows
        where match_rank <= 2
    ),
    ranked_candidates as (
        select c.*
        from candidate_rows c
        cross join room_match_count m
        where c.match_rank <= 2 or m.total = 0
        order by c.match_rank, length(coalesce(c.room_number, '')), c.room_number, c.matched_tenant_name
        limit (select result_limit from search_input)
    ),
    matched_rooms as (
        select distinct on (id) *
        from ranked_candidates
        order by id, match_rank
    ),
    active_tenants as (
        select distinct on (t.room_id) t.*
        from public.tenants t
        join matched_rooms r on r.id = t.room_id
        where t.company_id = p_company_id
          and t.status = 'active'
        order by t.room_id, t.updated_at desc nulls last, t.created_at desc nulls last
    ),
    active_leases as (
        select distinct on (l.room_id) l.*
        from public.leases l
        join matched_rooms r on r.id = l.room_id
        where l.company_id = p_company_id
          and l.status = 'active'
        order by l.room_id, l.start_date desc nulls last, l.created_at desc nulls last
    ),
    latest_collections as (
        select distinct on (c.tenant_id) c.*
        from public.collections c
        join active_tenants t on t.id = c.tenant_id
        where c.company_id = p_company_id
          and coalesce(c.status, '') not in ('voided', 'removed_by_admin_approval')
        order by c.tenant_id, c.payment_date desc nulls last, c.created_at desc nulls last
    ),
    allocation_summary as (
        select
            a.tenant_id,
            coalesce(sum(greatest(0, a.amount_allocated - coalesce(a.consumed_by_balance_reconciliation, 0))) filter (
                where a.allocation_type = 'current_month'
                  and date_trunc('month', a.allocation_month)::date = date_trunc('month', p_payment_month)::date
            ), 0) as current_month_paid,
            coalesce(sum(greatest(0, a.amount_allocated - coalesce(a.consumed_by_balance_reconciliation, 0))) filter (
                where a.allocation_type = 'advance_month'
                  and a.allocation_month >= (date_trunc('month', p_payment_month)::date + interval '1 month')::date
            ), 0) as advance_rent_balance,
            coalesce(jsonb_agg(
                jsonb_build_object(
                    'month', a.allocation_month,
                    'amount', greatest(0, a.amount_allocated - coalesce(a.consumed_by_balance_reconciliation, 0)),
                    'coverage_start', a.coverage_start,
                    'coverage_end', a.coverage_end
                )
                order by a.allocation_month
            ) filter (
                where a.allocation_type = 'advance_month'
                  and a.allocation_month >= (date_trunc('month', p_payment_month)::date + interval '1 month')::date
                  and a.amount_allocated > coalesce(a.consumed_by_balance_reconciliation, 0)
            ), '[]'::jsonb) as advance_months
        from public.tenant_rent_allocations a
        join active_tenants t on t.id = a.tenant_id
        where a.company_id = p_company_id
        group by a.tenant_id
    )
    select
        r.id as room_id,
        r.room_number,
        r.monthly_rent as room_monthly_rent,
        r.outstanding_balance as room_outstanding_balance,
        r.office_id as room_office_id,
        r.property_id as room_property_id,
        r.landlord_id as room_landlord_id,
        t.id as tenant_id,
        t.full_name as tenant_name,
        t.phone as tenant_phone,
        t.balance as tenant_balance,
        t.monthly_rent as tenant_monthly_rent,
        t.office_id as tenant_office_id,
        t.property_id as tenant_property_id,
        coalesce(t.billing_day, l.billing_day, 1) as tenant_billing_day,
        t.created_at as tenant_created_at,
        l.id as lease_id,
        l.start_date as lease_start_date,
        coalesce(l.billing_day, t.billing_day, 1) as lease_billing_day,
        l.monthly_rent as lease_monthly_rent,
        l.office_id as lease_office_id,
        l.property_id as lease_property_id,
        o.id as office_id,
        coalesce(o.office_name, o.name) as office_name,
        coalesce(r.landlord_id, p.landlord_id) as landlord_id,
        ld.full_name as landlord_name,
        coalesce(c.amount_paid, c.amount, 0) as last_amount_paid,
        coalesce(c.balance_before_payment, c.expected_amount, 0) as balance_before_last_payment,
        coalesce(c.balance_after_payment, c.balance, 0) as balance_after_last_payment,
        coalesce(c.used_to_clear_outstanding, 0) as used_to_clear_outstanding,
        coalesce(c.allocated_to_next_month, 0) as allocated_to_next_month,
        coalesce(a.current_month_paid, 0) as current_month_paid,
        coalesce(a.advance_rent_balance, 0) as advance_rent_balance,
        coalesce(a.advance_months, '[]'::jsonb) as advance_months
    from matched_rooms r
    join active_tenants t on t.room_id = r.id
    left join active_leases l on l.room_id = r.id and l.tenant_id = t.id
    left join public.offices o on o.id = r.office_id
    left join public.properties p on p.id = r.property_id
    left join public.landlords ld on ld.id = coalesce(r.landlord_id, p.landlord_id)
    left join latest_collections c on c.tenant_id = t.id
    left join allocation_summary a on a.tenant_id = t.id
    order by r.match_rank, length(coalesce(r.room_number, '')), r.room_number, t.full_name;
$$;

grant execute on function public.search_payment_tenants_fast(uuid, uuid, text, date, boolean, integer) to authenticated, service_role;
