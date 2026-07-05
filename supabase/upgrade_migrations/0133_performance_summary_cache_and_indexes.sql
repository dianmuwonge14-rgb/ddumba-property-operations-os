-- Phase: Performance emergency pass.
-- Additive only. No drops, deletes, truncates, resets, or data rewrites.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_perf_rooms_landlord_id
    on public.rooms(landlord_id);

create index if not exists idx_perf_rooms_office_id
    on public.rooms(office_id);

create index if not exists idx_perf_rooms_status
    on public.rooms(status);

create index if not exists idx_perf_rooms_room_number
    on public.rooms(room_number);

create index if not exists idx_perf_rooms_landlord_status
    on public.rooms(landlord_id, status);

create index if not exists idx_perf_rooms_office_landlord
    on public.rooms(office_id, landlord_id);

create index if not exists idx_perf_rooms_office_room_number_norm
    on public.rooms(office_id, lower(trim(room_number)));

create index if not exists idx_perf_tenants_room_id
    on public.tenants(room_id);

create index if not exists idx_perf_tenants_office_id
    on public.tenants(office_id);

create index if not exists idx_perf_collections_tenant_id
    on public.collections(tenant_id);

create index if not exists idx_perf_collections_office_id
    on public.collections(office_id);

create index if not exists idx_perf_collections_office_paid_at
    on public.collections(office_id, paid_at desc);

create index if not exists idx_perf_collections_room_paid_at
    on public.collections(room_id, paid_at desc);

create index if not exists idx_perf_landlord_settlements_landlord_id
    on public.landlord_settlements(landlord_id);

create index if not exists idx_perf_landlord_settlements_landlord_month
    on public.landlord_settlements(landlord_id, settlement_month desc);

do $$
begin
    if to_regclass('public.landlord_commission_settings') is not null then
        execute 'create index if not exists idx_perf_landlord_commission_settings_landlord_id on public.landlord_commission_settings(landlord_id)';
    end if;
    if to_regclass('public.landlord_room_assignments') is not null then
        execute 'create index if not exists idx_perf_landlord_room_assignments_landlord_id on public.landlord_room_assignments(landlord_id)';
    end if;
end $$;

create table if not exists public.landlord_summary (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    summary_month date not null default date_trunc('month', now())::date,
    room_count integer not null default 0,
    occupied_room_count integer not null default 0,
    vacant_room_count integer not null default 0,
    rent_roll numeric(14,2) not null default 0,
    commission_mode text not null default 'portfolio_based',
    commission_percentage numeric(7,4) not null default 0,
    commission_amount numeric(14,2) not null default 0,
    landlord_net_payable numeric(14,2) not null default 0,
    recovery_deductions numeric(14,2) not null default 0,
    outstanding_balances numeric(14,2) not null default 0,
    collected_this_month numeric(14,2) not null default 0,
    updated_at timestamptz not null default now(),
    unique(company_id, landlord_id, office_id, summary_month)
);

create table if not exists public.landlord_room_summary (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete cascade,
    landlord_id uuid references public.landlords(id) on delete cascade,
    room_id uuid not null references public.rooms(id) on delete cascade,
    summary_month date not null default date_trunc('month', now())::date,
    room_number text,
    status text,
    monthly_rent numeric(14,2) not null default 0,
    outstanding_balance numeric(14,2) not null default 0,
    collected_this_month numeric(14,2) not null default 0,
    payable_this_month boolean not null default true,
    updated_at timestamptz not null default now(),
    unique(company_id, room_id, summary_month)
);

create table if not exists public.office_finance_summary (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    summary_month date not null default date_trunc('month', now())::date,
    room_count integer not null default 0,
    rent_roll numeric(14,2) not null default 0,
    commission_amount numeric(14,2) not null default 0,
    landlord_net_payable numeric(14,2) not null default 0,
    recovery_deductions numeric(14,2) not null default 0,
    outstanding_balances numeric(14,2) not null default 0,
    collected_this_month numeric(14,2) not null default 0,
    updated_at timestamptz not null default now(),
    unique(company_id, office_id, summary_month)
);

create table if not exists public.company_finance_summary (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    summary_month date not null default date_trunc('month', now())::date,
    room_count integer not null default 0,
    rent_roll numeric(14,2) not null default 0,
    commission_amount numeric(14,2) not null default 0,
    landlord_net_payable numeric(14,2) not null default 0,
    recovery_deductions numeric(14,2) not null default 0,
    outstanding_balances numeric(14,2) not null default 0,
    collected_this_month numeric(14,2) not null default 0,
    updated_at timestamptz not null default now(),
    unique(company_id, summary_month)
);

create table if not exists public.monthly_settlement_summary (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete cascade,
    landlord_id uuid references public.landlords(id) on delete cascade,
    settlement_month date not null default date_trunc('month', now())::date,
    room_count integer not null default 0,
    rent_roll numeric(14,2) not null default 0,
    commission_mode text not null default 'portfolio_based',
    commission_percentage numeric(7,4) not null default 0,
    commission_amount numeric(14,2) not null default 0,
    recovery_deductions numeric(14,2) not null default 0,
    landlord_net_payable numeric(14,2) not null default 0,
    collected_this_month numeric(14,2) not null default 0,
    updated_at timestamptz not null default now(),
    unique(company_id, landlord_id, office_id, settlement_month)
);

create index if not exists idx_landlord_summary_scope
    on public.landlord_summary(company_id, office_id, summary_month desc);

create index if not exists idx_landlord_summary_landlord
    on public.landlord_summary(company_id, landlord_id, summary_month desc);

create index if not exists idx_landlord_room_summary_landlord
    on public.landlord_room_summary(company_id, landlord_id, summary_month desc);

create index if not exists idx_office_finance_summary_scope
    on public.office_finance_summary(company_id, office_id, summary_month desc);

create index if not exists idx_company_finance_summary_scope
    on public.company_finance_summary(company_id, summary_month desc);

create index if not exists idx_monthly_settlement_summary_landlord
    on public.monthly_settlement_summary(company_id, landlord_id, settlement_month desc);

alter table public.landlord_summary enable row level security;
alter table public.landlord_room_summary enable row level security;
alter table public.office_finance_summary enable row level security;
alter table public.company_finance_summary enable row level security;
alter table public.monthly_settlement_summary enable row level security;

do $$
declare
    t text;
begin
    foreach t in array array[
        'landlord_summary',
        'landlord_room_summary',
        'office_finance_summary',
        'monthly_settlement_summary'
    ]
    loop
        execute format('drop policy if exists %I_read on public.%I', t, t);
        execute format(
            'create policy %I_read on public.%I for select using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin() or office_id is null or public.ddumba_v1_can_access_office(office_id))',
            t,
            t
        );
        execute format('drop policy if exists %I_admin_write on public.%I', t, t);
        execute format(
            'create policy %I_admin_write on public.%I for all using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin()) with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())',
            t,
            t
        );
    end loop;

    drop policy if exists company_finance_summary_read on public.company_finance_summary;
    create policy company_finance_summary_read
    on public.company_finance_summary
    for select
    using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

    drop policy if exists company_finance_summary_admin_write on public.company_finance_summary;
    create policy company_finance_summary_admin_write
    on public.company_finance_summary
    for all
    using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
    with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
end $$;
