-- Phase  performance hardening: additive indexes and lightweight summary cache.
-- Safe rules: no drops, no deletes, no destructive rewrites.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_rooms_company_office
    on public.rooms(company_id, office_id);

create index if not exists idx_rooms_company_landlord
    on public.rooms(company_id, landlord_id);

create index if not exists idx_rooms_company_office_landlord
    on public.rooms(company_id, office_id, landlord_id);

create index if not exists idx_rooms_company_property
    on public.rooms(company_id, property_id);

create index if not exists idx_rooms_company_status
    on public.rooms(company_id, status);

create index if not exists idx_rooms_company_landlord_status
    on public.rooms(company_id, landlord_id, status);

create index if not exists idx_rooms_company_office_room_number_norm
    on public.rooms(company_id, office_id, (lower(trim(room_number))));

create index if not exists idx_rooms_company_room_number_trgm
    on public.rooms using gin (room_number gin_trgm_ops);

create index if not exists idx_tenants_company_office
    on public.tenants(company_id, office_id);

create index if not exists idx_tenants_company_room
    on public.tenants(company_id, room_id);

create index if not exists idx_tenants_company_phone
    on public.tenants(company_id, phone);

create index if not exists idx_tenants_company_name_norm
    on public.tenants(company_id, (lower(trim(full_name))));

create index if not exists idx_tenants_name_trgm
    on public.tenants using gin (full_name gin_trgm_ops);

create index if not exists idx_tenants_phone_trgm
    on public.tenants using gin (phone gin_trgm_ops);

create index if not exists idx_landlords_company_name_norm
    on public.landlords(company_id, (lower(trim(full_name))));

create index if not exists idx_landlords_name_trgm
    on public.landlords using gin (full_name gin_trgm_ops);

create index if not exists idx_landlords_company_phone
    on public.landlords(company_id, phone);

create index if not exists idx_landlords_phone_trgm
    on public.landlords using gin (phone gin_trgm_ops);

create index if not exists idx_properties_company_office
    on public.properties(company_id, office_id);

create index if not exists idx_properties_company_landlord
    on public.properties(company_id, landlord_id);

create index if not exists idx_properties_name_trgm
    on public.properties using gin (coalesce(property_name, name, village, address) gin_trgm_ops);

create index if not exists idx_leases_company_tenant_status
    on public.leases(company_id, tenant_id, status);

create index if not exists idx_leases_company_room_status
    on public.leases(company_id, room_id, status);

create index if not exists idx_leases_company_office_status
    on public.leases(company_id, office_id, status);

create index if not exists idx_collections_company_office_paid_at
    on public.collections(company_id, office_id, paid_at desc);

create index if not exists idx_collections_company_tenant_paid_at
    on public.collections(company_id, tenant_id, paid_at desc);

create index if not exists idx_collections_company_room_paid_at
    on public.collections(company_id, room_id, paid_at desc);

create index if not exists idx_collections_company_landlord_paid_at
    on public.collections(company_id, landlord_id, paid_at desc);

create index if not exists idx_promises_company_office_status_date
    on public.promises(company_id, office_id, status, promised_date);

create index if not exists idx_promises_company_tenant_status_date
    on public.promises(company_id, tenant_id, status, promised_date);

create index if not exists idx_expenses_company_office_date
    on public.expenses(company_id, office_id, expense_date desc);

create index if not exists idx_expenses_company_property_date
    on public.expenses(company_id, property_id, expense_date desc);

create index if not exists idx_landlord_payments_company_office_paid_at
    on public.landlord_payments(company_id, office_id, paid_at desc);

create index if not exists idx_landlord_payments_company_landlord_paid_at
    on public.landlord_payments(company_id, landlord_id, paid_at desc);

create index if not exists idx_landlord_settlements_company_landlord_month
    on public.landlord_settlements(company_id, landlord_id, settlement_month desc);

create index if not exists idx_landlord_monthly_settlement_drafts_landlord_month
    on public.landlord_monthly_settlement_drafts(company_id, landlord_id, settlement_month desc);

create index if not exists idx_vacated_tenant_debts_company_landlord_status
    on public.vacated_tenant_debts(company_id, landlord_id, recovery_status);

create index if not exists idx_landlord_debt_deductions_company_landlord_status
    on public.landlord_debt_deductions(company_id, landlord_id, status);

create index if not exists idx_attendance_events_company_office_event_time
    on public.attendance_events(company_id, office_id, event_time desc);

create index if not exists idx_office_daily_reports_company_office_report_date
    on public.office_daily_reports(company_id, office_id, report_date desc);

create table if not exists public.landlord_portfolio_summaries (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    rooms_count integer not null default 0,
    occupied_rooms integer not null default 0,
    vacant_rooms integer not null default 0,
    rent_roll numeric not null default 0,
    collected_this_month numeric not null default 0,
    outstanding_balance numeric not null default 0,
    recovery_deductions numeric not null default 0,
    landlord_net_payable_estimate numeric not null default 0,
    commission_rate numeric not null default 0,
    summary_month date not null default date_trunc('month', now())::date,
    updated_at timestamptz not null default now(),
    unique(company_id, landlord_id, office_id, summary_month)
);

create index if not exists idx_landlord_portfolio_summaries_scope
    on public.landlord_portfolio_summaries(company_id, office_id, summary_month desc);

create index if not exists idx_landlord_portfolio_summaries_landlord
    on public.landlord_portfolio_summaries(company_id, landlord_id, summary_month desc);

alter table public.landlord_portfolio_summaries enable row level security;

drop policy if exists landlord_portfolio_summaries_office_read on public.landlord_portfolio_summaries;
create policy landlord_portfolio_summaries_office_read
on public.landlord_portfolio_summaries
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists landlord_portfolio_summaries_admin_write on public.landlord_portfolio_summaries;
create policy landlord_portfolio_summaries_admin_write
on public.landlord_portfolio_summaries
for all
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
)
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
);
