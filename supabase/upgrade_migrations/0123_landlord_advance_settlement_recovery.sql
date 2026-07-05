-- Phase 33: Landlord advance payment, vacant room exclusions, and recovery deductions.
-- Additive only: no drops, no truncates, no destructive changes.

alter table public.landlord_settlements
    add column if not exists office_id uuid references public.offices(id) on delete set null,
    add column if not exists settlement_month date,
    add column if not exists occupied_rooms_count integer not null default 0,
    add column if not exists vacant_rooms_count integer not null default 0,
    add column if not exists expected_gross_rent numeric not null default 0,
    add column if not exists company_commission_rate numeric not null default 10,
    add column if not exists company_commission_amount numeric not null default 0,
    add column if not exists landlord_gross_payable numeric not null default 0,
    add column if not exists previous_unrecovered_debts numeric not null default 0,
    add column if not exists empty_room_deductions numeric not null default 0,
    add column if not exists vacated_tenant_debt_deductions numeric not null default 0,
    add column if not exists carried_forward_recovery_balance numeric not null default 0,
    add column if not exists prepared_by uuid references public.users(id) on delete set null,
    add column if not exists prepared_at timestamptz default now(),
    add column if not exists payment_status text not null default 'pending',
    add column if not exists report_notes text;

alter table public.landlord_settlement_lines
    add column if not exists line_category text,
    add column if not exists is_payable boolean not null default true,
    add column if not exists reason text,
    add column if not exists month_applied date;

alter table public.landlord_debt_deductions
    add column if not exists advance_payment_month date,
    add column if not exists vacate_date date,
    add column if not exists reason text,
    add column if not exists carried_forward_amount numeric not null default 0;

create table if not exists public.landlord_monthly_settlement_drafts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    settlement_month date not null,
    expected_gross_rent numeric not null default 0,
    occupied_rooms_count integer not null default 0,
    vacant_rooms_count integer not null default 0,
    company_commission_rate numeric not null default 10,
    company_commission_amount numeric not null default 0,
    landlord_gross_payable numeric not null default 0,
    total_deductions numeric not null default 0,
    recovery_deductions numeric not null default 0,
    empty_room_deductions numeric not null default 0,
    net_payable numeric not null default 0,
    carried_forward_recovery_balance numeric not null default 0,
    status text not null default 'pending_approval',
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, office_id, landlord_id, settlement_month)
);

create index if not exists idx_landlord_settlements_office_month on public.landlord_settlements(office_id, settlement_month);
create index if not exists idx_landlord_settlement_lines_category on public.landlord_settlement_lines(settlement_id, line_category);
create index if not exists idx_landlord_debt_deductions_advance_month on public.landlord_debt_deductions(landlord_id, advance_payment_month, status);
create index if not exists idx_landlord_monthly_settlement_drafts_scope on public.landlord_monthly_settlement_drafts(company_id, office_id, settlement_month);

alter table public.landlord_monthly_settlement_drafts enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_monthly_settlement_drafts' and policyname = 'landlord_monthly_settlement_drafts_office_scope_select') then
        create policy landlord_monthly_settlement_drafts_office_scope_select on public.landlord_monthly_settlement_drafts
            for select using (
                company_id = public.ddumba_v1_current_company_id()
                and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landlord_monthly_settlement_drafts' and policyname = 'landlord_monthly_settlement_drafts_office_scope_write') then
        create policy landlord_monthly_settlement_drafts_office_scope_write on public.landlord_monthly_settlement_drafts
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
