-- Phase 186: Tenant outstanding balance adjustment workflow.
-- Additive only. Does not delete payment history or reset tenant balances.

create table if not exists public.tenant_balance_adjustments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    old_balance numeric(14,2) not null default 0,
    new_balance numeric(14,2) not null default 0,
    adjustment_amount numeric(14,2) not null default 0,
    effective_date date not null default current_date,
    reason text not null,
    notes text,
    status text not null default 'pending',
    requested_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    admin_comment text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tenant_balance_adjustments_status_check check (status in ('pending','approved','rejected','direct_admin_change'))
);

create index if not exists idx_tenant_balance_adjustments_company_status
    on public.tenant_balance_adjustments(company_id, status, created_at desc);

create index if not exists idx_tenant_balance_adjustments_office_status
    on public.tenant_balance_adjustments(company_id, office_id, status, created_at desc);

create index if not exists idx_tenant_balance_adjustments_room_tenant
    on public.tenant_balance_adjustments(company_id, room_id, tenant_id, created_at desc);

create or replace function public.ddumba_touch_tenant_balance_adjustments_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_tenant_balance_adjustments_updated_at on public.tenant_balance_adjustments;
create trigger trg_tenant_balance_adjustments_updated_at
before update on public.tenant_balance_adjustments
for each row execute function public.ddumba_touch_tenant_balance_adjustments_updated_at();

alter table public.tenant_balance_adjustments enable row level security;

drop policy if exists tenant_balance_adjustments_admin_all on public.tenant_balance_adjustments;
create policy tenant_balance_adjustments_admin_all
on public.tenant_balance_adjustments
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        tenant_balance_adjustments.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        tenant_balance_adjustments.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists tenant_balance_adjustments_office_read_insert on public.tenant_balance_adjustments;
create policy tenant_balance_adjustments_office_read_insert
on public.tenant_balance_adjustments
for all
using (
    public.ddumba_v1_can_access_entity(
        tenant_balance_adjustments.company_id,
        tenant_balance_adjustments.office_id
    )
)
with check (
    status = 'pending'
    and public.ddumba_v1_can_access_entity(
        tenant_balance_adjustments.company_id,
        tenant_balance_adjustments.office_id
    )
);
