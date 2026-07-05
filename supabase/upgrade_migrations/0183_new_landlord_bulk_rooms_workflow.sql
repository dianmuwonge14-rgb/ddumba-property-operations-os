-- New Landlord + Bulk Rooms workflow from Properties.
-- Additive only: office submissions stay pending until admin approval; admin direct saves write live records.

create table if not exists public.landlord_bulk_room_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    requested_by uuid references public.users(id) on delete set null,
    reviewed_by uuid references public.users(id) on delete set null,
    reviewed_at timestamptz,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    landlord_payload jsonb not null default '{}'::jsonb,
    rooms_payload jsonb not null default '[]'::jsonb,
    summary jsonb not null default '{}'::jsonb,
    created_landlord_id uuid references public.landlords(id) on delete set null,
    admin_comment text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_landlord_bulk_room_requests_scope
    on public.landlord_bulk_room_requests(company_id, office_id, status, created_at desc);

alter table public.landlord_bulk_room_requests enable row level security;

drop policy if exists landlord_bulk_room_requests_admin_all on public.landlord_bulk_room_requests;
create policy landlord_bulk_room_requests_admin_all
on public.landlord_bulk_room_requests
for all
using (
    public.ddumba_v1_is_service_role()
    or (landlord_bulk_room_requests.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
)
with check (
    public.ddumba_v1_is_service_role()
    or (landlord_bulk_room_requests.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
);

drop policy if exists landlord_bulk_room_requests_office_read_insert on public.landlord_bulk_room_requests;
drop policy if exists landlord_bulk_room_requests_office_select on public.landlord_bulk_room_requests;
create policy landlord_bulk_room_requests_office_select
on public.landlord_bulk_room_requests
for select
using (
    landlord_bulk_room_requests.company_id = public.ddumba_v1_current_company_id()
    and public.ddumba_v1_can_access_office(landlord_bulk_room_requests.office_id)
);

drop policy if exists landlord_bulk_room_requests_office_insert on public.landlord_bulk_room_requests;
create policy landlord_bulk_room_requests_office_insert
on public.landlord_bulk_room_requests
for insert
with check (
    landlord_bulk_room_requests.company_id = public.ddumba_v1_current_company_id()
    and public.ddumba_v1_can_access_office(landlord_bulk_room_requests.office_id)
    and landlord_bulk_room_requests.status = 'pending'
);
