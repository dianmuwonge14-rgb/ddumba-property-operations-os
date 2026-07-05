-- Phase 138: Employer rent contribution / tenant top-up tracking.
-- Additive only. No drops, deletes, resets, or balance rewrites.

create table if not exists public.tenant_rent_sponsors (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    lease_id uuid references public.leases(id) on delete set null,
    employer_name text not null,
    contact_person text,
    employer_phone text,
    payment_method text not null default 'bank_cheque'
        check (payment_method in ('bank_cheque', 'bank_transfer', 'cash', 'mobile_money', 'other')),
    covered_amount numeric(14, 2) not null default 0,
    tenant_top_up_amount numeric(14, 2) not null default 0,
    total_monthly_rent numeric(14, 2) not null default 0,
    cheque_reference text,
    notes text,
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_by uuid references public.users(id) on delete set null,
    updated_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table if exists public.collections
    add column if not exists payment_source text not null default 'tenant'
        check (payment_source in ('tenant', 'employer')),
    add column if not exists payer_name text,
    add column if not exists cheque_reference text,
    add column if not exists employer_expected_amount numeric(14, 2),
    add column if not exists tenant_top_up_expected numeric(14, 2),
    add column if not exists employer_balance_after numeric(14, 2),
    add column if not exists tenant_top_up_balance_after numeric(14, 2);

create unique index if not exists idx_tenant_rent_sponsors_one_active
    on public.tenant_rent_sponsors (company_id, tenant_id)
    where status = 'active';

create index if not exists idx_tenant_rent_sponsors_office_active
    on public.tenant_rent_sponsors (office_id, status);

create index if not exists idx_collections_payment_source_office_paid
    on public.collections (office_id, payment_source, paid_at);

create or replace function public.ddumba_touch_tenant_rent_sponsors_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_tenant_rent_sponsors_updated_at on public.tenant_rent_sponsors;
create trigger trg_tenant_rent_sponsors_updated_at
before update on public.tenant_rent_sponsors
for each row execute function public.ddumba_touch_tenant_rent_sponsors_updated_at();

alter table public.tenant_rent_sponsors enable row level security;

drop policy if exists tenant_rent_sponsors_read on public.tenant_rent_sponsors;
create policy tenant_rent_sponsors_read
on public.tenant_rent_sponsors
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists tenant_rent_sponsors_insert on public.tenant_rent_sponsors;
create policy tenant_rent_sponsors_insert
on public.tenant_rent_sponsors
for insert
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists tenant_rent_sponsors_update on public.tenant_rent_sponsors;
create policy tenant_rent_sponsors_update
on public.tenant_rent_sponsors
for update
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
)
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
);
