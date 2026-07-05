-- Phase 151: Full tenant payment correction approval workflow.
-- Additive only. Office users request corrections; Admin approval is required before payment rows change.

create table if not exists public.payment_correction_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    payment_id uuid not null references public.collections(id) on delete cascade,
    room_id uuid references public.rooms(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    correction_type text not null check (correction_type in ('date_change', 'amount_change', 'room_change')),
    original_payment_date date,
    requested_payment_date date,
    original_amount numeric(14, 2),
    requested_amount numeric(14, 2),
    original_room_id uuid references public.rooms(id) on delete set null,
    requested_room_id uuid references public.rooms(id) on delete set null,
    original_tenant_id uuid references public.tenants(id) on delete set null,
    requested_tenant_id uuid references public.tenants(id) on delete set null,
    original_value jsonb not null default '{}'::jsonb,
    requested_value jsonb not null default '{}'::jsonb,
    reason text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    requested_by uuid references public.users(id) on delete set null,
    reviewed_by uuid references public.users(id) on delete set null,
    reviewed_at timestamptz,
    admin_comment text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_payment_correction_requests_one_pending_type
    on public.payment_correction_requests (payment_id, correction_type)
    where status = 'pending';

create index if not exists idx_payment_correction_requests_company_status
    on public.payment_correction_requests (company_id, status, created_at desc);

create index if not exists idx_payment_correction_requests_office_status
    on public.payment_correction_requests (office_id, status, created_at desc);

create index if not exists idx_payment_correction_requests_payment
    on public.payment_correction_requests (payment_id, created_at desc);

create index if not exists idx_payment_correction_requests_type_status
    on public.payment_correction_requests (correction_type, status, created_at desc);

create or replace function public.ddumba_touch_payment_correction_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_payment_correction_requests_updated_at on public.payment_correction_requests;
create trigger trg_payment_correction_requests_updated_at
before update on public.payment_correction_requests
for each row execute function public.ddumba_touch_payment_correction_requests_updated_at();

alter table public.payment_correction_requests enable row level security;

drop policy if exists payment_correction_requests_read on public.payment_correction_requests;
create policy payment_correction_requests_read
on public.payment_correction_requests
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

drop policy if exists payment_correction_requests_insert on public.payment_correction_requests;
create policy payment_correction_requests_insert
on public.payment_correction_requests
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

drop policy if exists payment_correction_requests_admin_update on public.payment_correction_requests;
create policy payment_correction_requests_admin_update
on public.payment_correction_requests
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
