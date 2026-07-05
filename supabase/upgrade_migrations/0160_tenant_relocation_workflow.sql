-- Tenant relocation workflow.
-- Safe additive migration: creates request/history storage plus fast indexes.

create table if not exists public.tenant_relocation_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    old_room_id uuid not null references public.rooms(id) on delete restrict,
    new_room_id uuid not null references public.rooms(id) on delete restrict,
    old_landlord_id uuid references public.landlords(id) on delete set null,
    new_landlord_id uuid references public.landlords(id) on delete set null,
    old_lease_id uuid references public.leases(id) on delete set null,
    new_lease_id uuid references public.leases(id) on delete set null,
    old_rent numeric(14,2) not null default 0,
    new_rent numeric(14,2) not null default 0,
    rent_difference numeric(14,2) not null default 0,
    relocation_date date not null,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    reason text,
    admin_comment text,
    requested_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    rejected_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_relocation_requests_company_status_created
    on public.tenant_relocation_requests(company_id, status, created_at desc);

create index if not exists idx_tenant_relocation_requests_company_office_status_created
    on public.tenant_relocation_requests(company_id, office_id, status, created_at desc);

create index if not exists idx_tenant_relocation_requests_tenant_created
    on public.tenant_relocation_requests(company_id, tenant_id, created_at desc);

create index if not exists idx_tenant_relocation_requests_old_new_rooms
    on public.tenant_relocation_requests(company_id, old_room_id, new_room_id, created_at desc);

alter table public.tenant_relocation_requests enable row level security;

drop policy if exists tenant_relocation_requests_admin_all on public.tenant_relocation_requests;
create policy tenant_relocation_requests_admin_all
on public.tenant_relocation_requests
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        tenant_relocation_requests.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        tenant_relocation_requests.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists tenant_relocation_requests_office_read_insert on public.tenant_relocation_requests;
create policy tenant_relocation_requests_office_read_insert
on public.tenant_relocation_requests
for all
using (
    public.ddumba_v1_can_access_entity(
        tenant_relocation_requests.company_id,
        tenant_relocation_requests.office_id
    )
)
with check (
    status = 'pending'
    and public.ddumba_v1_can_access_entity(
        tenant_relocation_requests.company_id,
        tenant_relocation_requests.office_id
    )
);
