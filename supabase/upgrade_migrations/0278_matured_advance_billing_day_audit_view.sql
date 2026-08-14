-- Keep matured-advance audits aligned with the tenant's current billing day.
-- Stale allocation coverage dates should not prevent an advance assigned to a
-- now-due allocation month from clearing that period.

create or replace view public.tenant_matured_advance_mismatches as
with active_tenants as (
    select
        t.*,
        coalesce(l.billing_day, t.billing_day, 1) as effective_billing_day
    from public.tenants t
    left join lateral (
        select billing_day
        from public.leases l
        where l.company_id = t.company_id
          and l.tenant_id = t.id
          and l.status = 'active'
        order by l.start_date desc nulls last, l.created_at desc nulls last
        limit 1
    ) l on true
    where lower(coalesce(t.status, 'active')) = 'active'
),
available_advance as (
    select
        a.company_id,
        a.office_id,
        a.tenant_id,
        a.room_id,
        coalesce(sum(greatest(0, coalesce(a.amount_allocated, 0) - coalesce(a.consumed_by_balance_reconciliation, 0))) filter (
            where public.ddumba_billing_date_for_month(
                extract(year from a.allocation_month)::int,
                extract(month from a.allocation_month)::int,
                least(31, greatest(1, coalesce(t.effective_billing_day, 1)))
            ) <= ((now() at time zone 'Africa/Kampala')::date)
        ), 0) as matured_advance,
        coalesce(sum(greatest(0, coalesce(a.amount_allocated, 0) - coalesce(a.consumed_by_balance_reconciliation, 0))) filter (
            where public.ddumba_billing_date_for_month(
                extract(year from a.allocation_month)::int,
                extract(month from a.allocation_month)::int,
                least(31, greatest(1, coalesce(t.effective_billing_day, 1)))
            ) > ((now() at time zone 'Africa/Kampala')::date)
        ), 0) as future_advance
    from public.tenant_rent_allocations a
    join active_tenants t
      on t.company_id = a.company_id
     and t.id = a.tenant_id
    where a.allocation_type = 'advance_month'
      and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0)
    group by a.company_id, a.office_id, a.tenant_id, a.room_id
),
periods as (
    select
        m.company_id,
        m.tenant_id,
        m.room_id,
        coalesce(sum(greatest(0, coalesce(m.outstanding_amount, 0))) filter (
            where coalesce(m.coverage_start, m.due_date, m.rent_month) <= ((now() at time zone 'Africa/Kampala')::date)
        ), 0) as due_period_outstanding
    from public.tenant_rent_months m
    where lower(coalesce(m.status, 'unpaid')) not in ('cancelled','canceled','voided','deleted','reversed')
    group by m.company_id, m.tenant_id, m.room_id
)
select
    t.company_id,
    coalesce(t.office_id, r.office_id, aa.office_id) as office_id,
    t.id as tenant_id,
    t.full_name as tenant_name,
    t.room_id,
    r.room_number,
    coalesce(t.balance, 0)::numeric as tenant_balance,
    coalesce(r.outstanding_balance, 0)::numeric as room_outstanding_balance,
    coalesce(p.due_period_outstanding, 0)::numeric as due_period_outstanding,
    coalesce(aa.matured_advance, 0)::numeric as matured_advance,
    coalesce(aa.future_advance, 0)::numeric as future_advance,
    greatest(0, coalesce(p.due_period_outstanding, 0) - coalesce(aa.matured_advance, 0))::numeric as expected_due_after_consumption
from active_tenants t
left join public.rooms r
  on r.company_id = t.company_id
 and r.id = t.room_id
left join available_advance aa
  on aa.company_id = t.company_id
 and aa.tenant_id = t.id
left join periods p
  on p.company_id = t.company_id
 and p.tenant_id = t.id
where (
    coalesce(aa.matured_advance, 0) > 0
    or abs(coalesce(t.balance, 0) - coalesce(p.due_period_outstanding, 0)) > 0.004
    or abs(coalesce(r.outstanding_balance, 0) - coalesce(p.due_period_outstanding, 0)) > 0.004
);

grant select on public.tenant_matured_advance_mismatches to authenticated, service_role;
