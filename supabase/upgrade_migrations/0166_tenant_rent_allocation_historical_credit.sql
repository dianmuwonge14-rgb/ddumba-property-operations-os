-- Track imported/historical tenant rent credits separately from actual payment allocations.
-- This lets month status include amounts already paid before the last recorded payment
-- without overstating that last payment's allocation.

alter table public.tenant_rent_allocations
    add column if not exists allocation_source text not null default 'payment',
    add column if not exists is_historical_credit boolean not null default false;

create index if not exists idx_tenant_rent_allocations_historical_credit
    on public.tenant_rent_allocations(company_id, tenant_id, allocation_month, is_historical_credit);
