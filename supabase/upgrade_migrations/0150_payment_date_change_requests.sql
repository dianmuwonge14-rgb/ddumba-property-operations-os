-- Phase 150: Tenant payment date change approval workflow.
-- Additive only. Offices request corrections; Admin approves/rejects before live payment dates change.

create table if not exists public.payment_date_change_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    payment_id uuid not null references public.collections(id) on delete cascade,
    room_id uuid references public.rooms(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    original_payment_date date not null,
    requested_payment_date date not null,
    reason text not null,
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected')),
    requested_by uuid references public.users(id) on delete set null,
    reviewed_by uuid references public.users(id) on delete set null,
    reviewed_at timestamptz,
    admin_comment text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_payment_date_change_requests_one_pending
    on public.payment_date_change_requests (payment_id)
    where status = 'pending';

create index if not exists idx_payment_date_change_requests_company_status
    on public.payment_date_change_requests (company_id, status, created_at desc);

create index if not exists idx_payment_date_change_requests_office_status
    on public.payment_date_change_requests (office_id, status, created_at desc);

create index if not exists idx_payment_date_change_requests_payment
    on public.payment_date_change_requests (payment_id, created_at desc);

create index if not exists idx_payment_date_change_requests_tenant
    on public.payment_date_change_requests (tenant_id, created_at desc);

create or replace function public.ddumba_touch_payment_date_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_payment_date_change_requests_updated_at on public.payment_date_change_requests;
create trigger trg_payment_date_change_requests_updated_at
before update on public.payment_date_change_requests
for each row execute function public.ddumba_touch_payment_date_change_requests_updated_at();

alter table public.payment_date_change_requests enable row level security;

drop policy if exists payment_date_change_requests_read on public.payment_date_change_requests;
create policy payment_date_change_requests_read
on public.payment_date_change_requests
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

drop policy if exists payment_date_change_requests_insert on public.payment_date_change_requests;
create policy payment_date_change_requests_insert
on public.payment_date_change_requests
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists payment_date_change_requests_admin_update on public.payment_date_change_requests;
create policy payment_date_change_requests_admin_update
on public.payment_date_change_requests
for update
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);
