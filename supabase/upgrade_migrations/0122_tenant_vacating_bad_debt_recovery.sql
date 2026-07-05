-- Phase 32: Tenant vacating and bad debt recovery from landlords.
-- Additive only: no drops, no truncates, no destructive changes.

alter table public.tenants
    add column if not exists vacated_at timestamptz,
    add column if not exists vacated_reason text,
    add column if not exists vacated_by uuid,
    add column if not exists previous_room_id uuid;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'tenants_vacated_by_fkey'
    ) then
        alter table public.tenants
            add constraint tenants_vacated_by_fkey foreign key (vacated_by) references public.users(id) on delete set null;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'tenants_previous_room_id_fkey'
    ) then
        alter table public.tenants
            add constraint tenants_previous_room_id_fkey foreign key (previous_room_id) references public.rooms(id) on delete set null;
    end if;
end $$;

create table if not exists public.tenant_exit_records (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    lease_id uuid references public.leases(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    property_id uuid references public.properties(id) on delete set null,
    landlord_id uuid references public.landlords(id) on delete set null,
    processed_by uuid references public.users(id) on delete set null,
    tenant_name text,
    tenant_phone text,
    room_number text,
    property_name text,
    landlord_name text,
    office_name text,
    vacate_date date not null,
    final_outstanding_balance numeric not null default 0,
    cleared_balance boolean not null default false,
    exit_type text not null default 'vacated',
    reason_notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.vacated_tenant_debts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    tenant_exit_record_id uuid not null references public.tenant_exit_records(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    lease_id uuid references public.leases(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    property_id uuid references public.properties(id) on delete set null,
    landlord_id uuid references public.landlords(id) on delete set null,
    tenant_name text,
    tenant_phone text,
    room_number text,
    property_name text,
    landlord_name text,
    office_name text,
    original_amount numeric not null default 0,
    recovered_amount numeric not null default 0,
    remaining_amount numeric not null default 0,
    recovery_status text not null default 'pending',
    notes text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.landlord_debt_deductions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    landlord_id uuid references public.landlords(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    property_id uuid references public.properties(id) on delete set null,
    vacated_tenant_debt_id uuid not null references public.vacated_tenant_debts(id) on delete cascade,
    settlement_id uuid references public.landlord_settlements(id) on delete set null,
    tenant_name text,
    room_number text,
    property_name text,
    landlord_name text,
    office_name text,
    amount numeric not null default 0,
    applied_amount numeric not null default 0,
    status text not null default 'pending',
    applied_at timestamptz,
    notes text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_exit_records_company_office on public.tenant_exit_records(company_id, office_id);
create index if not exists idx_tenant_exit_records_tenant on public.tenant_exit_records(tenant_id);
create index if not exists idx_tenant_exit_records_landlord on public.tenant_exit_records(landlord_id);
create index if not exists idx_tenant_exit_records_vacate_date on public.tenant_exit_records(vacate_date);

create index if not exists idx_vacated_tenant_debts_company_office on public.vacated_tenant_debts(company_id, office_id);
create index if not exists idx_vacated_tenant_debts_landlord_status on public.vacated_tenant_debts(landlord_id, recovery_status);
create index if not exists idx_vacated_tenant_debts_tenant on public.vacated_tenant_debts(tenant_id);

create index if not exists idx_landlord_debt_deductions_company_office on public.landlord_debt_deductions(company_id, office_id);
create index if not exists idx_landlord_debt_deductions_landlord_status on public.landlord_debt_deductions(landlord_id, status);
create index if not exists idx_landlord_debt_deductions_debt on public.landlord_debt_deductions(vacated_tenant_debt_id);

alter table public.tenant_exit_records enable row level security;
alter table public.vacated_tenant_debts enable row level security;
alter table public.landlord_debt_deductions enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_exit_records' and policyname = 'tenant_exit_records_office_scope_select') then
        create policy tenant_exit_records_office_scope_select on public.tenant_exit_records
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_exit_records' and policyname = 'tenant_exit_records_office_scope_write') then
        create policy tenant_exit_records_office_scope_write on public.tenant_exit_records
            for all using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            )
            with check (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vacated_tenant_debts' and policyname = 'vacated_tenant_debts_office_scope_select') then
        create policy vacated_tenant_debts_office_scope_select on public.vacated_tenant_debts
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vacated_tenant_debts' and policyname = 'vacated_tenant_debts_office_scope_write') then
        create policy vacated_tenant_debts_office_scope_write on public.vacated_tenant_debts
            for all using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            )
            with check (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_debt_deductions' and policyname = 'landlord_debt_deductions_office_scope_select') then
        create policy landlord_debt_deductions_office_scope_select on public.landlord_debt_deductions
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_debt_deductions' and policyname = 'landlord_debt_deductions_office_scope_write') then
        create policy landlord_debt_deductions_office_scope_write on public.landlord_debt_deductions
            for all using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            )
            with check (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;
end $$;
