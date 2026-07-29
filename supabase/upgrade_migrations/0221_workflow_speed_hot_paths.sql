-- Hot-path performance for room search, payment recording, and room vacating.
-- Additive and scoped: no payment, balance, receipt, vacate, or permission rules are changed.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_rooms_company_office_status_room_upper_prefix
    on public.rooms(company_id, office_id, status, (upper(regexp_replace(coalesce(room_number, ''), '\s+', '', 'g'))) text_pattern_ops);

create index if not exists idx_rooms_company_status_room_upper_prefix
    on public.rooms(company_id, status, (upper(regexp_replace(coalesce(room_number, ''), '\s+', '', 'g'))) text_pattern_ops);

create index if not exists idx_leases_active_tenant_company
    on public.leases(company_id, tenant_id, status, room_id)
    where status = 'active';

create index if not exists idx_leases_active_room_company
    on public.leases(company_id, room_id, status, tenant_id)
    where status = 'active';

create index if not exists idx_tenant_ledger_latest_balance
    on public.tenant_ledger_entries(company_id, tenant_id, created_at desc);

create index if not exists idx_collections_hot_tenant_date
    on public.collections(company_id, tenant_id, payment_date, created_at desc);

create index if not exists idx_collections_hot_room_date
    on public.collections(company_id, room_id, payment_date, created_at desc);

create index if not exists idx_payment_receipts_payment_fast
    on public.payment_receipts(company_id, payment_id, payment_type, created_at desc);

create index if not exists idx_tenant_exit_records_hot_room_date
    on public.tenant_exit_records(company_id, room_id, vacate_date desc, created_at desc);

create index if not exists idx_vacated_tenant_debts_hot_tenant
    on public.vacated_tenant_debts(company_id, tenant_id, room_id, recovery_status);

create index if not exists idx_landlord_debt_deductions_hot_source
    on public.landlord_debt_deductions(company_id, vacated_tenant_debt_id, landlord_id, status);

create or replace function public.search_payment_rooms_lightweight(
    p_company_id uuid,
    p_office_id uuid,
    p_query text,
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
            upper(regexp_replace(trim(coalesce(p_query, '')), '\s+', '', 'g')) as q_room,
            lower(trim(coalesce(p_query, ''))) as q_text,
            regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as q_digits,
            greatest(1, least(coalesce(p_limit, 10), 20)) as result_limit
    ),
    room_candidates as (
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
            case
                when upper(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) = (select q_room from search_input) then 0
                when upper(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like (select q_room from search_input) || '%' then 1
                when upper(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like '%' || (select q_room from search_input) || '%' then 2
                else 20
            end as match_rank
        from public.rooms r
        join public.tenants t
          on t.company_id = r.company_id
         and t.room_id = r.id
         and t.status = 'active'
        left join public.leases l
          on l.company_id = r.company_id
         and l.room_id = r.id
         and l.tenant_id = t.id
         and l.status = 'active'
        left join public.offices o on o.id = r.office_id
        left join public.properties p on p.id = r.property_id
        left join public.landlords ld on ld.id = coalesce(r.landlord_id, p.landlord_id)
        where r.company_id = p_company_id
          and (p_search_all or r.office_id = p_office_id)
          and lower(coalesce(r.status, '')) in ('occupied', 'active')
          and (
            upper(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like (select q_room from search_input) || '%'
            or upper(regexp_replace(coalesce(r.room_number, ''), '\s+', '', 'g')) like '%' || (select q_room from search_input) || '%'
          )
        order by match_rank, length(coalesce(r.room_number, '')), r.room_number, t.full_name
        limit (select result_limit from search_input)
    ),
    room_match_count as (
        select count(*) as total from room_candidates
    ),
    person_candidates as (
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
            case
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
        left join public.leases l
          on l.company_id = r.company_id
         and l.room_id = r.id
         and l.tenant_id = t.id
         and l.status = 'active'
        left join public.offices o on o.id = r.office_id
        left join public.properties p on p.id = r.property_id
        left join public.landlords ld on ld.id = coalesce(r.landlord_id, p.landlord_id)
        where r.company_id = p_company_id
          and (p_search_all or r.office_id = p_office_id)
          and lower(coalesce(r.status, '')) in ('occupied', 'active')
          and (select total from room_match_count) = 0
          and (
            (
                (select q_digits from search_input) <> ''
                and regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') like '%' || (select q_digits from search_input) || '%'
            )
            or lower(trim(coalesce(t.full_name, ''))) like (select q_text from search_input) || '%'
            or lower(trim(coalesce(t.full_name, ''))) like '%' || (select q_text from search_input) || '%'
          )
        order by match_rank, length(coalesce(r.room_number, '')), r.room_number, t.full_name
        limit (select result_limit from search_input)
    ),
    candidates as (
        select * from room_candidates
        union all
        select * from person_candidates
    )
    select
        c.room_id,
        c.room_number,
        c.room_monthly_rent,
        c.room_outstanding_balance,
        c.room_office_id,
        c.room_property_id,
        c.room_landlord_id,
        c.tenant_id,
        c.tenant_name,
        c.tenant_phone,
        c.tenant_balance,
        c.tenant_monthly_rent,
        c.tenant_office_id,
        c.tenant_property_id,
        c.tenant_billing_day,
        c.tenant_created_at,
        c.lease_id,
        c.lease_start_date,
        c.lease_billing_day,
        c.lease_monthly_rent,
        c.lease_office_id,
        c.lease_property_id,
        c.office_id,
        c.office_name,
        c.landlord_id,
        c.landlord_name,
        0::numeric as last_amount_paid,
        0::numeric as balance_before_last_payment,
        0::numeric as balance_after_last_payment,
        0::numeric as used_to_clear_outstanding,
        0::numeric as allocated_to_next_month,
        0::numeric as current_month_paid,
        0::numeric as advance_rent_balance,
        '[]'::jsonb as advance_months
    from candidates c
    order by c.match_rank, length(coalesce(c.room_number, '')), c.room_number, c.tenant_name
    limit (select result_limit from search_input);
$$;

grant execute on function public.search_payment_rooms_lightweight(uuid, uuid, text, boolean, integer) to authenticated, service_role;
