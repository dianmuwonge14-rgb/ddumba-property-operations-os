-- Monthly landlord payable ledger and unpaid landlord reports.
-- Additive only: no drops, no truncates, no destructive changes.

create table if not exists public.landlord_monthly_payables (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    settlement_id uuid references public.landlord_settlements(id) on delete set null,
    settlement_month date not null,
    landlord_name text,
    office_name text,
    full_rent_roll numeric not null default 0,
    commission_mode text not null default 'portfolio_based',
    commission_percentage numeric not null default 0,
    commission_amount numeric not null default 0,
    vacant_room_deductions numeric not null default 0,
    vacated_tenant_debt_deductions numeric not null default 0,
    advance_deductions numeric not null default 0,
    other_deductions numeric not null default 0,
    net_payable numeric not null default 0,
    amount_paid numeric not null default 0,
    unpaid_balance numeric not null default 0,
    status text not null default 'unpaid',
    reasons_notes text,
    last_paid_at timestamptz,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, office_id, landlord_id, settlement_month)
);

create table if not exists public.landlord_monthly_payable_payments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    monthly_payable_id uuid not null references public.landlord_monthly_payables(id) on delete cascade,
    settlement_id uuid references public.landlord_settlements(id) on delete set null,
    amount numeric not null default 0,
    payment_method text,
    reference text,
    notes text,
    paid_by uuid references public.users(id) on delete set null,
    paid_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_landlord_monthly_payables_company_status
    on public.landlord_monthly_payables(company_id, status, settlement_month);

create index if not exists idx_landlord_monthly_payables_landlord_month
    on public.landlord_monthly_payables(company_id, landlord_id, settlement_month desc);

create index if not exists idx_landlord_monthly_payables_office_status
    on public.landlord_monthly_payables(company_id, office_id, status, settlement_month);

create index if not exists idx_landlord_monthly_payable_payments_scope
    on public.landlord_monthly_payable_payments(company_id, office_id, landlord_id, paid_at desc);

alter table public.landlord_monthly_payables enable row level security;
alter table public.landlord_monthly_payable_payments enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_monthly_payables' and policyname = 'landlord_monthly_payables_office_scope_select') then
        create policy landlord_monthly_payables_office_scope_select on public.landlord_monthly_payables
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_monthly_payables' and policyname = 'landlord_monthly_payables_office_scope_write') then
        create policy landlord_monthly_payables_office_scope_write on public.landlord_monthly_payables
            for all using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            )
            with check (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_monthly_payable_payments' and policyname = 'landlord_monthly_payable_payments_office_scope_select') then
        create policy landlord_monthly_payable_payments_office_scope_select on public.landlord_monthly_payable_payments
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_monthly_payable_payments' and policyname = 'landlord_monthly_payable_payments_office_scope_write') then
        create policy landlord_monthly_payable_payments_office_scope_write on public.landlord_monthly_payable_payments
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
