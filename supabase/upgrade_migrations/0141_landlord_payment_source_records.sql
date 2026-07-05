-- Store imported landlord payment/cut workbook values as a live auditable source.
-- Additive only: no drops, no resets, no destructive changes.

create table if not exists public.landlord_payment_source_records (
    id uuid primary key default gen_random_uuid(),
    import_batch_id uuid not null default gen_random_uuid(),
    company_id uuid references public.companies(id) on delete cascade,
    landlord_id uuid references public.landlords(id) on delete set null,
    office_id uuid references public.offices(id) on delete set null,
    landlord_name text not null,
    normalized_landlord_name text not null,
    office_name text,
    settlement_month date not null,
    source_portfolio_gross numeric not null default 0,
    source_commission numeric not null default 0,
    source_commission_percentage numeric not null default 0,
    source_net_payable numeric not null default 0,
    paid_unpaid_marker text,
    active boolean not null default true,
    source_file_name text not null,
    source_sheet_name text,
    source_row_number integer,
    raw_data jsonb not null default '{}'::jsonb,
    imported_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_landlord_payment_source_records_landlord
    on public.landlord_payment_source_records(company_id, landlord_id, settlement_month, active, imported_at desc);

create index if not exists idx_landlord_payment_source_records_normalized_name
    on public.landlord_payment_source_records(company_id, normalized_landlord_name);

create index if not exists idx_landlord_payment_source_records_import_batch
    on public.landlord_payment_source_records(import_batch_id);

create unique index if not exists idx_landlord_payment_source_records_one_active
    on public.landlord_payment_source_records(company_id, landlord_id, settlement_month)
    where active = true and landlord_id is not null;

alter table public.landlord_payment_source_records enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'landlord_payment_source_records'
          and policyname = 'landlord_payment_source_records_office_scope_select'
    ) then
        create policy landlord_payment_source_records_office_scope_select
            on public.landlord_payment_source_records
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (
                    public.ddumba_v1_is_company_admin()
                    or office_id is null
                    or public.ddumba_v1_can_access_office(office_id)
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'landlord_payment_source_records'
          and policyname = 'landlord_payment_source_records_admin_write'
    ) then
        create policy landlord_payment_source_records_admin_write
            on public.landlord_payment_source_records
            for all using (
                company_id = public.ddumba_v1_current_company_id()
                and public.ddumba_v1_is_company_admin()
            )
            with check (
                company_id = public.ddumba_v1_current_company_id()
                and public.ddumba_v1_is_company_admin()
            );
    end if;
end $$;
