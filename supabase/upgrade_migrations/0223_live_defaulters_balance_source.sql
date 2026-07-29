-- Phase 223: Live defaulters source of truth and reconciliation support.

create index if not exists idx_defaulters_tenants_live_balance_scope
    on public.tenants(company_id, office_id, status, balance)
    where coalesce(balance, 0) > 0;

create index if not exists idx_defaulters_tenants_room_billing
    on public.tenants(company_id, room_id, billing_day, status);

create index if not exists idx_defaulters_rooms_live_balance_scope
    on public.rooms(company_id, office_id, landlord_id, property_id, status, outstanding_balance)
    where coalesce(outstanding_balance, 0) > 0;

create index if not exists idx_defaulters_rooms_normalized_room_number
    on public.rooms(company_id, office_id, lower(regexp_replace(coalesce(room_number, ''), '\s+', '', 'g')));

create index if not exists idx_defaulters_tenants_normalized_phone
    on public.tenants(company_id, lower(regexp_replace(coalesce(phone, alternative_phone, ''), '\D+', '', 'g')));

create index if not exists idx_defaulters_leases_active_tenant_room
    on public.leases(company_id, office_id, tenant_id, room_id, billing_day)
    where status = 'active';

create index if not exists idx_defaulters_properties_landlord_lookup
    on public.rooms(company_id, landlord_id, property_id);

create index if not exists idx_defaulters_collections_last_payment
    on public.collections(company_id, tenant_id, office_id, payment_date desc, created_at desc);

create index if not exists idx_defaulters_promises_live_status
    on public.promises(company_id, tenant_id, office_id, promised_date, status);

create index if not exists idx_defaulters_collection_actions_last_followup
    on public.collection_actions(company_id, tenant_id, office_id, created_at desc);

create index if not exists idx_defaulters_vacated_debts_remaining
    on public.vacated_tenant_debts(company_id, office_id, landlord_id, room_id, tenant_id, remaining_amount)
    where coalesce(remaining_amount, 0) > 0;

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
    left join public.leases l
        on l.company_id = t.company_id
       and l.tenant_id = t.id
       and l.status = 'active'
    left join public.rooms r
        on r.id = coalesce(l.room_id, t.room_id)
    where coalesce(t.status, 'active') in ('active', 'occupied', 'current')
      and not (coalesce(r.status, 'occupied') ilike any (array['%vacant%', '%archiv%', '%delete%', '%inactive%']))
      and (case when t.balance is not null then t.balance else coalesce(r.outstanding_balance, 0) end) > 0

    union all

    select
        d.company_id,
        d.office_id,
        d.id as account_id,
        coalesce(d.remaining_amount, d.final_outstanding_balance, d.original_amount, 0)::numeric as outstanding_balance
    from public.vacated_tenant_debts d
    where coalesce(d.remaining_amount, d.final_outstanding_balance, d.original_amount, 0) > 0
) live
group by live.company_id, live.office_id;
