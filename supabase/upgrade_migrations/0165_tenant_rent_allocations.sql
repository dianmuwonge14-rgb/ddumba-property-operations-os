-- Tenant payment allocation ledger for arrears, current month, and advance rent.
-- Additive only. Existing collection rows remain unchanged.

create table if not exists public.tenant_rent_allocations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    room_id uuid references public.rooms(id) on delete set null,
    payment_id uuid not null references public.collections(id) on delete cascade,
    allocation_month date not null,
    allocation_type text not null check (allocation_type in ('arrears', 'current_month', 'advance_month')),
    amount_allocated numeric(14,2) not null check (amount_allocated > 0),
    created_at timestamptz not null default now()
);

create index if not exists idx_tenant_rent_allocations_payment
    on public.tenant_rent_allocations(company_id, payment_id, created_at);

create index if not exists idx_tenant_rent_allocations_tenant_month
    on public.tenant_rent_allocations(company_id, tenant_id, allocation_month, allocation_type);

create index if not exists idx_tenant_rent_allocations_office_month
    on public.tenant_rent_allocations(company_id, office_id, allocation_month);

alter table public.tenant_rent_allocations enable row level security;

drop policy if exists tenant_rent_allocations_read on public.tenant_rent_allocations;
create policy tenant_rent_allocations_read
on public.tenant_rent_allocations
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists tenant_rent_allocations_insert on public.tenant_rent_allocations;
create policy tenant_rent_allocations_insert
on public.tenant_rent_allocations
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_can_access_office(office_id)
    )
);
