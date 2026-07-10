-- Add exact move-in coverage metadata for New Tenant entry-payment allocations.
-- Additive only. Existing allocation readers continue to work with allocation_month.

alter table public.tenant_rent_allocations
    add column if not exists coverage_start date,
    add column if not exists coverage_end date,
    add column if not exists coverage_index integer not null default 0,
    add column if not exists remaining_credit numeric(14,2) not null default 0,
    add column if not exists source_lease_id uuid references public.leases(id) on delete set null;

create index if not exists idx_tenant_rent_allocations_coverage
    on public.tenant_rent_allocations(company_id, tenant_id, room_id, coverage_start, coverage_end);

create index if not exists idx_tenant_rent_allocations_source_lease
    on public.tenant_rent_allocations(company_id, source_lease_id, allocation_month);
