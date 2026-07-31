-- Phase 234: Active defaulters must be active tenants in occupied rooms only.

create index if not exists idx_defaulters_active_occupied_rooms
    on public.rooms(company_id, office_id, landlord_id, property_id, id)
    where status = 'occupied';

create index if not exists idx_defaulters_active_tenant_status
    on public.tenants(company_id, office_id, room_id, id, balance)
    where status = 'active' and coalesce(balance, 0) > 0;

create index if not exists idx_defaulters_active_lease_current
    on public.leases(company_id, office_id, tenant_id, room_id, id)
    where status = 'active' and end_date is null;

create or replace view public.live_defaulter_reconciliation as
select
    live.company_id,
    live.office_id,
    count(*)::bigint as qualifying_accounts,
    coalesce(sum(live.outstanding_balance), 0)::numeric as total_outstanding
from (
    select
        t.company_id,
        coalesce(l.office_id, r.office_id, t.office_id) as office_id,
        t.id as account_id,
        (case when t.balance is not null then t.balance else coalesce(r.outstanding_balance, 0) end)::numeric as outstanding_balance
    from public.tenants t
    join public.leases l
        on l.company_id = t.company_id
       and l.tenant_id = t.id
       and l.status = 'active'
       and (l.end_date is null or l.end_date >= current_date)
    join public.rooms r
        on r.id = l.room_id
       and r.company_id = t.company_id
       and r.status = 'occupied'
    where t.status = 'active'
      and (case when t.balance is not null then t.balance else coalesce(r.outstanding_balance, 0) end) > 0
) live
group by live.company_id, live.office_id;
