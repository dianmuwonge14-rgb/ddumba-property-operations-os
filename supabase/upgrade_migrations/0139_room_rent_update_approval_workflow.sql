-- Phase 139: Room rent update approval workflow and admin room search.
-- Additive only. No data reset, no deletes, and no rent changes outside approved/admin actions.

create table if not exists public.room_rent_change_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    property_id uuid references public.properties(id) on delete set null,
    room_id uuid not null references public.rooms(id) on delete cascade,
    landlord_id uuid references public.landlords(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    old_rent numeric(14, 2) not null default 0,
    new_rent numeric(14, 2) not null,
    reason text not null,
    effective_date date not null,
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'direct_admin_change')),
    admin_comment text,
    requested_by uuid references public.users(id) on delete set null,
    decided_by uuid references public.users(id) on delete set null,
    decided_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table if exists public.notifications
    add column if not exists entity_type text,
    add column if not exists entity_id uuid,
    add column if not exists severity text default 'information',
    add column if not exists action_url text;

create index if not exists idx_room_rent_change_requests_company_status
    on public.room_rent_change_requests (company_id, status, created_at desc);

create index if not exists idx_room_rent_change_requests_office_status
    on public.room_rent_change_requests (office_id, status, created_at desc);

create index if not exists idx_room_rent_change_requests_room_created
    on public.room_rent_change_requests (room_id, created_at desc);

create index if not exists idx_room_rent_change_requests_requester
    on public.room_rent_change_requests (requested_by, created_at desc);

create or replace function public.ddumba_touch_room_rent_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_room_rent_change_requests_updated_at on public.room_rent_change_requests;
create trigger trg_room_rent_change_requests_updated_at
before update on public.room_rent_change_requests
for each row execute function public.ddumba_touch_room_rent_change_requests_updated_at();

alter table public.room_rent_change_requests enable row level security;

drop policy if exists room_rent_change_requests_read on public.room_rent_change_requests;
create policy room_rent_change_requests_read
on public.room_rent_change_requests
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists room_rent_change_requests_insert on public.room_rent_change_requests;
create policy room_rent_change_requests_insert
on public.room_rent_change_requests
for insert
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists room_rent_change_requests_admin_update on public.room_rent_change_requests;
create policy room_rent_change_requests_admin_update
on public.room_rent_change_requests
for update
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
