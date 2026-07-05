-- Single-roundtrip room lookup for high-volume Payments Entry.

create or replace function public.lookup_payment_room_fast(
    p_company_id uuid,
    p_office_id uuid,
    p_room_number text,
    p_payment_month date,
    p_search_all boolean default false
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
    lease_id uuid,
    lease_monthly_rent numeric,
    lease_office_id uuid,
    lease_property_id uuid,
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
set search_path = public
as $$
    with matched_rooms as (
        select r.*
        from public.rooms r
        where r.company_id = p_company_id
          and (p_search_all or r.office_id = p_office_id)
          and (
            lower(trim(r.room_number)) = lower(trim(p_room_number))
            or lower(trim(r.room_number)) like lower(trim(p_room_number)) || '%'
          )
        order by
          case when lower(trim(r.room_number)) = lower(trim(p_room_number)) then 0 else 1 end,
          r.room_number
        limit case when p_search_all then 20 else 5 end
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
            coalesce(sum(a.amount_allocated) filter (
                where a.allocation_type = 'current_month'
                  and date_trunc('month', a.allocation_month)::date = date_trunc('month', p_payment_month)::date
            ), 0) as current_month_paid,
            coalesce(sum(a.amount_allocated) filter (
                where a.allocation_type = 'advance_month'
                  and a.allocation_month >= (date_trunc('month', p_payment_month)::date + interval '1 month')::date
            ), 0) as advance_rent_balance,
            coalesce(jsonb_agg(
                jsonb_build_object(
                    'month', a.allocation_month,
                    'amount', a.amount_allocated
                )
                order by a.allocation_month
            ) filter (
                where a.allocation_type = 'advance_month'
                  and a.allocation_month >= (date_trunc('month', p_payment_month)::date + interval '1 month')::date
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
        l.id as lease_id,
        l.monthly_rent as lease_monthly_rent,
        l.office_id as lease_office_id,
        l.property_id as lease_property_id,
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
    left join latest_collections c on c.tenant_id = t.id
    left join allocation_summary a on a.tenant_id = t.id;
$$;

grant execute on function public.lookup_payment_room_fast(uuid, uuid, text, date, boolean) to authenticated, service_role;
