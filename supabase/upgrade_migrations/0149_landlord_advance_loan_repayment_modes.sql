-- Phase 149: Principal-based landlord advance / loan repayment modes.
-- Additive only. Existing advances and repayment schedules remain intact.

alter table public.landlord_advances
    add column if not exists repayment_type text not null default 'simple_advance',
    add column if not exists interest_calculation_mode text not null default 'none',
    add column if not exists fixed_interest_amount numeric(14,2) not null default 0,
    add column if not exists deduction_end_date date,
    add column if not exists principal_clearance_method text not null default 'deducted_monthly',
    add column if not exists remaining_principal_balance numeric(14,2) not null default 0,
    add column if not exists remaining_interest_balance numeric(14,2) not null default 0,
    add column if not exists remaining_total_balance numeric(14,2) not null default 0,
    add column if not exists principal_cleared_at timestamptz,
    add column if not exists principal_cleared_by uuid references public.users(id) on delete set null;

alter table public.landlord_advances
    drop constraint if exists landlord_advances_repayment_type_check,
    add constraint landlord_advances_repayment_type_check
    check (repayment_type in ('simple_advance', 'principal_fixed_interest', 'declining_balance_interest', 'interest_only', 'custom'));

alter table public.landlord_advances
    drop constraint if exists landlord_advances_interest_calculation_mode_check,
    add constraint landlord_advances_interest_calculation_mode_check
    check (interest_calculation_mode in ('none', 'fixed_principal', 'declining_balance', 'interest_only'));

alter table public.landlord_advances
    drop constraint if exists landlord_advances_principal_clearance_method_check,
    add constraint landlord_advances_principal_clearance_method_check
    check (principal_clearance_method in ('deducted_monthly', 'paid_separately', 'cleared_manually'));

update public.landlord_advances
set
    repayment_type = case
        when repayment_type is null or repayment_type = '' then 'simple_advance'
        else repayment_type
    end,
    interest_calculation_mode = case
        when interest_calculation_mode is null or interest_calculation_mode = '' then
            case when interest_type in ('fixed', 'percentage') then 'fixed_principal' else 'none' end
        else interest_calculation_mode
    end,
    fixed_interest_amount = case when coalesce(fixed_interest_amount, 0) <= 0 and interest_type = 'fixed' then coalesce(interest_amount, 0) else fixed_interest_amount end,
    principal_clearance_method = coalesce(nullif(principal_clearance_method, ''), 'deducted_monthly'),
    remaining_principal_balance = case when coalesce(remaining_principal_balance, 0) <= 0 then greatest(coalesce(principal_amount, advance_amount, 0) - greatest(coalesce(deducted_amount, 0) - coalesce(interest_amount, 0), 0), 0) else remaining_principal_balance end,
    remaining_interest_balance = case when coalesce(remaining_interest_balance, 0) <= 0 then greatest(coalesce(interest_amount, 0) - least(coalesce(deducted_amount, 0), coalesce(interest_amount, 0)), 0) else remaining_interest_balance end,
    remaining_total_balance = case when coalesce(remaining_total_balance, 0) <= 0 then greatest(coalesce(advance_amount, 0) - coalesce(deducted_amount, 0), 0) else remaining_total_balance end
where true;

alter table public.landlord_advance_repayment_schedule
    add column if not exists opening_principal_balance numeric(14,2) not null default 0,
    add column if not exists interest_charged numeric(14,2) not null default 0,
    add column if not exists closing_principal_balance numeric(14,2) not null default 0,
    add column if not exists remaining_total_balance numeric(14,2) not null default 0;

update public.landlord_advance_repayment_schedule
set
    opening_principal_balance = case when opening_principal_balance = 0 then opening_balance else opening_principal_balance end,
    interest_charged = case when interest_charged = 0 then interest_portion else interest_charged end,
    closing_principal_balance = case when closing_principal_balance = 0 then greatest(opening_balance - principal_portion, 0) else closing_principal_balance end,
    remaining_total_balance = case when remaining_total_balance = 0 then closing_balance else remaining_total_balance end
where true;

create table if not exists public.landlord_advance_principal_clearances (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    advance_id uuid not null references public.landlord_advances(id) on delete cascade,
    amount numeric(14,2) not null default 0,
    clearance_method text not null default 'cleared_manually',
    clearance_date date not null default current_date,
    reference text,
    notes text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint landlord_advance_principal_clearances_amount_check check (amount >= 0),
    constraint landlord_advance_principal_clearances_method_check check (clearance_method in ('paid_separately', 'cleared_manually', 'deducted_monthly'))
);

create table if not exists public.landlord_advance_interest_events (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    advance_id uuid not null references public.landlord_advances(id) on delete cascade,
    schedule_id uuid references public.landlord_advance_repayment_schedule(id) on delete set null,
    month_key date not null,
    opening_principal_balance numeric(14,2) not null default 0,
    interest_mode text not null default 'none',
    interest_rate numeric(8,4) not null default 0,
    interest_charged numeric(14,2) not null default 0,
    interest_recovered numeric(14,2) not null default 0,
    status text not null default 'projected',
    created_at timestamptz not null default now(),
    constraint landlord_advance_interest_events_status_check check (status in ('projected', 'charged', 'recovered', 'waived'))
);

create index if not exists idx_landlord_advances_loan_modes
    on public.landlord_advances(company_id, office_id, landlord_id, repayment_type, interest_calculation_mode, lifecycle_status);

create index if not exists idx_landlord_advance_principal_clearances_scope
    on public.landlord_advance_principal_clearances(company_id, office_id, landlord_id, advance_id, clearance_date desc);

create index if not exists idx_landlord_advance_interest_events_scope
    on public.landlord_advance_interest_events(company_id, office_id, landlord_id, advance_id, month_key, status);

alter table public.landlord_advance_principal_clearances enable row level security;
alter table public.landlord_advance_interest_events enable row level security;

drop policy if exists landlord_advance_principal_clearances_read on public.landlord_advance_principal_clearances;
create policy landlord_advance_principal_clearances_read
on public.landlord_advance_principal_clearances
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_advance_principal_clearances_admin_write on public.landlord_advance_principal_clearances;
create policy landlord_advance_principal_clearances_admin_write
on public.landlord_advance_principal_clearances
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

drop policy if exists landlord_advance_interest_events_read on public.landlord_advance_interest_events;
create policy landlord_advance_interest_events_read
on public.landlord_advance_interest_events
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_advance_interest_events_admin_write on public.landlord_advance_interest_events;
create policy landlord_advance_interest_events_admin_write
on public.landlord_advance_interest_events
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
