-- Landlord portfolio source audit from master workbook.
-- Additive only. No destructive statements.

create table if not exists public.landlord_portfolio_source_rooms (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    source_file text not null,
    source_sheet text not null,
    source_row_number integer not null,
    room_number text not null,
    landlord_name text not null,
    office_name text,
    property_name text,
    phone text,
    monthly_rent numeric(14,2) not null default 0,
    occupancy_status text,
    raw_data jsonb not null default '{}'::jsonb,
    imported_at timestamptz not null default now(),
    unique(company_id, source_file, source_sheet, source_row_number)
);

create table if not exists public.landlord_portfolio_audit_repairs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    source_room_id uuid references public.landlord_portfolio_source_rooms(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    previous_landlord_id uuid references public.landlords(id) on delete set null,
    new_landlord_id uuid references public.landlords(id) on delete set null,
    repair_type text not null,
    confidence integer not null default 0,
    reason text,
    repaired_by uuid,
    repaired_at timestamptz not null default now()
);

create index if not exists idx_landlord_portfolio_source_rooms_room
    on public.landlord_portfolio_source_rooms(company_id, lower(trim(room_number)));

create index if not exists idx_landlord_portfolio_source_rooms_landlord
    on public.landlord_portfolio_source_rooms(company_id, lower(trim(landlord_name)));

create index if not exists idx_landlord_portfolio_audit_repairs_company
    on public.landlord_portfolio_audit_repairs(company_id, repaired_at desc);

alter table public.landlord_portfolio_source_rooms enable row level security;
alter table public.landlord_portfolio_audit_repairs enable row level security;

drop policy if exists landlord_portfolio_source_rooms_admin_v1 on public.landlord_portfolio_source_rooms;
create policy landlord_portfolio_source_rooms_admin_v1
on public.landlord_portfolio_source_rooms
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
);

drop policy if exists landlord_portfolio_audit_repairs_admin_v1 on public.landlord_portfolio_audit_repairs;
create policy landlord_portfolio_audit_repairs_admin_v1
on public.landlord_portfolio_audit_repairs
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission('settings.manage'))
    )
);
